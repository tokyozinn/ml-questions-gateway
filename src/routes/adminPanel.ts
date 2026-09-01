import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedHtml: string | null = null;

async function loadAdminHtml(): Promise<string> {
  if (!cachedHtml) {
    cachedHtml = await readFile(join(__dirname, "../views/admin.html"), "utf-8");
  }
  return cachedHtml;
}

export async function registerAdminPanelRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/admin", async (_request, reply) => {
    const html = await loadAdminHtml();
    return reply.type("text/html").send(html);
  });
}
