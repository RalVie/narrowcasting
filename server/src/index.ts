import { buildServer } from "./server.js";

const app = buildServer();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info({ host, port }, "narrowcasting server listening");
} catch (error) {
  app.log.error(error, "failed to start narrowcasting server");
  process.exit(1);
}
