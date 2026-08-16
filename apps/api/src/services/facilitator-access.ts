import type { Request } from "express";
import type { PaymentRequirements } from "@x402/core/types";
import { env } from "../config/env.js";

type Bucket = { minute: number; count: number };
const buckets = new Map<string, Bucket>();

export function checkFacilitatorAccess(request: Request, requirements: PaymentRequirements): string | null {
  const minute = Math.floor(Date.now() / 60_000);
  const identity = request.ip || request.socket.remoteAddress || "unknown";
  const current = buckets.get(identity);
  const bucket = current?.minute === minute ? current : { minute, count: 0 };
  bucket.count += 1;
  buckets.set(identity, bucket);
  if (bucket.count > env.X402_FACILITATOR_REQUESTS_PER_MINUTE) return "FACILITATOR_RATE_LIMITED";
  if (requirements.network === "stellar:pubnet" && env.x402MainnetApiKeys.size > 0) {
    if (!env.x402MainnetApiKeys.has(request.header("x-api-key") ?? "")) return "MAINNET_CALLER_UNAUTHORIZED";
  }
  return null;
}

export function resetFacilitatorAccessForTests(): void { buckets.clear(); }
