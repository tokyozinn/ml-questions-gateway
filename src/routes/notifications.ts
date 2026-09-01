import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { notificationPayloadSchema } from "../schemas/notification.js";
import { extractQuestionId } from "../schemas/notification.js";
import { MlClient } from "../services/mlClient.js";
import { QuestionProcessor } from "../services/questionProcessor.js";

export async function registerNotificationRoutes(
  app: FastifyInstance,
  config: Config,
): Promise<void> {
  const mlClient = new MlClient(config);
  const processor = new QuestionProcessor(mlClient, config, app.log);

  app.post("/notifications", async (request, reply) => {
    const parsed = notificationPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const questionId = extractQuestionId(parsed.data.resource);

    void processor.process(parsed.data).catch((err) => {
      request.log.error(err, "Failed to process notification");
    });

    return reply.code(200).send({
      status: "accepted",
      question_id: questionId,
    });
  });
}
