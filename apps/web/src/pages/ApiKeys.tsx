import {
  Check,
  Clipboard,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  PageHeader,
  StatePill,
  Surface,
  SurfaceHeader,
} from "../components/ConsoleUI";
import { useToast } from "../components/Toast";
import { api, type UserApiKey } from "../lib/api";

export function ApiKeys({
  address,
  sessionToken,
  onAuthenticate,
}: {
  address: string;
  sessionToken: string;
  onAuthenticate: () => Promise<string>;
}) {
  const notify = useToast();
  const [items, setItems] = useState<UserApiKey[]>([]);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState("");
  const load = useCallback(
    async (token = sessionToken) => {
      if (!token) return;
      setBusy("load");
      try {
        setItems((await api.apiKeys(token)).items);
      } catch (error) {
        notify("Could not load API keys", {
          kind: "error",
          detail: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setBusy("");
      }
    },
    [sessionToken, notify],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function authenticate() {
    setBusy("auth");
    try {
      const token = await onAuthenticate();
      await load(token);
      notify("Wallet authenticated", { kind: "success" });
    } finally {
      setBusy("");
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    try {
      const created = await api.createApiKey(sessionToken, name.trim());
      setRevealed(created.key);
      setName("");
      await load();
      notify("API key created", { kind: "success" });
    } finally {
      setBusy("");
    }
  }
  async function rotate(item: UserApiKey) {
    setBusy(item.id);
    try {
      const updated = await api.rotateApiKey(sessionToken, item.id);
      setRevealed(updated.key);
      await load();
      notify("API key rotated", { kind: "success" });
    } finally {
      setBusy("");
    }
  }
  async function revoke(item: UserApiKey) {
    setBusy(item.id);
    try {
      await api.revokeApiKey(sessionToken, item.id);
      await load();
      notify("API key revoked", { kind: "success" });
    } finally {
      setBusy("");
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="Developer access"
        title="API Keys"
        description="Create scoped credentials for SDKs, CI, agents, and xWrapper integrations."
      />
      {!address ? (
        <Surface className="mt-7">
          <EmptyState
            icon={<KeyRound />}
            title="Connect a Stellar wallet"
            description="Wallet authentication establishes ownership of your API keys and resources."
          />
        </Surface>
      ) : !sessionToken ? (
        <Surface className="mt-7">
          <EmptyState
            icon={<ShieldCheck />}
            title="Authenticate your wallet"
            description="Sign a short-lived Stellar challenge. It is never submitted on-chain."
            action={
              <button
                className="btn-primary"
                disabled={busy === "auth"}
                onClick={() => void authenticate()}
              >
                {busy === "auth" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                Authenticate wallet
              </button>
            }
          />
        </Surface>
      ) : (
        <>
          {revealed && (
            <div className="api-key-reveal mt-7">
              <div>
                <span>Copy this key now</span>
                <b>{revealed}</b>
                <p>For security, AutoLayer will not display it again.</p>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  void navigator.clipboard.writeText(revealed);
                  notify("API key copied", { kind: "success" });
                }}
              >
                <Clipboard />
                Copy key
              </button>
              <button className="icon-btn" onClick={() => setRevealed("")}>
                <Check />
              </button>
            </div>
          )}
          <Surface className="mt-7">
            <SurfaceHeader
              title="Personal API keys"
              description="Keys are stored as irreversible SHA-256 hashes"
              action={
                <button
                  className="icon-btn"
                  disabled={busy === "load"}
                  onClick={() => void load()}
                >
                  {busy === "load" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                </button>
              }
            />
            <form className="api-key-create" onSubmit={create}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Key name, e.g. Production agent"
                maxLength={80}
              />
              <button
                className="btn-primary"
                disabled={!name.trim() || busy === "create"}
              >
                {busy === "create" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Generate key
              </button>
            </form>
            <div className="api-key-list-head">
              <span>Name</span>
              <span>Key prefix</span>
              <span>Last used</span>
              <span>Status</span>
              <span />
            </div>
            {items.map((item) => (
              <div className="api-key-row" key={item.id}>
                <div>
                  <b>{item.name}</b>
                  <small>
                    Created {new Date(item.createdAt).toLocaleDateString()}
                  </small>
                </div>
                <code>{item.prefix}••••••••</code>
                <span>
                  {item.lastUsedAt
                    ? new Date(item.lastUsedAt).toLocaleString()
                    : "Never"}
                </span>
                <StatePill status={item.revokedAt ? "revoked" : "active"} />
                <div>
                  <button
                    className="icon-btn"
                    title="Rotate"
                    disabled={busy === item.id || !!item.revokedAt}
                    onClick={() => void rotate(item)}
                  >
                    <RotateCw />
                  </button>
                  <button
                    className="icon-btn"
                    title="Revoke"
                    disabled={busy === item.id || !!item.revokedAt}
                    onClick={() => void revoke(item)}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))}
            {!items.length && (
              <EmptyState
                icon={<KeyRound />}
                title="No API keys"
                description="Generate a personal key for your first integration."
              />
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
