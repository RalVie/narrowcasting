export interface ServerConfig {
  host: string;
  port: number;
}

export function loadServerConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000)
  };
}
