import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import {
  apiKeyInput,
  challengeInput,
  createApiKey,
  createChallenge,
  listApiKeys,
  requireSession,
  revokeApiKey,
  revokeSession,
  rotateApiKey,
  verifyChallenge,
  verifyInput,
  type AuthRequest,
} from "../services/console-auth.js";
export const authRoutes: ExpressRouter = Router();
authRoutes.post("/v1/auth/challenge", async (req, res, next) => {
  try {
    res.status(201).json(await createChallenge(challengeInput.parse(req.body)));
  } catch (e) {
    next(e);
  }
});
authRoutes.post("/v1/auth/verify", async (req, res, next) => {
  try {
    res.json(await verifyChallenge(verifyInput.parse(req.body)));
  } catch (e) {
    next(e);
  }
});
authRoutes.get("/v1/auth/me", requireSession, (req: AuthRequest, res) =>
  res.json({ user: { id: req.userId, walletAddress: req.walletAddress } }),
);
authRoutes.post(
  "/v1/auth/logout",
  requireSession,
  async (req: AuthRequest, res, next) => {
    try {
      await revokeSession(
        req.header("authorization")!.replace(/^Bearer\s+/i, ""),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
authRoutes.get(
  "/v1/api-keys",
  requireSession,
  async (req: AuthRequest, res, next) => {
    try {
      res.json({ items: await listApiKeys(req.userId!) });
    } catch (e) {
      next(e);
    }
  },
);
authRoutes.post(
  "/v1/api-keys",
  requireSession,
  async (req: AuthRequest, res, next) => {
    try {
      res
        .status(201)
        .json(
          await createApiKey(req.userId!, apiKeyInput.parse(req.body).name),
        );
    } catch (e) {
      next(e);
    }
  },
);
authRoutes.post(
  "/v1/api-keys/:id/rotate",
  requireSession,
  async (req: AuthRequest, res, next) => {
    try {
      res.json(
        await rotateApiKey(req.userId!, z.string().uuid().parse(req.params.id)),
      );
    } catch (e) {
      next(e);
    }
  },
);
authRoutes.delete(
  "/v1/api-keys/:id",
  requireSession,
  async (req: AuthRequest, res, next) => {
    try {
      await revokeApiKey(req.userId!, z.string().uuid().parse(req.params.id));
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
