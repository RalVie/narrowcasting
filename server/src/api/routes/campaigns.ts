import type { FastifyPluginAsync } from "fastify";
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
  PublishWarningConfirmationError,
  publishValidationErrorResponse,
  publishWarningConfirmationResponse
} from "../../publishing/publishValidation.js";
import { validateCampaignDelete } from "../../validation/referenceIntegrity.js";

function hasConfirmedWarnings(input: unknown) {
  return Boolean(
    input &&
      typeof input === "object" &&
      (input as { confirmWarnings?: unknown }).confirmWarnings === true
  );
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
      const campaign = await createCampaign(request.body ?? {}, {
        confirmWarnings: hasConfirmedWarnings(request.body)
      });
      return reply.code(201).send(campaign);
    } catch (error) {
      if (error instanceof PublishValidationError) {
        return reply.code(400).send(publishValidationErrorResponse(error));
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
      const campaign = await updateCampaign(request.params.id, request.body ?? {}, {
        confirmWarnings: hasConfirmedWarnings(request.body)
      });

      if (!campaign) {
        return notFound(reply, "campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      return reply.send(campaign);
    } catch (error) {
      if (error instanceof PublishValidationError) {
        return reply.code(400).send(publishValidationErrorResponse(error));
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
