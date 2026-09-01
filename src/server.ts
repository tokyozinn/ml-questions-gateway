import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { registerGatewayRoutes } from "./routes/gateway.js";

const config = loadConfig();

const app = Fastify({ logger: true });

app.get("/", async () => ({
  name: config.APP_NAME,
  version: "0.1.0",
  status: "ok",
}));

app.get("/health", async () => ({
  status: "healthy",
  timestamp: new Date().toISOString(),
}));

await registerGatewayRoutes(app, config);

async function start() {
  try {
    if (config.DATABASE_URL.startsWith("file:")) {
      const dbPath = config.DATABASE_URL.replace("file:", "");
      await mkdir(dirname(dbPath), { recursive: true });
    }

    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
