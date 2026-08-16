export type Network = "TESTNET" | "PUBLIC";
export type AutomationKind =
  "CONTRACT_CALL" | "DCA" | "REBALANCE" | "DISBURSEMENT";
const configuredApiUrl = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, "");

// Vite variables are embedded at build time. A missing production variable must
// never send visitors to their own loopback interface.
const API_URL =
  configuredApiUrl ||
  (import.meta.env.PROD
    ? "https://core.autolayer.fi"
    : "http://localhost:5001");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new ApiError(
      data.error || `Request failed (${response.status})`,
      response.status,
    );
  return data;
}
export const api = {
  health: () => request<{ ok: boolean; mode: string }>("/health"),
  authChallenge: (address: string, network: Network = "TESTNET") =>
    request<AuthChallenge>("/v1/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ address, network }),
    }),
  authVerify: (challengeId: string, signedXdr: string) =>
    request<AuthSession>("/v1/auth/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, signedXdr }),
    }),
  authMe: (token: string) =>
    request<{ user: AuthUser }>("/v1/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  authLogout: (token: string) =>
    request<void>("/v1/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: "{}",
    }),
  apiKeys: (token: string) =>
    request<{ items: UserApiKey[] }>("/v1/api-keys", {
      headers: { authorization: `Bearer ${token}` },
    }),
  createApiKey: (token: string, name: string) =>
    request<UserApiKey & { key: string }>("/v1/api-keys", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }),
  rotateApiKey: (token: string, id: string) =>
    request<UserApiKey & { key: string }>(`/v1/api-keys/${id}/rotate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: "{}",
    }),
  revokeApiKey: (token: string, id: string) =>
    request<void>(`/v1/api-keys/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  automations: (walletAddress: string, network?: Network) =>
    request<{ automations: Automation[]; count: number }>(
      `/v1/automations?walletAddress=${encodeURIComponent(walletAddress)}${network ? `&network=${network}` : ""}`,
    ),
  propose: (payload: unknown) =>
    request<Proposal>("/v1/automations/proposals", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  preparePayment: (id: string, payerAddress: string) =>
    request<PaymentPrepare>(`/v1/automations/${id}/payment/prepare`, {
      method: "POST",
      body: JSON.stringify({ payerAddress }),
    }),
  settlePayment: (
    id: string,
    paymentSessionId: string,
    signedAuthEntriesXdr: string[],
  ) =>
    request<PaymentSettlement>(`/v1/automations/${id}/payment/settle`, {
      method: "POST",
      body: JSON.stringify({ paymentSessionId, signedAuthEntriesXdr }),
    }),
  activate: (id: string, policyIdHex: string, transactionHash: string) =>
    request<Activation>(`/v1/automations/${id}/activate`, {
      method: "POST",
      body: JSON.stringify({
        policyIdHex,
        transactionHash,
        firstRunAt: new Date().toISOString(),
      }),
    }),
  pause: (id: string) =>
    request<unknown>(`/v1/automations/${id}/pause`, {
      method: "POST",
      body: "{}",
    }),
  resume: (id: string) =>
    request<unknown>(`/v1/automations/${id}/resume`, {
      method: "POST",
      body: "{}",
    }),
  cancel: (id: string) =>
    request<unknown>(`/v1/automations/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  supported: () => request<SupportedResponse>("/supported"),
  resources: (params: URLSearchParams) =>
    request<DiscoveryResponse>(`/discovery/resources?${params}`),
  searchResources: (params: URLSearchParams) =>
    request<SearchResponse>(`/discovery/search?${params}`),
  skills: (query = "", protocol = "", network = "") =>
    request<SkillsResponse>(
      `/v1/skills?${new URLSearchParams({ query, protocol, network })}`,
    ),
  skillSpec: (slug: string) =>
    request<Record<string, unknown>>(
      `/v1/skills/${encodeURIComponent(slug)}/spec`,
    ),
  wrappers: (key: string) =>
    request<{ items: GatewayWrapper[] }>("/v1/wrappers", {
      headers: { authorization: `Bearer ${key}` },
    }),
  wrapperSlug: (key: string, name: string) =>
    request<{ slug: string; available: boolean; modified: boolean }>(
      `/v1/wrappers/slug?name=${encodeURIComponent(name)}`,
      { headers: { authorization: `Bearer ${key}` } },
    ),
  createWrapper: (key: string, payload: unknown) =>
    request<GatewayWrapper>("/v1/wrappers", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    }),
  updateWrapper: (key: string, id: string, payload: unknown) =>
    request<GatewayWrapper>(`/v1/wrappers/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    }),
  deleteWrapper: (key: string, id: string) =>
    request<void>(`/v1/wrappers/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${key}` },
    }),
  wrapperAnalytics: (key: string, id: string) =>
    request<GatewayAnalytics>(`/v1/wrappers/${id}/analytics`, {
      headers: { authorization: `Bearer ${key}` },
    }),
  vaultSecrets: (key: string) =>
    request<{ items: VaultSecret[] }>("/v1/vault/secrets", {
      headers: { authorization: `Bearer ${key}` },
    }),
  createVaultSecret: (key: string, payload: { name: string; value: string }) =>
    request<VaultSecret>("/v1/vault/secrets", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    }),
};
export interface Automation {
  id: string;
  type: AutomationKind;
  status: string;
  state?: string;
  network: Network;
  schedule: { kind: string; expression: string };
  runCount: number;
  remainingRuns?: number | null;
  nextRunAt?: string | null;
  payment: { status: string };
}
export interface Proposal {
  automationId: string;
  network: Network;
  type: AutomationKind;
  status: string;
  expectedPolicyIdHex: string;
  createSessionArgsXdr: [string, string];
  paymentRequirements: Record<string, unknown>;
  price: { amount: string; asset: string };
  delegatePublicKey: string;
  sessionPolicyInput: { expires_at_ledger: number };
}
export interface PaymentPrepare {
  paymentSessionId: string;
  automationId: string;
  contractId: string;
  unsignedAuthEntriesXdr: string[];
  requirements: Record<string, unknown>;
}
export interface PaymentSettlement {
  automationId: string;
  paymentStatus: "PAID";
  transactionHash: string;
  payer: string;
}
export interface Activation {
  automationId: string;
  status: "ACTIVE";
  policyIdHex: string;
  agendaJobId?: string;
}
export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: { areFeesSponsored?: boolean };
}
export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}
export interface DiscoveryResource {
  resource: string;
  type: string;
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  }>;
  lastUpdated: string;
  description?: string;
  serviceName?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
}
export interface DiscoveryResponse {
  x402Version: number;
  items: DiscoveryResource[];
  pagination: { limit: number; offset: number; total: number };
}
export interface SearchResponse {
  x402Version: number;
  resources: DiscoveryResource[];
  partialResults?: boolean;
  pagination?: { limit: number; cursor: string | null } | null;
}
export interface Skill {
  slug: string;
  name: string;
  protocol: string;
  description: string;
  networks: readonly string[];
  actions: readonly string[];
  version: string;
  category: string;
  authentication: string;
}
export interface SkillsResponse {
  items: Skill[];
  count: number;
}
export interface GatewayWrapper {
  id: string;
  slug: string;
  name: string;
  description: string;
  upstreamUrl: string;
  network: "stellar:testnet" | "stellar:pubnet";
  asset: string;
  amount: string;
  payTo: string;
  mimeType: string;
  tags: string[];
  secretId: string | null;
  authType: "none" | "header" | "bearer";
  authHeader: string | null;
  enabled: boolean;
  requestsPerMinute: number;
  monthlyRequestQuota: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  endpoint: string;
  createdAt: string;
  updatedAt: string;
}
export interface VaultSecret {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}
export interface GatewayAnalytics {
  summary: {
    requests: number;
    successful: number;
    average_latency_ms: number;
    response_bytes: string;
  };
  requests: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}
export interface AuthChallenge {
  challengeId: string;
  transactionXdr: string;
  network: Network;
  expiresAt: string;
}
export interface AuthUser {
  id: string;
  walletAddress: string;
}
export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}
export interface UserApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
