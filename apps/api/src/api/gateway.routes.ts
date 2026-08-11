import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import {
  createSecret,
  createWrapper,
  deleteSecret,
  deleteWrapper,
  gatewayAnalytics,
  listSecrets,
  listWrappers,
  suggestWrapperSlug,
  proxyGateway,
  requireGatewayOwner,
  secretInput,
  updateWrapper,
  wrapperInput,
  wrapperPatch,
  type OwnerRequest,
} from "../services/gateway.js";

export const gatewayRoutes: ExpressRouter = Router();
const idSchema = z.string().uuid();
gatewayRoutes.get(
  "/v1/wrappers/slug",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      const name = z.string().trim().min(2).max(120).parse(request.query.name);
      return response.json(await suggestWrapperSlug(name));
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.post(
  "/v1/vault/secrets",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response
        .status(201)
        .json(
          await createSecret(request.ownerId!, secretInput.parse(request.body)),
        );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.get(
  "/v1/vault/secrets",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json({ items: await listSecrets(request.ownerId!) });
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.delete(
  "/v1/vault/secrets/:id",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      await deleteSecret(request.ownerId!, idSchema.parse(request.params.id));
      return response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.post(
  "/v1/wrappers",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response
        .status(201)
        .json(
          await createWrapper(
            request.ownerId!,
            wrapperInput.parse(request.body),
          ),
        );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.get(
  "/v1/wrappers",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json({ items: await listWrappers(request.ownerId!) });
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.patch(
  "/v1/wrappers/:id",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json(
        await updateWrapper(
          request.ownerId!,
          idSchema.parse(request.params.id),
          wrapperPatch.parse(request.body),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.post(
  "/v1/wrappers/:id/disable",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json(
        await updateWrapper(
          request.ownerId!,
          idSchema.parse(request.params.id),
          { enabled: false },
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.post(
  "/v1/wrappers/:id/enable",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json(
        await updateWrapper(
          request.ownerId!,
          idSchema.parse(request.params.id),
          { enabled: true },
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.delete(
  "/v1/wrappers/:id",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      await deleteWrapper(request.ownerId!, idSchema.parse(request.params.id));
      return response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.get(
  "/v1/wrappers/:id/analytics",
  requireGatewayOwner,
  async (request: OwnerRequest, response, next) => {
    try {
      return response.json(
        await gatewayAnalytics(
          request.ownerId!,
          idSchema.parse(request.params.id),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
gatewayRoutes.all(
  "/gateway/:slug",
  (request, response, next) => void proxyGateway(request, response).catch(next),
);
gatewayRoutes.all(
  "/gateway/:slug/*splat",
  (request, response, next) => void proxyGateway(request, response).catch(next),
);
