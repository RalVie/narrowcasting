import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface SchedulerBlock {
  id: string;
  programId: string;
  themeId?: string;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: DayOfWeek[];
  startTime?: string;
  endTime?: string;
  options?: Record<string, unknown>;
}

export interface SchedulerConfig {
  version: number;
  updatedAt: string;
  blocks: SchedulerBlock[];
}

const schedulerPath = resolve(process.cwd(), "data", "scheduler.json");
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const allowedDays = new Set<string>(dayNames);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function normalizeBlock(value: unknown, index: number): SchedulerBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SchedulerBlock>;

  if (typeof candidate.programId !== "string" || !candidate.programId.trim()) {
    return null;
  }

  const block: SchedulerBlock = {
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `block-${index + 1}`,
    programId: candidate.programId
  };

  if (typeof candidate.themeId === "string" && candidate.themeId.trim()) {
    block.themeId = candidate.themeId.trim();
  }

  if (typeof candidate.startDate === "string" && datePattern.test(candidate.startDate)) {
    block.startDate = candidate.startDate;
  }

  if (typeof candidate.endDate === "string" && datePattern.test(candidate.endDate)) {
    block.endDate = candidate.endDate;
  }

  if (Array.isArray(candidate.daysOfWeek)) {
    const daysOfWeek = candidate.daysOfWeek.filter(
      (day): day is DayOfWeek => typeof day === "string" && allowedDays.has(day)
    );

    if (daysOfWeek.length > 0) {
      block.daysOfWeek = [...new Set(daysOfWeek)];
    }
  }

  if (typeof candidate.startTime === "string" && timePattern.test(candidate.startTime)) {
    block.startTime = candidate.startTime;
  }

  if (typeof candidate.endTime === "string" && timePattern.test(candidate.endTime)) {
    block.endTime = candidate.endTime;
  }

  if (candidate.options && typeof candidate.options === "object") {
    block.options = candidate.options;
  }

  return block;
}

export async function readScheduler(): Promise<SchedulerConfig> {
  try {
    const content = await readFile(schedulerPath, "utf8");
    const value: unknown = JSON.parse(content);
    const candidate = value as Partial<SchedulerConfig>;

    if (
      value &&
      typeof value === "object" &&
      typeof candidate.version === "number" &&
      typeof candidate.updatedAt === "string" &&
      Array.isArray(candidate.blocks)
    ) {
      return {
        version: candidate.version,
        updatedAt: candidate.updatedAt,
        blocks: candidate.blocks
          .map((block, index) => normalizeBlock(block, index))
          .filter((block): block is SchedulerBlock => block !== null)
      };
    }
  } catch {
    return {
      version: 0,
      updatedAt: "",
      blocks: []
    };
  }

  return {
    version: 0,
    updatedAt: "",
    blocks: []
  };
}

export async function saveScheduler(value: unknown): Promise<SchedulerConfig> {
  const existingConfig = await readScheduler();
  const incoming = value as Partial<SchedulerConfig>;
  const scheduler: SchedulerConfig = {
    version: existingConfig.version + 1,
    updatedAt: new Date().toISOString(),
    blocks: Array.isArray(incoming.blocks)
      ? incoming.blocks
          .map((block, index) => normalizeBlock(block, index))
          .filter((block): block is SchedulerBlock => block !== null)
      : []
  };

  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(schedulerPath, `${JSON.stringify(scheduler, null, 2)}\n`, "utf8");

  return scheduler;
}
