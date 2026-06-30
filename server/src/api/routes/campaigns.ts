import type { FastifyPluginAsync } from "fastify";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign
} from "../../campaigns/campaignStore.js";
import { badRequestForError, conflict, notFound } from "../apiErrors.js";
import { validateCampaignDelete } from "../../validation/referenceIntegrity.js";

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.get("/campaigns", async () => listCampaigns());

  app.post("/campaigns", async (request, reply) => {
    try {
      const campaign = await createCampaign(request.body ?? {});
      return reply.code(201).send(campaign);
    } catch (error) {
      return badRequestForError(reply, error, "campaign could not be created");
    }
  });

  app.post<{ Params: { id: string } }>("/campaigns/:id/update", async (request, reply) => {
    try {
      const campaign = await updateCampaign(request.params.id, request.body ?? {});

      if (!campaign) {
        return notFound(reply, "campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      return reply.send(campaign);
    } catch (error) {
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
