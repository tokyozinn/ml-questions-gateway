import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { createApiKeyGuard } from "../plugins/apiKeyGuard.js";
import { tenantCreateSchema, tenantUpdateSchema } from "../schemas/tenant.js";
import { MlClient } from "../services/mlClient.js";
import { TenantService } from "../services/tenantService.js";
import { TokenManager } from "../services/tokenManager.js";

export async function registerGatewayRoutes(
  app: FastifyInstance,
  config: Config,
): Promise<void> {
  const apiKeyGuard = createApiKeyGuard(config);
  const tenantService = new TenantService(config);
  const mlClient = new MlClient(config);
  const tokenManager = new TokenManager();

  app.post(
    "/api/v1/tenants",
    { preHandler: apiKeyGuard },
    async (request, reply) => {
      const parsed = tenantCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const tenant = await tenantService.create(parsed.data);
      return reply.code(201).send(tenantService.toResponse(tenant));
    },
  );

  app.get(
    "/api/v1/tenants",
    { preHandler: apiKeyGuard },
    async () => {
      const tenants = await tenantService.list();
      return tenants.map((tenant) => tenantService.toResponse(tenant));
    },
  );

  app.get(
    "/api/v1/tenants/:id",
    { preHandler: apiKeyGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenant = await tenantService.getById(id);

      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found" });
      }

      return tenantService.toResponse(tenant);
    },
  );

  app.patch(
    "/api/v1/tenants/:id",
    { preHandler: apiKeyGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = tenantUpdateSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const tenant = await tenantService.update(id, parsed.data);
        return tenantService.toResponse(tenant);
      } catch {
        return reply.code(404).send({ error: "Tenant not found" });
      }
    },
  );

  app.post(
    "/api/v1/tenants/:id/disconnect",
    { preHandler: apiKeyGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const tenant = await tenantService.disconnect(id);
        return tenantService.toResponse(tenant);
      } catch {
        return reply.code(404).send({ error: "Tenant not found" });
      }
    },
  );

  app.get("/connect/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenant = await tenantService.getById(tenantId);

    if (!tenant) {
      return reply.code(404).send({ error: "Tenant not found" });
    }

    if (tenant.status === "suspended") {
      return reply.code(403).send({ error: "Tenant is suspended" });
    }

    if (!tenantService.canConnect(tenant.status)) {
      return reply.code(400).send({ error: "Tenant is already connected" });
    }

    const authUrl = mlClient.getAuthorizationUrl(tenant.id);
    return reply.redirect(authUrl);
  });

  app.get("/auth/callback", async (request, reply) => {
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error) {
      return reply.code(400).send({ error: `OAuth error: ${error}` });
    }

    if (!code || !state) {
      return reply.code(400).send({ error: "Missing code or state" });
    }

    const tenant = await tenantService.getById(state);
    if (!tenant) {
      return reply.code(404).send({ error: "Tenant not found" });
    }

    if (!tenantService.canConnect(tenant.status)) {
      return reply.code(400).send({ error: "Tenant cannot connect" });
    }

    try {
      const token = await mlClient.exchangeCode(code);
      await tokenManager.saveTokens(token);
      await tenantService.markConnected(tenant.id, token.user_id);

      return reply.type("text/html").send(`
        <html><body>
          <h1>Conexão realizada com sucesso</h1>
          <p>Tenant: ${tenant.name}</p>
          <p>ML User ID: ${token.user_id}</p>
        </body></html>
      `);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "Failed to complete OAuth" });
    }
  });
}
