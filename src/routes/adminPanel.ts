import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedAdminHtml: string | null = null;
let cachedMetricsHtml: string | null = null;

async function loadAdminHtml(): Promise<string> {
  if (!cachedAdminHtml) {
    cachedAdminHtml = await readFile(
      join(__dirname, "../views/admin.html"),
      "utf-8",
    );
  }
  return cachedAdminHtml;
}

async function loadMetricsHtml(): Promise<string> {
  if (!cachedMetricsHtml) {
    cachedMetricsHtml = await readFile(
      join(__dirname, "../views/metrics.html"),
      "utf-8",
    );
  }
  return cachedMetricsHtml;
}

export async function registerAdminPanelRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/admin", async (_request, reply) => {
    const html = await loadAdminHtml();
    return reply.type("text/html").send(html);
  });

  app.get("/admin/metrics", async (_request, reply) => {
    const html = await loadMetricsHtml();
    return reply.type("text/html").send(html);
  });
}
