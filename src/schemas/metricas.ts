import { z } from "zod";

export const metricasQuerySchema = z.object({
  periodo: z.coerce
    .number()
    .pipe(z.union([z.literal(30), z.literal(60), z.literal(90)]))
    .default(30),
  refresh: z.enum(["0", "1"]).optional().default("0"),
});
