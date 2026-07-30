import { AutoLayerError, PaymentRequiredError } from "./errors.js";
import type {
  ActivateAutomationInput,
  ActivationResponse,
  AutomationEnvironment,
  AutomationRef,
  AutomationResponse,
  LifecycleResponse,
  Network,
  PaymentPrepareInput,
  PaymentPrepareResponse,
  PaymentSettleInput,
  PaymentSettlementResponse,
  PaymentResponse,
  ProposalResponse,
  ProposeAutomationInput,
  RequestPaymentOptions,
  X402PaymentRequirements,
} from "./types.js";

export const API_URLS = {
  PRODUCTION: "https://core.autolayer.io",
  DEVELOPMENT: "http://localhost:5001",
} as const;

export interface AutoLayerConfiguration {
  /** Selects the AutoLayer API deployment. This is independent of Stellar network. */
  environment?: AutomationEnvironment;
  /** Optional URL override for staging, LAN, tests, or private deployments. */
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface ApiFailure {
  error?: string;
  code?: string;
  paymentRequirements?: X402PaymentRequirements;
  [key: string]: unknown;
}

interface NormalizedAutomationRef {
  automationId: string;
  network?: Network;
}

export class AutoLayerClient {
  private configuration: AutoLayerConfiguration;
  private readonly automationNetworks = new Map<string, Network>();

  constructor(configuration: AutoLayerConfiguration = {}) {
    this.configuration = { environment: "DEVELOPMENT", ...configuration };
  }

  configure(configuration: AutoLayerConfiguration): void {
    this.configuration = { ...this.configuration, ...configuration };
  }

  async propose(input: ProposeAutomationInput): Promise<ProposalResponse> {
    const proposal = await this.request<ProposalResponse>(
      "/v1/automations/proposals",
      { method: "POST", body: input }
    );
    this.automationNetworks.set(proposal.automationId, input.network);
    return proposal;
  }

  get(ref: AutomationRef): Promise<AutomationResponse> {
    const normalized = this.normalizeRef(ref);
    return this.request<AutomationResponse>(
      `/v1/automations/${encodeURIComponent(normalized.automationId)}`,
      { method: "GET" }
    );
  }

  /** Returns the current 402 requirements. Kept for discovery/backward compatibility. */
  async pay(
    ref: AutomationRef,
    options: RequestPaymentOptions = {}
  ): Promise<PaymentResponse> {
    const normalized = this.normalizeRef(ref);
    const path = `/v1/automations/${encodeURIComponent(
      normalized.automationId
    )}/pay`;
    return this.paymentAwareRequest<PaymentResponse>(
      path,
      { method: "POST", body: {} },
      normalized,
      "pay",
      options
    );
  }

  preparePayment(
    ref: AutomationRef,
    input: PaymentPrepareInput
  ): Promise<PaymentPrepareResponse> {
    const normalized = this.normalizeRef(ref);
    return this.request<PaymentPrepareResponse>(
      `/v1/automations/${encodeURIComponent(
        normalized.automationId
      )}/payment/prepare`,
      { method: "POST", body: input }
    );
  }

  settlePayment(
    ref: AutomationRef,
    input: PaymentSettleInput
  ): Promise<PaymentSettlementResponse> {
    const normalized = this.normalizeRef(ref);
    return this.request<PaymentSettlementResponse>(
      `/v1/automations/${encodeURIComponent(
        normalized.automationId
      )}/payment/settle`,
      { method: "POST", body: input }
    );
  }

  async activate(
    ref: AutomationRef,
    input: ActivateAutomationInput,
    options: RequestPaymentOptions = {}
  ): Promise<ActivationResponse> {
    const normalized = this.normalizeRef(ref);
    const path = `/v1/automations/${encodeURIComponent(
      normalized.automationId
    )}/activate`;
    return this.paymentAwareRequest<ActivationResponse>(
      path,
      { method: "POST", body: input },
      normalized,
      "activate",
      options
    );
  }

  pause(ref: AutomationRef): Promise<LifecycleResponse> {
    return this.lifecycleRequest(ref, "pause");
  }

  resume(ref: AutomationRef): Promise<LifecycleResponse> {
    return this.lifecycleRequest(ref, "resume");
  }

  revoke(ref: AutomationRef): Promise<LifecycleResponse> {
    return this.lifecycleRequest(ref, "revoke");
  }

  private lifecycleRequest(
    ref: AutomationRef,
    action: "pause" | "resume" | "revoke"
  ): Promise<LifecycleResponse> {
    const normalized = this.normalizeRef(ref);
    return this.request<LifecycleResponse>(
      `/v1/automations/${encodeURIComponent(
        normalized.automationId
      )}/${action}`,
      { method: "POST", body: {} }
    );
  }

  private normalizeRef(ref: AutomationRef): NormalizedAutomationRef {
    if (typeof ref !== "string") {
      this.automationNetworks.set(ref.automationId, ref.network);
      return { automationId: ref.automationId, network: ref.network };
    }
    const network = this.automationNetworks.get(ref);
    return network === undefined
      ? { automationId: ref }
      : { automationId: ref, network };
  }

  private async paymentAwareRequest<T>(
    path: string,
    request: { method: string; body?: unknown },
    ref: NormalizedAutomationRef,
    operation: "pay" | "activate",
    options: RequestPaymentOptions
  ): Promise<T> {
    if (options.paymentSignature) {
      return this.request<T>(path, {
        ...request,
        paymentSignature: options.paymentSignature,
      });
    }

    try {
      return await this.request<T>(path, request);
    } catch (error) {
      if (!(error instanceof PaymentRequiredError) || !options.paymentHandler) {
        throw error;
      }
      if (!ref.network) {
        throw new AutoLayerError(
          "Network is required by the payment handler. Pass the original proposal or { automationId, network }.",
          400,
          "NETWORK_REQUIRED"
        );
      }
      const signature = await options.paymentHandler(error.requirements, {
        automationId: ref.automationId,
        network: ref.network,
        operation,
      });
      if (!signature) {
        throw new AutoLayerError(
          "paymentHandler returned an empty payment signature",
          400,
          "EMPTY_PAYMENT_SIGNATURE"
        );
      }
      return this.request<T>(path, { ...request, paymentSignature: signature });
    }
  }

  private async request<T>(
    path: string,
    input: { method: string; body?: unknown; paymentSignature?: string }
  ): Promise<T> {
    const fetchImpl = this.configuration.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new AutoLayerError(
        "A Fetch API implementation is required",
        500,
        "FETCH_UNAVAILABLE"
      );
    }

    const controller = new AbortController();
    const timeoutMs = this.configuration.timeoutMs ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...this.configuration.headers,
      };
      if (input.body !== undefined)
        headers["Content-Type"] = "application/json";
      if (input.paymentSignature)
        headers["PAYMENT-SIGNATURE"] = input.paymentSignature;

      const init: RequestInit = {
        method: input.method,
        headers,
        signal: controller.signal,
      };
      if (input.body !== undefined) init.body = JSON.stringify(input.body);

      const response = await fetchImpl(`${this.resolveApiUrl()}${path}`, init);
      const body = await parseBody(response);

      if (response.status === 402) {
        const failure = (body ?? {}) as ApiFailure;
        if (!failure.paymentRequirements) {
          throw new AutoLayerError(
            "Server returned 402 without payment requirements",
            402,
            "PAYMENT_REQUIREMENTS_MISSING",
            body
          );
        }
        throw new PaymentRequiredError(failure.paymentRequirements, body);
      }

      if (!response.ok) {
        const failure = (body ?? {}) as ApiFailure;
        throw new AutoLayerError(
          failure.error ??
            `AutoLayer request failed with status ${response.status}`,
          response.status,
          failure.code,
          body
        );
      }

      const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
      if (paymentResponseHeader && body && typeof body === "object") {
        try {
          const decoded = JSON.parse(decodeBase64(paymentResponseHeader));
          return { ...(body as object), paymentResponse: decoded } as T;
        } catch {
          return body as T;
        }
      }
      return body as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AutoLayerError(
          `AutoLayer request timed out after ${timeoutMs}ms`,
          408,
          "REQUEST_TIMEOUT"
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveApiUrl(): string {
    if (this.configuration.apiUrl) {
      return this.configuration.apiUrl.replace(/\/$/, "");
    }
    return API_URLS[this.configuration.environment ?? "DEVELOPMENT"];
  }
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function decodeBase64(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }
  return atob(value);
}
