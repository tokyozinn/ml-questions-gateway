import type { MlTokenResponse } from "./mlClient.js";
import { prisma } from "../db/client.js";

export class TokenManager {
  async saveTokens(token: MlTokenResponse): Promise<void> {
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

  async getAccessToken(userId: number): Promise<string | null> {
    const token = await prisma.oAuthToken.findUnique({ where: { userId } });
    if (!token) return null;

    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 300;

    if (token.expiresAt <= now + bufferSeconds) {
      return null;
    }

    return token.accessToken;
  }

  async getRefreshToken(userId: number): Promise<string | null> {
    const token = await prisma.oAuthToken.findUnique({ where: { userId } });
    return token?.refreshToken ?? null;
  }

  async deleteToken(userId: number): Promise<void> {
    await prisma.oAuthToken.deleteMany({ where: { userId } });
  }
}
