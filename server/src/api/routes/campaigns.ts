import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
  validateCampaignPublishDraft,
  validateExistingCampaignPublishDraft
} from "../../campaigns/campaignStore.js";
import { badRequestForError, conflict, notFound } from "../apiErrors.js";
import {
  PublishValidationError,
  PublishRevisionError,
  PublishWarningConfirmationError,
  type PublishValidationReport,
  publishRevisionErrorResponse,
  publishValidationErrorResponse,
  publishWarningConfirmationResponse
} from "../../publishing/publishValidation.js";
import { validateCampaignDelete } from "../../validation/referenceIntegrity.js";
import { appendAuditEvent } from "../../audit/auditStore.js";
import { actorFromRequest } from "../../audit/auditHooks.js";
import type { Campaign } from "../../campaigns/campaignStore.js";

function hasConfirmedWarnings(input: unknown) {
  return Boolean(
    input &&
      typeof input === "object" &&
      (input as { confirmWarnings?: unknown }).confirmWarnings === true
  );
}

function publishRevision(input: unknown) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const value = (input as { publishRevision?: unknown; revision?: unknown }).publishRevision ?? (input as { revision?: unknown }).revision;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compactPublishAuditMetadata(input: {
  campaign: Campaign;
  report: PublishValidationReport;
  confirmWarnings: boolean;
}) {
  return {
    campaign: {
      id: input.campaign.id,
      name: input.campaign.name,
      enabled: input.campaign.enabled,
      programId: input.campaign.programId,
      targetType: input.campaign.targetType,
      targetCount: input.campaign.targetIds.length
    },
    revision: input.report.revision,
    validationSummary: input.report.summary,
    acceptedWarnings: input.confirmWarnings
      ? input.report.warnings.map((warning) => ({
          id: warning.id,
          ruleId: warning.ruleId,
          category: warning.category,
          affectedObject: warning.affectedObject ?? null
        }))
      : [],
    runtimeImpactSummary: input.report.impact.summary,
    operatorConfirmation: {
      warningsConfirmed: input.confirmWarnings,
      warningCount: input.report.summary.warnings
    },
    publishResult: "success"
  };
}

async function appendCampaignPublishAuditEvent(input: {
  request: FastifyRequest;
  action: "create_publish" | "update_publish";
  campaign: Campaign;
  report: PublishValidationReport;
  confirmWarnings: boolean;
}) {
  const actor = actorFromRequest(input.request, 200);

  await appendAuditEvent({
    ...actor,
    action: input.action,
    objectType: "Campaign",
    objectId: input.campaign.id,
    objectName: input.campaign.name,
    result: "success",
    reason: "Campaign published with validated revision.",
    correlationId: input.request.id,
    metadata: compactPublishAuditMetadata({
      campaign: input.campaign,
      report: input.report,
      confirmWarnings: input.confirmWarnings
    })
  });
}

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.get("/campaigns", async () => listCampaigns());

  app.post("/campaigns/validate", async (request, reply) => {
    try {
      const report = await validateCampaignPublishDraft(request.body ?? {});
      return reply.send(report);
    } catch (error) {
      return badRequestForError(reply, error, "campaign could not be validated");
    }
  });

  app.post("/campaigns", async (request, reply) => {
    try {
      const confirmWarnings = hasConfirmedWarnings(request.body);
      const result = await createCampaign(request.body ?? {}, {
        confirmWarnings,
        revision: publishRevision(request.body)
      });
      await appendCampaignPublishAuditEvent({
        request,
        action: "create_publish",
        campaign: result.campaign,
        report: result.report,
        confirmWarnings
      });
      return reply.code(201).send(result.campaign);
    } catch (error) {
      if (error instanceof PublishValidationError) {
        return reply.code(400).send(publishValidationErrorResponse(error));
      }

      if (error instanceof PublishRevisionError) {
        return reply.code(409).send(publishRevisionErrorResponse(error));
      }

      if (error instanceof PublishWarningConfirmationError) {
        return reply.code(409).send(publishWarningConfirmationResponse(error));
      }

      return badRequestForError(reply, error, "campaign could not be created");
    }
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/validate", async (request, reply) => {
    try {
      const report = await validateExistingCampaignPublishDraft(request.params.id, request.body ?? {});

      if (!report) {
        return notFound(reply, "campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      return reply.send(report);
    } catch (error) {
      return badRequestForError(reply, error, "campaign could not be validated");
    }
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/update", async (request, reply) => {
    try {
      const confirmWarnings = hasConfirmedWarnings(request.body);
      const result = await updateCampaign(request.params.id, request.body ?? {}, {
        confirmWarnings,
        revision: publishRevision(request.body)
      });

      if (!result) {
        return notFound(reply, "campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      await appendCampaignPublishAuditEvent({
        request,
        action: "update_publish",
        campaign: result.campaign,
        report: result.report,
        confirmWarnings
      });
      return reply.send(result.campaign);
    } catch (error) {
      if (error instanceof PublishValidationError) {
        return reply.code(400).send(publishValidationErrorResponse(error));
      }

      if (error instanceof PublishRevisionError) {
        return reply.code(409).send(publishRevisionErrorResponse(error));
      }

      if (error instanceof PublishWarningConfirmationError) {
        return reply.code(409).send(publishWarningConfirmationResponse(error));
      }

      return badRequestForError(reply, error, "campaign could not be updated");
    }
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/delete", async (request, reply) => {
    const validation = await validateCampaignDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const deleted = await deleteCampaign(request.params.id);

    if (!deleted) {
      return notFound(reply, "campaign not found", "CAMPAIGN_NOT_FOUND");
    }

    return reply.send({ ok: true });
  });
};
