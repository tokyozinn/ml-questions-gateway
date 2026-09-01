import { z } from "zod";

export const tenantCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  auto_answer_enabled: z.boolean().default(true),
  whatsapp_phone: z.string().optional(),
  billing_email: z.string().email().optional(),
});

export const tenantUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  auto_answer_enabled: z.boolean().optional(),
  whatsapp_phone: z.string().nullable().optional(),
  billing_email: z.string().email().nullable().optional(),
});

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
