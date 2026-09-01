import type { EscalationReason } from "@prisma/client";
import type { MlClient } from "./mlClient.js";
import { prisma } from "../db/client.js";

export class TokenManager {
  constructor(private readonly mlClient?: MlClient) {}

  async saveTokens(token: {
    user_id: number;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + token.expires_in;

    await prisma.oAuthToken.upsert({
      where: { userId: token.user_id },
      create: {
        userId: token.user_id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
      },
    });
  }

  async ensureAccessToken(userId: number): Promise<string | null> {
    const token = await prisma.oAuthToken.findUnique({ where: { userId } });
    if (!token) return null;

    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 300;

    if (token.expiresAt > now + bufferSeconds) {
      return token.accessToken;
    }

    if (!this.mlClient) return null;

    try {
      const refreshed = await this.mlClient.refreshToken(token.refreshToken);
      await this.saveTokens(refreshed);
      return refreshed.access_token;
    } catch {
      return null;
    }
  }

  async deleteToken(userId: number): Promise<void> {
    await prisma.oAuthToken.deleteMany({ where: { userId } });
  }
}

export interface EscalationInput {
  questionId: number;
  tenantId: string;
  itemId: string;
  questionText: string;
  reason: EscalationReason;
  productContextSnapshot?: string;
}

export async function saveEscalation(input: EscalationInput): Promise<void> {
  await prisma.escalatedQuestion.upsert({
    where: { questionId: input.questionId },
    create: {
      questionId: input.questionId,
      tenantId: input.tenantId,
      itemId: input.itemId,
      questionText: input.questionText,
      reason: input.reason,
      productContextSnapshot: input.productContextSnapshot,
    },
    update: {
      tenantId: input.tenantId,
      itemId: input.itemId,
      questionText: input.questionText,
      reason: input.reason,
      productContextSnapshot: input.productContextSnapshot,
      escalatedAt: new Date(),
    },
  });
}

export async function listEscalations() {
  return prisma.escalatedQuestion.findMany({
    orderBy: { escalatedAt: "desc" },
  });
}
