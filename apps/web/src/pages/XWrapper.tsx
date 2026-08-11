import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Eye,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import {
  api,
  type GatewayAnalytics,
  type GatewayWrapper,
  type VaultSecret,
} from "../lib/api";

const USDC = {
  "stellar:testnet": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "stellar:pubnet": "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
} as const;
type View = "detail" | "vault";

export function XWrapper({
  address,
  sessionToken,
  onAuthenticate,
}: {
  address: string;
  sessionToken: string;
  onAuthenticate: () => Promise<string>;
}) {
  const notify = useToast();
  const key = sessionToken;
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<GatewayWrapper[]>([]);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [selected, setSelected] = useState<GatewayWrapper>();
  const [analytics, setAnalytics] = useState<GatewayAnalytics>();
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<View>("detail");
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(async () => {
    if (!key || !address) return;
    setBusy("load");
    try {
      const [wrappers, vault] = await Promise.all([
        api.wrappers(key),
        api.vaultSecrets(key),
      ]);
      setItems(wrappers.items);
      setSecrets(vault.items);
      setSelected((current) =>
        current
          ? wrappers.items.find((item) => item.id === current.id)
          : wrappers.items[0],
      );
      setConnected(true);
    } catch (error) {
      setConnected(false);
      notify("Could not connect to xWrapper", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }, [address, key, notify]);
  useEffect(() => {
    if (address && key) void load();
    else {
      setConnected(false);
      setItems([]);
      setSecrets([]);
      setSelected(undefined);
    }
  }, [address, load]);
  async function createSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("secret");
    try {
      const data = new FormData(event.currentTarget);
      const secret = await api.createVaultSecret(key, {
        name: String(data.get("name")),
        value: String(data.get("value")),
      });
      setSecrets((current) => [secret, ...current]);
      event.currentTarget.reset();
      notify("Secret encrypted and stored", { kind: "success" });
    } catch (error) {
      notify("Secret creation failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }
  async function toggle() {
    if (!selected) return;
    setBusy("toggle");
    try {
      const updated = await api.updateWrapper(key, selected.id, {
        enabled: !selected.enabled,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
      notify(updated.enabled ? "Wrapper is live" : "Wrapper disabled", {
        kind: "success",
      });
    } catch (error) {
      notify("State change failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy("delete");
    try {
      await api.deleteWrapper(key, selected.id);
      const next = items.filter((item) => item.id !== selected.id);
      setItems(next);
      setSelected(next[0]);
      setAnalytics(undefined);
      setConfirmDelete(false);
      notify("Wrapper permanently deleted", { kind: "success" });
    } catch (error) {
      notify("Delete failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }
  async function loadAnalytics() {
    if (!selected) return;
    setBusy("analytics");
    try {
      setAnalytics(await api.wrapperAnalytics(key, selected.id));
    } catch (error) {
      notify("Analytics failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }
  const filtered = items.filter((item) =>
    `${item.name} ${item.slug} ${item.endpoint}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const live = items.filter((item) => item.enabled).length;
  const requests = analytics?.summary.requests ?? 0;
  const success = requests
    ? Math.round(
        (Number(analytics?.summary.successful || 0) / Number(requests)) * 100,
      )
    : 0;
  const snippet = selected
    ? `import { wrapFetchWithPayment } from "@x402/fetch";\n\nconst paidFetch = wrapFetchWithPayment(fetch, walletClient);\nconst response = await paidFetch("${selected.endpoint}");\nconst data = await response.json();`
    : "";
  return (
    <div className="console-route-page pb-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="section-label">AUTOLAYER GATEWAY</p>
          <h1 className="mt-2 text-3xl">xWrapper</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Turn any public HTTPS API into a discoverable, usage-based Stellar
            service.
          </p>
        </div>
        {!address ? (
          <span className="network-pill">
            <LockKeyhole />
            Connect wallet to continue
          </span>
        ) : connected ? (
          <div className="flex items-center gap-2">
            <span className="network-pill">
              <i className="status-dot" />
              Gateway connected
            </span>
          </div>
        ) : (
          <button
            className="btn-primary"
            disabled={busy === "auth"}
            onClick={async () => {
              setBusy("auth");
              try {
                await onAuthenticate();
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === "auth" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <ShieldCheck />
            )}
            Authenticate wallet
          </button>
        )}
      </header>
      {!address ? (
        <ConnectionEmpty walletRequired />
      ) : !connected ? (
        <ConnectionEmpty />
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Live wrappers"
              value={live}
              note={`${items.length - live} disabled`}
              icon={<Globe2 />}
            />
            <Metric
              label="Recorded requests"
              value={requests}
              note="Selected deployment"
              icon={<Activity />}
            />
            <Metric
              label="Success rate"
              value={requests ? `${success}%` : "—"}
              note="Delivered upstream responses"
              icon={<CheckCircle2 />}
            />
            <Metric
              label="Vault secrets"
              value={secrets.length}
              note="Encrypted at rest"
              icon={<KeyRound />}
            />
          </section>
          {!items.length && view !== "vault" ? (
            <section className="xwrapper-first-deploy mt-6">
              <div className="xwrapper-first-icon">
                <Globe2 />
              </div>
              <div>
                <p className="section-label">YOUR FIRST ENDPOINT</p>
                <h2>Publish an API that pays for itself</h2>
                <p>
                  Connect an HTTPS upstream, choose a Stellar asset and price,
                  then publish it as an x402 resource. AutoLayer handles payment
                  verification, settlement, credentials, and discovery.
                </p>
                <div className="xwrapper-first-actions">
                  <Link className="btn-primary" to="/console/xwrapper/new">
                    <Plus />
                    Deploy your first wrapper
                  </Link>
                  <button
                    className="btn-secondary"
                    onClick={() => setView("vault")}
                  >
                    <KeyRound />
                    Manage vault credentials
                  </button>
                </div>
              </div>
              <ol>
                <li>
                  <i>1</i>
                  <span>
                    <b>Connect upstream</b>
                    <small>Any public HTTPS API</small>
                  </span>
                </li>
                <li>
                  <i>2</i>
                  <span>
                    <b>Set payment terms</b>
                    <small>Asset, amount, and network</small>
                  </span>
                </li>
                <li>
                  <i>3</i>
                  <span>
                    <b>Publish</b>
                    <small>Gateway and Bazaar listing</small>
                  </span>
                </li>
              </ol>
            </section>
          ) : view === "vault" ? (
            <div className="mt-6">
              <Vault
                secrets={secrets}
                busy={busy}
                onSubmit={createSecret}
                onClose={() => setView("detail")}
              />
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="xwrapper-toolbar">
                <div className="input-with-icon">
                  <Search />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, route, or endpoint…"
                  />
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => setView("vault")}
                >
                  <KeyRound />
                  Vault
                </button>
                <button
                  className="btn-secondary"
                  disabled={busy === "load"}
                  onClick={() => void load()}
                >
                  {busy === "load" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Refresh
                </button>
                <Link className="btn-primary" to="/console/xwrapper/new">
                  <Plus />
                  New wrapper
                </Link>
              </div>
              <section className="panel overflow-hidden">
                <div className="xwrapper-list-head">
                  <div>
                    <h2>Deployments</h2>
                    <p>
                      {filtered.length} of {items.length} wrappers
                    </p>
                  </div>
                  <span>Click a deployment to inspect it</span>
                </div>
                <div className="xwrapper-list-columns">
                  <span>Resource</span>
                  <span>Network</span>
                  <span>Price</span>
                  <span>Status</span>
                  <span />
                </div>
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelected(item);
                      setView("detail");
                      setAnalytics(undefined);
                    }}
                    className={`xwrapper-list-row ${selected?.id === item.id ? "selected" : ""}`}
                  >
                    <span className="xwrapper-resource-icon">
                      <Globe2 />
                    </span>
                    <div className="xwrapper-resource-name">
                      <b>{item.name}</b>
                      <small>/{item.slug}</small>
                    </div>
                    <span>
                      {item.network.endsWith("pubnet") ? "Mainnet" : "Testnet"}
                    </span>
                    <span>{item.amount} atomic</span>
                    <StateBadge enabled={item.enabled} />
                    <ArrowUpRight />
                  </button>
                ))}
                {!filtered.length && (
                  <div className="empty-state min-h-64">
                    <Search />
                    <h3>No matching wrappers</h3>
                    <p>Try a different name, route, or endpoint.</p>
                    <button
                      className="btn-secondary mt-4"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </section>
              {selected && (
                <Detail
                  wrapper={selected}
                  analytics={analytics}
                  snippet={snippet}
                  busy={busy}
                  onToggle={toggle}
                  onAnalytics={loadAnalytics}
                  onCopy={() => {
                    void navigator.clipboard.writeText(snippet);
                    notify("Integration copied", { kind: "success" });
                  }}
                  onDelete={() => setConfirmDelete(true)}
                />
              )}
            </div>
          )}
        </>
      )}
      {confirmDelete && selected && (
        <Confirm
          name={selected.name}
          busy={busy === "delete"}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

export function XWrapperCreate({
  address = "",
  sessionToken,
}: {
  address?: string;
  sessionToken: string;
}) {
  const notify = useToast();
  const navigate = useNavigate();
  const key = sessionToken;
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [authType, setAuthType] = useState("none");
  const [network, setNetwork] = useState<keyof typeof USDC>("stellar:testnet");
  const [name, setName] = useState("");
  const [generatedSlug, setGeneratedSlug] = useState("");
  const [slugState, setSlugState] = useState<
    "idle" | "checking" | "unique" | "adjusted"
  >("idle");
  const [busy, setBusy] = useState("");
  const [connected, setConnected] = useState(false);
  const connect = useCallback(async () => {
    if (!key) return;
    setBusy("load");
    try {
      const result = await api.vaultSecrets(key);
      setSecrets(result.items);
      setConnected(true);
    } catch (error) {
      setConnected(false);
      notify("Could not connect to xWrapper", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }, [key, notify]);
  useEffect(() => {
    void connect();
  }, [connect]);
  useEffect(() => {
    if (!key || name.trim().length < 2) {
      setGeneratedSlug("");
      setSlugState("idle");
      return;
    }
    setSlugState("checking");
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.wrapperSlug(key, name.trim());
        setGeneratedSlug(result.slug);
        setSlugState(result.modified ? "adjusted" : "unique");
      } catch {
        setGeneratedSlug("");
        setSlugState("idle");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [key, name]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    try {
      const data = new FormData(event.currentTarget);
      const wrapper = await api.createWrapper(key, {
        slug: generatedSlug,
        name: String(data.get("name")),
        description: String(data.get("description")),
        upstreamUrl: String(data.get("upstreamUrl")),
        network,
        asset: String(data.get("asset")),
        amount: String(data.get("amount")),
        payTo: String(data.get("payTo")),
        mimeType: String(data.get("mimeType")),
        tags: String(data.get("tags"))
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        secretId: String(data.get("secretId") || "") || null,
        authType,
        authHeader:
          authType === "header"
            ? String(data.get("authHeader") || "x-api-key")
            : null,
        requestsPerMinute: Number(data.get("rpm")),
        monthlyRequestQuota: Number(data.get("quota")),
        maxRequestBytes: Number(data.get("requestLimit")) * 1024,
        maxResponseBytes: Number(data.get("responseLimit")) * 1024,
        enabled: true,
      });
      notify("xWrapper deployed and published", {
        kind: "success",
        detail: wrapper.endpoint,
      });
      navigate("/console/xwrapper");
    } catch (error) {
      notify("Deployment failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  }
  if (!address || !sessionToken || !connected)
    return (
      <div className="console-route-page">
        <Link
          to="/console/xwrapper"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to xWrapper
        </Link>
        <div className="panel mt-6 p-8">
          <p className="section-label">WALLET SESSION REQUIRED</p>
          <h1 className="mt-3 text-3xl">Authenticate before deploying</h1>
          <p className="mt-2 text-sm text-slate-400">
            Return to xWrapper and authenticate with your connected Stellar
            wallet.
          </p>
          <Link className="btn-primary mt-6" to="/console/xwrapper">
            <ShieldCheck />
            Authenticate wallet
          </Link>
        </div>
      </div>
    );
  return (
    <div className="console-route-page">
      <div className="mb-6">
        <Link
          to="/console/xwrapper"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to deployments
        </Link>
        <p className="section-label mt-6">CREATE XWRAPPER</p>
        <h1 className="mt-2 text-3xl">Deploy a paid API</h1>
        <p className="mt-2 text-sm text-slate-400">
          Required fields are marked. Optional metadata can be added now or
          configured later.
        </p>
      </div>
      <DeployForm
        address={address}
        name={name}
        setName={setName}
        generatedSlug={generatedSlug}
        slugState={slugState}
        authType={authType}
        setAuthType={setAuthType}
        network={network}
        setNetwork={setNetwork}
        secrets={secrets}
        busy={busy}
        onSubmit={create}
        onClose={() => navigate("/console/xwrapper")}
      />
    </div>
  );
}

function ConnectionEmpty({
  walletRequired = false,
}: {
  walletRequired?: boolean;
}) {
  return (
    <div className="panel mt-8 overflow-hidden">
      <div className="empty-state py-24">
        <LockKeyhole />
        <h3>
          {walletRequired
            ? "Connect your Stellar wallet"
            : "Authenticate your wallet"}
        </h3>
        <p>
          {walletRequired
            ? "Your private xWrapper deployments are shown only while your creator session is connected."
            : "Sign the short-lived authentication challenge to open your private xWrapper workspace."}
        </p>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="flex justify-between text-slate-500">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className="mt-5 text-3xl">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </div>
  );
}
function StateBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold tracking-wider ${enabled ? "bg-emerald-300/10 text-emerald-300" : "bg-white/5 text-slate-500"}`}
    >
      <i
        className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-300" : "bg-slate-600"}`}
      />
      {enabled ? "LIVE" : "OFF"}
    </span>
  );
}
export function DeployForm({
  address,
  name,
  setName,
  generatedSlug,
  slugState,
  authType,
  setAuthType,
  network,
  setNetwork,
  secrets,
  busy,
  onSubmit,
  onClose,
}: {
  address: string;
  name: string;
  setName: (value: string) => void;
  generatedSlug: string;
  slugState: "idle" | "checking" | "unique" | "adjusted";
  authType: string;
  setAuthType: (v: string) => void;
  network: keyof typeof USDC;
  setNetwork: (v: keyof typeof USDC) => void;
  secrets: VaultSecret[];
  busy: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="panel overflow-hidden">
      <div className="panel-head">
        <div>
          <p className="section-label">NEW DEPLOYMENT</p>
          <h2 className="mt-2 text-xl">Configure xWrapper</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="space-y-7 p-6">
        <FormSection
          number="1"
          title="Resource"
          note="The public service agents will discover."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" hint="Shown in Bazaar">
              <input
                required
                name="name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Realtime market data"
              />
            </Field>
            <Field
              label="Endpoint slug"
              hint={
                slugState === "checking"
                  ? "Checking availability…"
                  : slugState === "adjusted"
                    ? "A suffix was added because the original route exists."
                    : slugState === "unique"
                      ? "Available and globally unique"
                      : "Generated automatically from the display name"
              }
            >
              <div className="slug-preview">
                <span>/</span>
                <input
                  readOnly
                  name="slug"
                  value={generatedSlug}
                  placeholder="generated-from-name"
                />
                <i className={slugState}>
                  {slugState === "checking" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : slugState === "unique" || slugState === "adjusted" ? (
                    <CheckCircle2 />
                  ) : null}
                </i>
              </div>
            </Field>
          </div>
          <Field
            label="Description"
            hint="Explain the result an agent receives"
          >
            <input
              required
              name="description"
              className="input"
              placeholder="Latest prices and liquidity across Stellar markets"
            />
          </Field>
          <Field
            label="HTTPS upstream"
            hint="Public address only; redirects and private networks are blocked"
          >
            <input
              required
              name="upstreamUrl"
              type="url"
              pattern="https://.*"
              className="input"
              placeholder="https://api.example.com/v1/data"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Response type">
              <select name="mimeType" className="input">
                <option>application/json</option>
                <option>text/plain</option>
                <option>application/octet-stream</option>
              </select>
            </Field>
            <Field label="Bazaar tags" optional>
              <input
                name="tags"
                className="input"
                placeholder="markets, prices, defi"
              />
            </Field>
          </div>
        </FormSection>
        <FormSection
          number="2"
          title="Payment"
          note="Exact Stellar settlement before the request is proxied."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Network">
              <select
                value={network}
                onChange={(e) =>
                  setNetwork(e.target.value as keyof typeof USDC)
                }
                className="input"
              >
                <option value="stellar:testnet">Testnet</option>
                <option value="stellar:pubnet">Mainnet</option>
              </select>
            </Field>
            <Field label="Atomic price" hint="USDC uses 7 decimal places">
              <input
                required
                name="amount"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                defaultValue="10000"
                className="input"
              />
            </Field>
          </div>
          <Field label="SEP-41 asset contract">
            <input
              required
              name="asset"
              pattern="C[A-Z2-7]{55}"
              className="input font-mono text-xs"
              value={USDC[network]}
              readOnly
            />
          </Field>
          <Field
            label="Treasury"
            hint="Funds settle directly to this Stellar address"
          >
            <input
              required
              name="payTo"
              pattern="[GC][A-Z2-7]{55}"
              className="input font-mono text-xs"
              defaultValue={address}
            />
          </Field>
        </FormSection>
        <FormSection
          number="3"
          title="Upstream access"
          note="Credentials are decrypted only for a paid request."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Authorization">
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="input"
              >
                <option value="none">No credentials</option>
                <option value="header">API key header</option>
                <option value="bearer">Bearer token</option>
              </select>
            </Field>
            {authType !== "none" && (
              <Field label="xVault2 secret">
                <select required name="secretId" className="input">
                  <option value="">Select encrypted secret</option>
                  {secrets.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {authType === "header" && (
            <Field label="Header name">
              <input
                required
                name="authHeader"
                className="input"
                defaultValue="x-api-key"
              />
            </Field>
          )}
          {authType !== "none" && !secrets.length && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-4 text-xs text-amber-200">
              Create a vault secret before deploying a credentialed upstream.
            </div>
          )}
        </FormSection>
        <FormSection
          number="4"
          title="Traffic controls"
          note="Limits are enforced atomically across gateway replicas."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Requests per minute">
              <input
                required
                name="rpm"
                type="number"
                min="1"
                max="10000"
                defaultValue="60"
                className="input"
              />
            </Field>
            <Field label="Monthly requests">
              <input
                required
                name="quota"
                type="number"
                min="1"
                defaultValue="100000"
                className="input"
              />
            </Field>
            <Field label="Max request (KB)">
              <input
                required
                name="requestLimit"
                type="number"
                min="0"
                max="10240"
                defaultValue="1024"
                className="input"
              />
            </Field>
            <Field label="Max response (KB)">
              <input
                required
                name="responseLimit"
                type="number"
                min="1"
                max="51200"
                defaultValue="5120"
                className="input"
              />
            </Field>
          </div>
        </FormSection>
        <div className="notice">
          <ShieldCheck />
          <span>
            Deploying validates DNS, publishes the resource to Bazaar, and
            immediately enables its payment gate.
          </span>
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-white/8 p-5">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={
            !!busy ||
            !generatedSlug ||
            slugState === "checking" ||
            (authType !== "none" && !secrets.length)
          }
          className="btn-primary"
        >
          {busy === "create" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ArrowUpRight />
          )}
          {busy === "create" ? "Validating and deploying…" : "Deploy xWrapper"}
        </button>
      </div>
    </form>
  );
}
function Vault({
  secrets,
  busy,
  onSubmit,
  onClose,
}: {
  secrets: VaultSecret[];
  busy: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-head">
        <div>
          <p className="section-label">XVAULT2</p>
          <h2 className="mt-2 text-xl">Upstream credentials</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <X />
        </button>
      </div>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="border-b border-white/8 p-6"
      >
        <p className="text-sm text-slate-400">
          Encrypt an API key or bearer token. Secret values cannot be read back
          after creation.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input
            required
            name="name"
            className="input"
            placeholder="OpenWeather production"
          />
          <input
            required
            name="value"
            type="password"
            className="input"
            placeholder="Paste secret value"
          />
          <button disabled={!!busy} className="btn-primary">
            {busy === "secret" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LockKeyhole />
            )}
            Encrypt
          </button>
        </div>
      </form>
      <div className="divide-y divide-white/5">
        {secrets.map((secret) => (
          <div
            key={secret.id}
            className="flex items-center justify-between p-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300/10 text-emerald-300">
                <KeyRound size={16} />
              </span>
              <div>
                <p className="text-sm">{secret.name}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-600">
                  {secret.id}
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-500">••••••••</span>
          </div>
        ))}
        {!secrets.length && (
          <div className="empty-state">
            <KeyRound />
            <h3>No secrets stored</h3>
            <p>Add one only if an upstream requires authentication.</p>
          </div>
        )}
      </div>
    </div>
  );
}
function Detail({
  wrapper,
  analytics,
  snippet,
  busy,
  onToggle,
  onAnalytics,
  onCopy,
  onDelete,
}: {
  wrapper: GatewayWrapper;
  analytics?: GatewayAnalytics;
  snippet: string;
  busy: string;
  onToggle: () => void;
  onAnalytics: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StateBadge enabled={wrapper.enabled} />
              <h2 className="mt-4 text-2xl">{wrapper.name}</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                {wrapper.description}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={!!busy}
                onClick={onToggle}
                className="btn-secondary"
              >
                {busy === "toggle" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Power />
                )}
                {wrapper.enabled ? "Disable" : "Enable"}
              </button>
              <button
                onClick={onDelete}
                className="icon-btn text-red-300"
                title="Delete wrapper"
              >
                <Trash2 />
              </button>
            </div>
          </div>
          <a
            href={wrapper.endpoint}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center justify-between rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-4 font-mono text-xs text-emerald-300"
          >
            <span className="truncate">{wrapper.endpoint}</span>
            <ExternalLink size={14} />
          </a>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Network",
                wrapper.network.endsWith("pubnet") ? "Mainnet" : "Testnet",
              ],
              ["Price", `${wrapper.amount} atomic`],
              ["Rate limit", `${wrapper.requestsPerMinute}/min`],
              ["Monthly quota", wrapper.monthlyRequestQuota.toLocaleString()],
            ].map(([label, value]) => (
              <div className="rounded-xl bg-black/20 p-4" key={label}>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-sm">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3>Buyer integration</h3>
            <p className="mt-1 text-xs text-slate-500">
              Standard x402 clients handle challenge, authorization and retry.
            </p>
          </div>
          <button className="btn-secondary" onClick={onCopy}>
            <Clipboard />
            Copy
          </button>
        </div>
        <pre className="code-output mt-5">{snippet}</pre>
      </section>
      <section className="panel overflow-hidden">
        <div className="panel-head">
          <div>
            <h3>Observability</h3>
            <p>Latest 100 requests and settlements</p>
          </div>
          <button
            disabled={!!busy}
            onClick={() => void onAnalytics()}
            className="btn-secondary"
          >
            {busy === "analytics" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </button>
        </div>
        {!analytics ? (
          <div className="empty-state min-h-52">
            <Eye />
            <h3>Load live telemetry</h3>
            <p>
              Request outcomes and payment hashes are retained by the gateway.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <Metric
                label="Requests"
                value={analytics.summary.requests}
                note="All outcomes"
                icon={<Activity />}
              />
              <Metric
                label="Successful"
                value={analytics.summary.successful}
                note="Delivered responses"
                icon={<CheckCircle2 />}
              />
              <Metric
                label="Average latency"
                value={`${analytics.summary.average_latency_ms}ms`}
                note="Gateway duration"
                icon={<RefreshCw />}
              />
            </div>
            <div className="grid border-t border-white/8 xl:grid-cols-2">
              <LogTable title="Recent requests" rows={analytics.requests} />
              <LogTable title="Settled payments" rows={analytics.payments} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
function LogTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <div className="min-w-0 border-b border-white/8 p-5 xl:border-b-0 xl:border-r">
      <h4 className="text-xs uppercase tracking-wider text-slate-500">
        {title}
      </h4>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {rows.map((row, index) => (
          <div
            key={String(row.request_id || row.transaction_hash || index)}
            className="rounded-lg bg-black/20 p-3"
          >
            <div className="flex justify-between gap-3 text-xs">
              <span className="truncate font-mono">
                {String(row.path || row.transaction_hash || "—")}
              </span>
              <span className="text-emerald-300">
                {String(row.outcome || row.status || "")}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">
              {String(row.created_at || row.settled_at || "")}
            </p>
          </div>
        ))}
        {!rows.length && (
          <p className="py-8 text-center text-xs text-slate-600">
            No records yet
          </p>
        )}
      </div>
    </div>
  );
}
function Confirm({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-[#0a1210] p-6 shadow-2xl">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-400/10 text-red-300">
          <Trash2 />
        </span>
        <h2 className="mt-5 text-xl">Delete {name}?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          The endpoint will stop immediately. Its configuration, request logs,
          and payment history will be permanently removed.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button disabled={busy} className="btn-secondary" onClick={onCancel}>
            Keep wrapper
          </button>
          <button
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
            onClick={() => void onConfirm()}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
function FormSection({
  number,
  title,
  note,
  children,
}: {
  number: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex gap-3">
        <span className="step shrink-0">{number}</span>
        <div>
          <h3 className="text-sm">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
      </div>
      <div className="grid gap-4 pl-9">{children}</div>
    </section>
  );
}
function Field({
  label,
  hint,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="flex justify-between gap-2">
        <b className="flex items-center gap-2 font-medium">
          {label}
          <small
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${optional ? "bg-white/5 text-slate-600" : "bg-emerald-300/10 text-emerald-300"}`}
          >
            {optional ? "Optional" : "Required"}
          </small>
        </b>
        {hint && <small className="font-normal text-slate-600">{hint}</small>}
      </span>
      {children}
    </label>
  );
}
