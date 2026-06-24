import type { DatabaseContext } from "./db/context.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseContext;
  }
}
