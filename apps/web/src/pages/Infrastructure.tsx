import {
  BookOpen,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  StatePill,
  Surface,
  SurfaceHeader,
} from "../components/ConsoleUI";
import { useToast } from "../components/Toast";
import {
  api,
  type DiscoveryResource,
  type Skill,
  type SupportedResponse,
} from "../lib/api";

export function Facilitator() {
  const [data, setData] = useState<SupportedResponse>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.supported());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const networks = data
    ? new Set(data.kinds.map((item) => item.network)).size
    : 0;
  return (
    <div>
      <PageHeader
        eyebrow="x402 infrastructure"
        title="Facilitator"
        description="Live payment capabilities, supported networks, and settlement signers reported by the running service."
        actions={
          <button
            className="btn-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </button>
        }
      />
      {error ? (
        <Surface className="mt-7">
          <ErrorState message={error} onRetry={() => void load()} />
        </Surface>
      ) : loading && !data ? (
        <Surface className="mt-7">
          <LoadingState label="Querying facilitator" />
        </Surface>
      ) : (
        data && (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Metric
                label="Payment kinds"
                value={data.kinds.length}
                note="Advertised settlement options"
                icon={<Server />}
              />
              <Metric
                label="Networks"
                value={networks}
                note="Testnet and mainnet"
                icon={<Sparkles />}
              />
              <Metric
                label="Extensions"
                value={data.extensions.length}
                note="Registered protocol extensions"
                icon={<Boxes />}
              />
            </div>
            <Surface className="mt-5">
              <SurfaceHeader
                title="Supported settlement"
                description="Canonical response from GET /supported"
              />
              <div className="overflow-x-auto">
                <table className="console-table min-w-[680px]">
                  <thead>
                    <tr>
                      <th>Network</th>
                      <th>Scheme</th>
                      <th>Protocol</th>
                      <th>Network fees</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kinds.map((kind) => (
                      <tr key={`${kind.network}-${kind.scheme}`}>
                        <td className="console-code text-emerald-300">
                          {kind.network}
                        </td>
                        <td>{kind.scheme}</td>
                        <td>x402 v{kind.x402Version}</td>
                        <td>
                          {kind.extra?.areFeesSponsored ? (
                            <span className="flex items-center gap-2">
                              <Check className="text-emerald-300" />
                              Sponsored
                            </span>
                          ) : (
                            "Buyer pays"
                          )}
                        </td>
                        <td>
                          <StatePill status="Online" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
            <Surface className="mt-5">
              <SurfaceHeader
                title="Settlement signers"
                description="Public identities only; secret material never leaves the service"
              />
              <div className="grid gap-px bg-[#1b2824] md:grid-cols-2">
                {Object.entries(data.signers).map(([network, signers]) => (
                  <div className="bg-[#0d1412] p-5" key={network}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                      {network}
                    </p>
                    {signers.map((signer) => (
                      <p
                        className="console-code mt-3 break-all text-[10px] text-slate-400"
                        key={signer}
                      >
                        {signer}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </Surface>
          </>
        )
      )}
    </div>
  );
}

export function Bazaar() {
  const [items, setItems] = useState<DiscoveryResource[]>([]);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("");
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const limit = 12;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (network) params.set("network", network);
      if (type) params.set("type", type);
      if (query.trim()) {
        params.set("query", query.trim());
        params.delete("offset");
        const result = await api.searchResources(params);
        setItems(result.resources);
        setTotal(
          result.partialResults
            ? offset + limit + 1
            : offset + result.resources.length,
        );
      } else {
        const result = await api.resources(params);
        setItems(result.items);
        setTotal(result.pagination.total);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [query, network, type, offset]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);
  return (
    <div>
      <PageHeader
        eyebrow="Discovery"
        title="Bazaar"
        description="Search machine-payable HTTP endpoints and MCP tools cataloged after verified settlement."
      />
      <Surface className="mt-7 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px_auto]">
          <div className="input-with-icon">
            <Search />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder="What should the service do?"
            />
          </div>
          <select
            className="input"
            value={network}
            onChange={(event) => {
              setNetwork(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All networks</option>
            <option value="stellar:testnet">Stellar testnet</option>
            <option value="stellar:pubnet">Stellar mainnet</option>
          </select>
          <select
            className="input"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All resource types</option>
            <option value="http">HTTP endpoint</option>
            <option value="mcp">MCP tool</option>
          </select>
          <button
            className="btn-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </button>
        </div>
      </Surface>
      {error ? (
        <Surface className="mt-5">
          <ErrorState message={error} onRetry={() => void load()} />
        </Surface>
      ) : loading ? (
        <Surface className="mt-5">
          <LoadingState label="Searching Bazaar" />
        </Surface>
      ) : !items.length ? (
        <Surface className="mt-5">
          <EmptyState
            icon={<Boxes />}
            title="No matching resources"
            description="Try a broader search or remove one of the filters."
          />
        </Surface>
      ) : (
        <Surface className="mt-5">
          <div className="bazaar-list-head">
            <span>Resource</span>
            <span>Type</span>
            <span>Network</span>
            <span>Price</span>
            <span />
          </div>
          {items.map((item) => (
            <ResourceRow
              resource={item}
              key={`${item.type}-${item.resource}`}
            />
          ))}
        </Surface>
      )}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-[10px] text-slate-600">
          {total} matching resource{total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            <ChevronLeft />
            Previous
          </button>
          <button
            className="btn-secondary"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
            <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}
function ResourceRow({ resource }: { resource: DiscoveryResource }) {
  const accepted = resource.accepts[0];
  let host = resource.resource;
  try {
    host = new URL(resource.resource).hostname;
  } catch {
    return null;
  }
  return (
    <a
      href={resource.resource}
      target="_blank"
      rel="noreferrer"
      className="bazaar-list-row"
    >
      <span className="bazaar-resource-icon">
        {resource.type === "mcp" ? <Sparkles /> : <Server />}
      </span>
      <div>
        <b>{resource.serviceName || host}</b>
        <p>{resource.description || "Machine-payable Stellar service"}</p>
        <small>{host}</small>
      </div>
      <StatePill status={resource.type} />
      <span>{accepted?.network?.replace("stellar:", "") || "—"}</span>
      <span>{accepted ? `${accepted.amount} atomic` : "—"}</span>
      <ExternalLink />
    </a>
  );
}

export function Skills() {
  const notify = useToast();
  const [items, setItems] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("");
  const [network, setNetwork] = useState("");
  const [selected, setSelected] = useState<Skill>();
  const [spec, setSpec] = useState<Record<string, unknown>>();
  const [specLoading, setSpecLoading] = useState(false);
  const [specError, setSpecError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.skills(query, protocol, network);
        setItems(result.items);
        if (
          selected &&
          !result.items.some((item) => item.slug === selected.slug)
        ) {
          setSelected(undefined);
          setSpec(undefined);
        }
        setError("");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Request failed");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, protocol, network]);
  async function open(skill: Skill) {
    setSelected(skill);
    setSpec(undefined);
    setSpecError("");
    setSpecLoading(true);
    try {
      setSpec(await api.skillSpec(skill.slug));
    } catch (error) {
      setSpecError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSpecLoading(false);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="Agent interfaces"
        title="Agent Skills"
        description="Discover versioned, deterministic financial actions without teaching an agent Stellar SDK, RPC, CLI, or XDR."
      />
      <Surface className="skills-toolbar mt-7 p-4">
        <div className="input-with-icon">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by intent, action, or protocol…"
          />
        </div>
        <select
          className="input"
          value={protocol}
          onChange={(event) => setProtocol(event.target.value)}
        >
          <option value="">All protocols</option>
          <option>AutoLayer</option>
          <option>Aquarius</option>
          <option>Soroban</option>
          <option>Stellar Classic</option>
        </select>
        <select
          className="input"
          value={network}
          onChange={(event) => setNetwork(event.target.value)}
        >
          <option value="">All networks</option>
          <option value="stellar:testnet">Stellar testnet</option>
          <option value="stellar:pubnet">Stellar mainnet</option>
        </select>
        <span className="skills-result-count">
          {loading
            ? "Searching…"
            : `${items.length} skill${items.length === 1 ? "" : "s"}`}
        </span>
      </Surface>
      <div className="skills-layout mt-5">
        <Surface className="h-fit">
          <div className="skills-list-heading">
            <span>Available skills</span>
            <small>Choose one to inspect</small>
          </div>
          <div className="skills-list">
            {loading && !items.length ? (
              <LoadingState label="Loading skills" />
            ) : (
              items.map((skill) => (
                <button
                  onClick={() => void open(skill)}
                  className={`skill-list-item ${selected?.slug === skill.slug ? "is-selected" : ""}`}
                  key={skill.slug}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p>
                        {skill.category} · {skill.protocol}
                      </p>
                      <h3>{skill.name}</h3>
                    </div>
                    <ChevronRight className="text-slate-700" />
                  </div>
                  <p className="skill-list-description">{skill.description}</p>
                  <div className="skill-list-meta">
                    {skill.actions.slice(0, 3).map((action) => (
                      <span className="badge" key={action}>
                        {action}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
            {!loading && !items.length && (
              <EmptyState
                icon={<BookOpen />}
                title="No skills found"
                description="Try another search term."
              />
            )}
          </div>
        </Surface>
        <Surface className="min-h-[650px]">
          {!selected ? (
            <EmptyState
              icon={<BookOpen />}
              title="Select an agent skill"
              description="Inspect its inputs, networks, safety requirements, and deterministic errors."
            />
          ) : specLoading ? (
            <LoadingState label="Loading specification" />
          ) : specError ? (
            <ErrorState
              message={specError}
              onRetry={() => void open(selected)}
            />
          ) : !spec ? (
            <EmptyState
              icon={<BookOpen />}
              title="Specification unavailable"
              description="Select another skill or retry the request."
            />
          ) : (
            <>
              <SurfaceHeader
                title={selected.name}
                description={`${selected.protocol} · v${selected.version} · ${selected.authentication} authorization`}
                action={
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        JSON.stringify(spec, null, 2),
                      );
                      notify("Specification copied", { kind: "success" });
                    }}
                  >
                    <Copy />
                    Copy specification
                  </button>
                }
              />
              <SkillSpecification skill={selected} spec={spec} />
            </>
          )}
        </Surface>
      </div>
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-400/15 bg-red-400/[.04] p-3 text-[10px] text-red-300">
          <X />
          {error}
        </div>
      )}
    </div>
  );
}

function SkillSpecification({
  skill,
  spec,
}: {
  skill: Skill;
  spec: Record<string, unknown>;
}) {
  const actionSpecs = Array.isArray(spec.actionSpecs)
    ? (spec.actionSpecs as Array<Record<string, unknown>>)
    : [];
  const errors = Array.isArray(spec.errors)
    ? (spec.errors as Array<Record<string, unknown>>)
    : [];
  const safety = (spec.safety ?? {}) as Record<string, unknown>;
  return (
    <div className="skill-specification">
      <section className="skill-spec-overview">
        <div>
          <span>Networks</span>
          <strong>{skill.networks.length}</strong>
          <small>Testnet and mainnet</small>
        </div>
        <div>
          <span>Actions</span>
          <strong>{skill.actions.length}</strong>
          <small>{skill.actions.join(", ")}</small>
        </div>
        <div>
          <span>Schema</span>
          <strong>{String(spec.schemaVersion ?? "—")}</strong>
          <small>Versioned contract</small>
        </div>
      </section>
      <section className="skill-spec-section">
        <h3>Safety requirements</h3>
        <div className="skill-safety-grid">
          {Object.entries(safety).map(([key, value]) => (
            <div key={key}>
              <Check />
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <b>{value ? "Required" : "No"}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="skill-spec-section">
        <h3>Actions and schemas</h3>
        <div className="space-y-3">
          {actionSpecs.map((action) => (
            <details
              className="skill-action"
              open={actionSpecs.length === 1}
              key={String(action.name)}
            >
              <summary>
                <div>
                  <b>{String(action.name)}</b>
                  <span>{String(action.description ?? "")}</span>
                </div>
                <ChevronRight />
              </summary>
              <div>
                <p>Input schema</p>
                <pre className="code-output">
                  {JSON.stringify(action.inputSchema, null, 2)}
                </pre>
                <p>Output schema</p>
                <pre className="code-output">
                  {JSON.stringify(action.outputSchema, null, 2)}
                </pre>
              </div>
            </details>
          ))}
        </div>
      </section>
      <section className="skill-spec-section">
        <h3>Deterministic errors</h3>
        <div className="skill-errors">
          {errors.map((error) => (
            <div key={String(error.code)}>
              <code>{String(error.code)}</code>
              <span>{String(error.description ?? "")}</span>
              <StatePill status={error.retryable ? "retryable" : "terminal"} />
            </div>
          ))}
        </div>
      </section>
      <details className="skill-raw-spec">
        <summary>View raw JSON specification</summary>
        <pre className="code-output">{JSON.stringify(spec, null, 2)}</pre>
      </details>
    </div>
  );
}
