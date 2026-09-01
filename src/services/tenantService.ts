import type { Tenant, TenantStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import type { Config } from "../config.js";
import type { TenantCreateInput, TenantUpdateInput } from "../schemas/tenant.js";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 1;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix++;
  }

  return slug;
}

export class TenantService {
  constructor(private readonly config: Config) {}

  async create(input: TenantCreateInput): Promise<Tenant> {
    const baseSlug = input.slug ?? slugify(input.name);
    const slug = await uniqueSlug(baseSlug);

    return prisma.tenant.create({
      data: {
        name: input.name,
        slug,
        autoAnswerEnabled: input.auto_answer_enabled,
        whatsappPhone: input.whatsapp_phone,
        billingEmail: input.billing_email,
      },
    });
  }

  async list(): Promise<Tenant[]> {
    return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getById(id: string): Promise<Tenant | null> {
    return prisma.tenant.findUnique({ where: { id } });
  }

  async update(id: string, input: TenantUpdateInput): Promise<Tenant> {
    return prisma.tenant.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.auto_answer_enabled !== undefined && {
          autoAnswerEnabled: input.auto_answer_enabled,
        }),
        ...(input.whatsapp_phone !== undefined && {
          whatsappPhone: input.whatsapp_phone,
        }),
        ...(input.billing_email !== undefined && {
          billingEmail: input.billing_email,
        }),
      },
    });
  }

  async disconnect(id: string): Promise<Tenant> {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id } });

    if (tenant.mlUserId) {
      await prisma.oAuthToken.deleteMany({ where: { userId: tenant.mlUserId } });
    }

    return prisma.tenant.update({
      where: { id },
      data: {
        status: "disconnected",
        mlUserId: null,
        connectedAt: null,
      },
    });
  }

  async markConnected(id: string, mlUserId: number): Promise<Tenant> {
    const existing = await prisma.tenant.findFirst({
      where: { mlUserId, NOT: { id } },
    });

    if (existing) {
      throw new Error(
        `ML user ${mlUserId} is already linked to tenant ${existing.id}`,
      );
    }

    return prisma.tenant.update({
      where: { id },
      data: {
        mlUserId,
        status: "active",
        connectedAt: new Date(),
      },
    });
  }

  canConnect(status: TenantStatus): boolean {
    return status === "pending" || status === "disconnected";
  }

  connectUrl(tenantId: string): string {
    return `${this.config.GATEWAY_PUBLIC_URL}/connect/${tenantId}`;
  }

  toResponse(tenant: Tenant) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      ml_user_id: tenant.mlUserId,
      status: tenant.status,
      auto_answer_enabled: tenant.autoAnswerEnabled,
      whatsapp_phone: tenant.whatsappPhone,
      billing_email: tenant.billingEmail,
      billing_provider: tenant.billingProvider,
      connected_at: tenant.connectedAt?.toISOString() ?? null,
      created_at: tenant.createdAt.toISOString(),
      connect_url: this.canConnect(tenant.status)
        ? this.connectUrl(tenant.id)
        : null,
    };
  }
}
