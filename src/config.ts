import { z } from "zod";

const envSchema = z.object({
  // Mercado Livre (obrigatório)
  ML_APP_ID: z.string().min(1),
  ML_CLIENT_SECRET: z.string().min(1),
  ML_REDIRECT_URI: z.string().url(),

  // Gateway
  GATEWAY_API_KEY: z.string().min(1),
  GATEWAY_PUBLIC_URL: z.string().url(),
  APP_NAME: z.string().default("ML Questions Gateway"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8000),

  // Feature flags
  FEATURE_WHATSAPP_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  FEATURE_AUTO_ANSWER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // IA (obrigatório no MVP — ADR-BIZ-001)
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  PRODUCT_CONTEXT_CACHE_TTL: z.coerce.number().int().positive().default(3600),

  // Persistência
  DATABASE_URL: z.string().default("file:./data/bot.db"),

  // Opcionais (pós-MVP / feature-flagged)
  REDIS_URL: z.string().optional(),
  Z_API_INSTANCE_ID: z.string().optional(),
  Z_API_TOKEN: z.string().optional(),
  Z_API_CLIENT_TOKEN: z.string().optional(),
  Z_API_NOTIFY_PHONE: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  HOTMART_WEBHOOK_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return result.data;
}
