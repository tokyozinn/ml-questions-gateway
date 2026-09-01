import type { Config } from "../config.js";
import type { MlClient } from "./mlClient.js";
import type { ProductContext } from "../types/product.js";
import {
  formatProductContext,
  productContextToPrompt,
} from "../types/product.js";

interface CacheEntry {
  context: ProductContext;
  expiresAt: number;
}

const ESCALATE_TOKEN = "__ESCALATE__";
const SENSITIVE_KEYWORDS = [
  "garantia",
  "devolu",
  "original",
  "réplica",
  "replica",
  "falso",
  "nota fiscal",
];

export class ProductContextService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly mlClient: MlClient,
    private readonly config: Config,
  ) {}

  async getContext(
    itemId: string,
    accessToken: string,
  ): Promise<ProductContext | null> {
    const cached = this.cache.get(itemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }

    try {
      const item = await this.mlClient.getItem(itemId, accessToken);
      const context = formatProductContext(item);

      this.cache.set(itemId, {
        context,
        expiresAt: Date.now() + this.config.PRODUCT_CONTEXT_CACHE_TTL * 1000,
      });

      return context;
    } catch {
      return null;
    }
  }
}

export type AnswerResult =
  | { type: "answer"; text: string }
  | { type: "escalate"; reason: "no_context" | "low_confidence" | "sensitive_category" };

export class AnswerEngine {
  constructor(private readonly config: Config) {}

  isSensitiveQuestion(questionText: string): boolean {
    const lower = questionText.toLowerCase();
    return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
  }

  hasSensitiveContext(context: ProductContext): boolean {
    const blob = [
      context.description,
      context.attributes,
      context.warranty ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return SENSITIVE_KEYWORDS.some((keyword) => blob.includes(keyword));
  }

  async generateAnswer(
    questionText: string,
    context: ProductContext,
  ): Promise<AnswerResult> {
    if (
      this.isSensitiveQuestion(questionText) &&
      !this.hasSensitiveContext(context)
    ) {
      return { type: "escalate", reason: "sensitive_category" };
    }

    const prompt = [
      "Contexto do produto:",
      productContextToPrompt(context),
      "",
      `Pergunta do comprador: ${questionText}`,
      "",
      "Instruções:",
      "- Responda APENAS com base no contexto acima.",
      "- Seja breve, cordial e objetivo.",
      "- Máximo 400 caracteres.",
      `- Se não houver informação suficiente, responda exatamente: ${ESCALATE_TOKEN}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.OPENAI_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de vendas do Mercado Livre. Responda perguntas de compradores usando somente o contexto do anúncio fornecido.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const raw = data.choices[0]?.message?.content?.trim() ?? "";

    if (!raw || raw.includes(ESCALATE_TOKEN)) {
      return { type: "escalate", reason: "low_confidence" };
    }

    return { type: "answer", text: raw.slice(0, 2000) };
  }
}
