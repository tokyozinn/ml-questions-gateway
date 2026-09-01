import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import { prisma } from "../db/client.js";
import type { NotificationPayload } from "../schemas/notification.js";
import { extractQuestionId } from "../schemas/notification.js";
import { AnswerEngine, ProductContextService } from "./answerEngine.js";
import type { MlClient } from "./mlClient.js";
import { saveEscalation, TokenManager } from "./tokenManager.js";

export class QuestionProcessor {
  private readonly tokenManager: TokenManager;
  private readonly productContext: ProductContextService;
  private readonly answerEngine: AnswerEngine;

  constructor(
    private readonly mlClient: MlClient,
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {
    this.tokenManager = new TokenManager(mlClient);
    this.productContext = new ProductContextService(mlClient, config);
    this.answerEngine = new AnswerEngine(config);
  }

  async process(payload: NotificationPayload): Promise<void> {
    if (payload.topic !== "questions") {
      this.log.info({ topic: payload.topic }, "Ignoring non-questions notification");
      return;
    }

    const questionId = extractQuestionId(payload.resource);
    if (!questionId) {
      this.log.warn({ resource: payload.resource }, "Could not extract question ID");
      return;
    }

    const sellerId = Number(payload.user_id);
    const tenant = await prisma.tenant.findFirst({
      where: { mlUserId: sellerId },
    });

    if (!tenant) {
      this.log.warn({ sellerId }, "Tenant not found for seller");
      return;
    }

    if (tenant.status !== "active") {
      this.log.info({ tenantId: tenant.id, status: tenant.status }, "Tenant not active");
      return;
    }

    const alreadyProcessed = await prisma.processedQuestion.findUnique({
      where: { questionId },
    });
    if (alreadyProcessed) {
      this.log.info({ questionId }, "Question already processed");
      return;
    }

    const accessToken = await this.tokenManager.ensureAccessToken(sellerId);
    if (!accessToken) {
      this.log.error({ sellerId }, "No valid access token");
      return;
    }

    const question = await this.mlClient.getQuestion(questionId, accessToken);

    if (question.status !== "UNANSWERED" || !question.text?.trim()) {
      this.log.info({ questionId, status: question.status }, "Question skipped");
      return;
    }

    if (
      !this.config.FEATURE_AUTO_ANSWER_ENABLED ||
      !tenant.autoAnswerEnabled
    ) {
      this.log.info({ questionId }, "Auto-answer disabled");
      return;
    }

    const context = await this.productContext.getContext(
      question.item_id,
      accessToken,
    );

    if (!context) {
      await saveEscalation({
        questionId,
        tenantId: tenant.id,
        itemId: question.item_id,
        questionText: question.text,
        reason: "item_fetch_failed",
      });
      this.log.warn({ questionId, itemId: question.item_id }, "Escalated: item fetch failed");
      return;
    }

    const result = await this.answerEngine.generateAnswer(
      question.text,
      context,
    );

    if (result.type === "escalate") {
      await saveEscalation({
        questionId,
        tenantId: tenant.id,
        itemId: question.item_id,
        questionText: question.text,
        reason: result.reason,
        productContextSnapshot: JSON.stringify(context).slice(0, 2000),
      });
      this.log.info({ questionId, reason: result.reason }, "Escalated to seller");
      return;
    }

    await this.mlClient.postAnswer(questionId, result.text, accessToken);

    await prisma.processedQuestion.create({
      data: {
        questionId,
        sellerId,
        itemId: question.item_id,
        questionText: question.text,
        answerText: result.text,
      },
    });

    this.log.info({ questionId }, "Question answered successfully");
  }
}
