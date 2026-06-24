export interface DatabaseContext {
  readonly provider: "sqlite";
  readonly ready: boolean;
}

export function createDatabaseContext(): DatabaseContext {
  return {
    provider: "sqlite",
    ready: false
  };
}
