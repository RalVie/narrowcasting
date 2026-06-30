import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  deleteCampaignAssignments,
  syncCampaignAssignments,
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
import { assertValid, type DomainValidationIssue } from "../validation/domainValidation.js";

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
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string[];
  timeWindows?: unknown[];
  priority?: number | null;
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
    startDate: sanitizeNullableText(candidate.startDate),
    endDate: sanitizeNullableText(candidate.endDate),
    daysOfWeek: Array.isArray(candidate.daysOfWeek)
      ? candidate.daysOfWeek.filter((day): day is string => typeof day === "string")
      : [],
    timeWindows: Array.isArray(candidate.timeWindows) ? candidate.timeWindows : [],
    priority: typeof candidate.priority === "number" ? candidate.priority : null,
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

  return {
    name: sanitizeText(body.name, existing?.name ?? "Untitled Campaign"),
    description: sanitizeNullableText("description" in body ? body.description : existing?.description),
    enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? true,
    programId,
    targetType,
    targetIds
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
    startDate: null,
    endDate: null,
    daysOfWeek: [],
    timeWindows: [],
    priority: null,
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
