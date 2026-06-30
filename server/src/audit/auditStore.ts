import { randomUUID, createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type AuditActorType = "admin" | "anonymous" | "device" | "system";
export type AuditResult = "success" | "failure";

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorType: AuditActorType;
  actorId?: string | null;
  source: string;
  action: string;
  objectType: string;
  objectId?: string | null;
  objectName?: string | null;
  result: AuditResult;
  reason?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

const auditEventsPath = resolve(process.cwd(), "data", "audit-events.jsonl");

export function fingerprintSecret(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function appendAuditEvent(input: Omit<AuditEvent, "id" | "timestamp">) {
  const event: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...input
  };

  await mkdir(dirname(auditEventsPath), { recursive: true });
  await appendFile(auditEventsPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);

  try {
    const content = await readFile(auditEventsPath, "utf8");

    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-safeLimit)
      .map((line) => JSON.parse(line) as AuditEvent)
      .reverse();
  } catch {
    return [];
  }
}

