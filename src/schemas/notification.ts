import { z } from "zod";

export const notificationPayloadSchema = z.object({
  resource: z.string(),
  user_id: z.union([z.number(), z.string()]),
  topic: z.string(),
  application_id: z.union([z.number(), z.string()]).optional(),
  attempts: z.number().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export function extractQuestionId(resource: string): number | null {
  const match = resource.match(/\/questions\/(\d+)/);
  return match ? Number(match[1]) : null;
}
