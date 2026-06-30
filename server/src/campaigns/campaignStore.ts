import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  deleteCampaignAssignments,
  syncCampaignAssignments,
  type AssignmentSchedule,
  type AssignmentTargetType
} from "../assignments/assignmentStore.js";
import { getProgramsOrDefault } from "../program/programStore.js";
import {
  assertPublishable,
  validatePublishIntent,
  type PublishValidationReport
} from "../publishing/publishValidation.js";
import { listScreenGroups } from "../screens/screenGroupStore.js";
import { listScreens } from "../screens/screenStore.js";
import {
  assertValid,
  isValidClockTime,
  isValidDateBoundary,
  type DomainValidationIssue
} from "../validation/domainValidation.js";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  programId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
  createdAt: string;
  updatedAt: string;
  alwaysActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string[];
  startTime?: string | null;
  endTime?: string | null;
  timeWindows?: unknown[];
  priority: number;
  overrideMode?: string | null;
  rotation?: string | null;
  weight?: number | null;
  campaignType?: string | null;
}

export interface PublishMutationOptions {
  confirmWarnings?: boolean;
  revision?: string | null;
}

export interface CampaignPublishResult {
  campaign: Campaign;
  report: PublishValidationReport;
}

const campaignsPath = resolve(process.cwd(), "data", "campaigns.json");
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type CampaignDay = (typeof dayNames)[number];
const dayNameSet = new Set<string>(dayNames);
const dayNameToNumber: Record<CampaignDay, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function sanitizeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function normalizeTargetType(value: unknown): AssignmentTargetType {
  return value === "SCREEN_GROUP" ? "SCREEN_GROUP" : "SCREEN";
}

function normalizeTargetIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((targetId): targetId is string => typeof targetId === "string" && targetId.trim().length > 0)
        .map((targetId) => targetId.trim())
    )
  );
}

function normalizeDaysOfWeek(value: unknown): CampaignDay[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((day): day is CampaignDay => typeof day === "string" && dayNameSet.has(day))
    )
  );
}

function normalizePriority(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000 ? value : 100;
}

function campaignScheduleToAssignmentSchedule(input: {
  alwaysActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string[];
  startTime?: string | null;
  endTime?: string | null;
}): AssignmentSchedule | undefined {
  if (input.alwaysActive) {
    return undefined;
  }

  const daysOfWeek = normalizeDaysOfWeek(input.daysOfWeek).map((day) => dayNameToNumber[day]);
  const schedule: AssignmentSchedule = {
    enabled: true
  };

  if (input.startDate) {
    schedule.startDate = input.startDate;
  }

  if (input.endDate) {
    schedule.endDate = input.endDate;
  }

  if (daysOfWeek.length > 0) {
    schedule.daysOfWeek = daysOfWeek;
  }

  if (input.startTime) {
    schedule.startTime = input.startTime;
  }

  if (input.endTime) {
    schedule.endTime = input.endTime;
  }

  return schedule;
}

function normalizeCampaign(value: unknown): Campaign | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Campaign>;

  if (typeof candidate.id !== "string") {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: candidate.id,
    name: sanitizeText(candidate.name, "Untitled Campaign"),
    description: sanitizeNullableText(candidate.description),
    enabled: candidate.enabled !== false,
    programId: sanitizeText(candidate.programId),
    targetType: normalizeTargetType(candidate.targetType),
    targetIds: normalizeTargetIds(candidate.targetIds),
    createdAt: sanitizeText(candidate.createdAt, now),
    updatedAt: sanitizeText(candidate.updatedAt, candidate.createdAt ?? now),
    alwaysActive: typeof candidate.alwaysActive === "boolean" ? candidate.alwaysActive : true,
    startDate: sanitizeNullableText(candidate.startDate),
    endDate: sanitizeNullableText(candidate.endDate),
    daysOfWeek: normalizeDaysOfWeek(candidate.daysOfWeek),
    startTime: sanitizeNullableText(candidate.startTime),
    endTime: sanitizeNullableText(candidate.endTime),
    timeWindows: Array.isArray(candidate.timeWindows) ? candidate.timeWindows : [],
    priority: normalizePriority(candidate.priority),
    overrideMode: sanitizeNullableText(candidate.overrideMode),
    rotation: sanitizeNullableText(candidate.rotation),
    weight: typeof candidate.weight === "number" ? candidate.weight : null,
    campaignType: sanitizeNullableText(candidate.campaignType)
  };
}

async function writeCampaigns(campaigns: Campaign[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(campaignsPath, `${JSON.stringify(campaigns, null, 2)}\n`, "utf8");
}

async function validateCampaignInput(input: {
  programId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
  alwaysActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek: CampaignDay[];
  startTime?: string | null;
  endTime?: string | null;
  priority: number;
}) {
  const issues: DomainValidationIssue[] = [];
  const programs = await getProgramsOrDefault();
  const program = programs.find((item) => item.id === input.programId);

  if (!program) {
    issues.push({
      ruleId: "VAL-CAMPAIGN-003",
      field: "programId",
      severity: "blocking_error",
      message: "Campaign program must exist."
    });
  }

  if (input.targetIds.length === 0) {
    issues.push({
      ruleId: "VAL-CAMPAIGN-004",
      field: "targetIds",
      severity: "blocking_error",
      message: "Campaign must target at least one screen or screen group."
    });
  }

  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1000) {
    issues.push({
      ruleId: "VAL-CAMPAIGN-005",
      field: "priority",
      severity: "blocking_error",
      message: "Campaign priority must be an integer from 0 to 1000."
    });
  }

  if (!input.alwaysActive) {
    if (input.startDate && !isValidDateBoundary(input.startDate)) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-006",
        field: "startDate",
        severity: "blocking_error",
        message: "Campaign start date must be a valid ISO date."
      });
    }

    if (input.endDate && !isValidDateBoundary(input.endDate)) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-006",
        field: "endDate",
        severity: "blocking_error",
        message: "Campaign end date must be a valid ISO date."
      });
    }

    if (
      input.startDate &&
      input.endDate &&
      isValidDateBoundary(input.startDate) &&
      isValidDateBoundary(input.endDate) &&
      Date.parse(input.startDate) > Date.parse(input.endDate)
    ) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-006",
        field: "endDate",
        severity: "blocking_error",
        message: "Campaign end date must not be before the start date."
      });
    }

    if (input.daysOfWeek.length === 0) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-007",
        field: "daysOfWeek",
        severity: "blocking_error",
        message: "Campaign must select at least one day unless Always Active is enabled."
      });
    }

    if (input.startTime && !isValidClockTime(input.startTime)) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-008",
        field: "startTime",
        severity: "blocking_error",
        message: "Campaign start time must use HH:mm format."
      });
    }

    if (input.endTime && !isValidClockTime(input.endTime)) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-008",
        field: "endTime",
        severity: "blocking_error",
        message: "Campaign end time must use HH:mm format."
      });
    }
  }

  if (input.targetType === "SCREEN") {
    const screens = await listScreens();
    const approvedScreenIds = new Set(
      screens.filter((screen) => screen.status === "approved").map((screen) => screen.screenId)
    );
    const invalidScreen = input.targetIds.find((targetId) => !approvedScreenIds.has(targetId));

    if (invalidScreen) {
      issues.push({
        ruleId: "VAL-CAMPAIGN-004",
        field: "targetIds",
        severity: "blocking_error",
        message: "Campaign target screens must exist and be approved."
      });
    }

    assertValid(issues);
    return;
  }

  const groups = await listScreenGroups();
  const groupIds = new Set(groups.map((group) => group.groupId));
  const invalidGroup = input.targetIds.find((targetId) => !groupIds.has(targetId));

  if (invalidGroup) {
    issues.push({
      ruleId: "VAL-CAMPAIGN-004",
      field: "targetIds",
      severity: "blocking_error",
      message: "Campaign target screen groups must exist."
    });
  }

  assertValid(issues);
}

function readCampaignInput(input: unknown, existing?: Campaign) {
  const body = input && typeof input === "object" ? (input as Partial<Campaign>) : {};

  if (
    "targetType" in body &&
    body.targetType !== undefined &&
    body.targetType !== "SCREEN" &&
    body.targetType !== "SCREEN_GROUP"
  ) {
    assertValid([
      {
        ruleId: "VAL-CAMPAIGN-004",
        field: "targetType",
        severity: "blocking_error",
        message: "Campaign target type must be SCREEN or SCREEN_GROUP."
      }
    ]);
  }

  const targetType = normalizeTargetType(body.targetType ?? existing?.targetType);
  const targetIds = normalizeTargetIds(body.targetIds ?? existing?.targetIds);
  const programId = sanitizeText(body.programId, existing?.programId ?? "");
  const alwaysActive = typeof body.alwaysActive === "boolean" ? body.alwaysActive : existing?.alwaysActive ?? true;
  const startDate = sanitizeNullableText("startDate" in body ? body.startDate : existing?.startDate);
  const endDate = sanitizeNullableText("endDate" in body ? body.endDate : existing?.endDate);
  const daysOfWeek = normalizeDaysOfWeek(body.daysOfWeek ?? existing?.daysOfWeek);
  const startTime = sanitizeNullableText("startTime" in body ? body.startTime : existing?.startTime);
  const endTime = sanitizeNullableText("endTime" in body ? body.endTime : existing?.endTime);
  const priority = normalizePriority(body.priority ?? existing?.priority);

  return {
    name: sanitizeText(body.name, existing?.name ?? "Untitled Campaign"),
    description: sanitizeNullableText("description" in body ? body.description : existing?.description),
    enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? true,
    programId,
    targetType,
    targetIds,
    alwaysActive,
    startDate,
    endDate,
    daysOfWeek,
    startTime,
    endTime,
    priority
  };
}

export async function validateCampaignPublishDraft(
  input: unknown,
  existing?: Campaign
): Promise<PublishValidationReport> {
  const campaignInput = readCampaignInput(input, existing);

  return validatePublishIntent({
    campaignId: existing?.id,
    ...campaignInput
  });
}

export async function validateExistingCampaignPublishDraft(
  id: string,
  input: unknown
): Promise<PublishValidationReport | null> {
  const campaigns = await listCampaigns();
  const existing = campaigns.find((campaign) => campaign.id === id);

  if (!existing) {
    return null;
  }

  return validateCampaignPublishDraft(input, existing);
}

async function syncCampaign(campaign: Campaign) {
  await syncCampaignAssignments({
    campaignId: campaign.id,
    enabled: campaign.enabled,
    targetType: campaign.targetType,
    targetIds: campaign.targetIds,
    programId: campaign.programId,
    campaignName: campaign.name,
    schedule: campaignScheduleToAssignmentSchedule(campaign),
    priority: campaign.priority,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt
  });
}

export async function listCampaigns(): Promise<Campaign[]> {
  try {
    const content = await readFile(campaignsPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value
        .map((campaign) => normalizeCampaign(campaign))
        .filter((campaign): campaign is Campaign => campaign !== null);
    }
  } catch {
    return [];
  }

  return [];
}

export async function createCampaign(
  input: unknown,
  options: PublishMutationOptions = {}
): Promise<CampaignPublishResult> {
  const campaignInput = readCampaignInput(input);
  const report = await validatePublishIntent({
    ...campaignInput
  });
  assertPublishable(report, {
    confirmWarnings: options.confirmWarnings,
    revision: options.revision
  });
  await validateCampaignInput(campaignInput);

  const campaigns = await listCampaigns();
  const now = new Date().toISOString();
  const campaign: Campaign = {
    id: randomUUID(),
    name: campaignInput.name,
    description: campaignInput.description,
    enabled: campaignInput.enabled,
    programId: campaignInput.programId,
    targetType: campaignInput.targetType,
    targetIds: campaignInput.targetIds,
    createdAt: now,
    updatedAt: now,
    alwaysActive: campaignInput.alwaysActive,
    startDate: campaignInput.startDate,
    endDate: campaignInput.endDate,
    daysOfWeek: campaignInput.daysOfWeek,
    startTime: campaignInput.startTime,
    endTime: campaignInput.endTime,
    timeWindows: [],
    priority: campaignInput.priority,
    overrideMode: null,
    rotation: null,
    weight: null,
    campaignType: null
  };

  await writeCampaigns([...campaigns, campaign]);
  await syncCampaign(campaign);
  return { campaign, report };
}

export async function updateCampaign(
  id: string,
  input: unknown,
  options: PublishMutationOptions = {}
): Promise<CampaignPublishResult | null> {
  const campaigns = await listCampaigns();
  const existing = campaigns.find((campaign) => campaign.id === id);

  if (!existing) {
    return null;
  }

  const campaignInput = readCampaignInput(input, existing);
  const report = await validatePublishIntent({
    campaignId: existing.id,
    ...campaignInput
  });
  assertPublishable(report, {
    confirmWarnings: options.confirmWarnings,
    revision: options.revision
  });
  await validateCampaignInput(campaignInput);

  const campaign: Campaign = {
    ...existing,
    name: campaignInput.name,
    description: campaignInput.description,
    enabled: campaignInput.enabled,
    programId: campaignInput.programId,
    targetType: campaignInput.targetType,
    targetIds: campaignInput.targetIds,
    alwaysActive: campaignInput.alwaysActive,
    startDate: campaignInput.startDate,
    endDate: campaignInput.endDate,
    daysOfWeek: campaignInput.daysOfWeek,
    startTime: campaignInput.startTime,
    endTime: campaignInput.endTime,
    priority: campaignInput.priority,
    updatedAt: new Date().toISOString()
  };

  await writeCampaigns(campaigns.map((item) => (item.id === id ? campaign : item)));
  await syncCampaign(campaign);
  return { campaign, report };
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const campaigns = await listCampaigns();
  const nextCampaigns = campaigns.filter((campaign) => campaign.id !== id);

  if (nextCampaigns.length === campaigns.length) {
    return false;
  }

  await writeCampaigns(nextCampaigns);
  await deleteCampaignAssignments(id);
  return true;
}
