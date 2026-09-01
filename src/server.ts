import Fastify from "fastify";
import { loadConfig } from "./config.js";

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

async function start() {
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
