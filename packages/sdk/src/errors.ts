import type { X402PaymentRequirements } from "./types.js";

export class AutoLayerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AutoLayerError";
  }
}

export class PaymentRequiredError extends AutoLayerError {
  constructor(public readonly requirements: X402PaymentRequirements, details?: unknown) {
    super("Payment required", 402, "PAYMENT_REQUIRED", details);
    this.name = "PaymentRequiredError";
  }
}
