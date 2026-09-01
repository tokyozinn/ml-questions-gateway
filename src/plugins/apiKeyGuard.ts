import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";

export function createApiKeyGuard(config: Config) {
  return async function apiKeyGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const apiKey = request.headers["x-api-key"];

    if (!apiKey || apiKey !== config.GATEWAY_API_KEY) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
