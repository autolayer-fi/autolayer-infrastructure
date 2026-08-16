import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  Field,
  PageHeader,
  StatePill,
  Surface,
  SurfaceHeader,
} from "../components/ConsoleUI";
import { useToast } from "../components/Toast";
import {
  api,
  type Automation,
  type GatewayWrapper,
  type Network,
  type Proposal,
} from "../lib/api";
import {
  fundTestnetAccount,
  getAccountStatus,
  getLatestLedger,
  invokeContract,
  sendXlm,
  type AccountStatus,
} from "../lib/stellar";
import { signAuthEntry } from "../lib/wallet";

export function ConsoleOverview({
  address,
  sessionToken,
}: {
  address: string;
  sessionToken: string;
}) {
  const [health, setHealth] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [wrappers, setWrappers] = useState<GatewayWrapper[]>([]);
  const [resourceCount, setResourceCount] = useState(0);
  const [networkCount, setNetworkCount] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  useEffect(() => {
    api
      .health()
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, []);
  useEffect(() => {
    setLoadingMetrics(true);
    Promise.all([
      api.resources(new URLSearchParams({ limit: "1", offset: "0" })),
      api.supported(),
      sessionToken
        ? api.wrappers(sessionToken)
        : Promise.resolve({ items: [] as GatewayWrapper[] }),
    ])
      .then(([resources, supported, wrapperResult]) => {
        setResourceCount(resources.pagination.total);
        setNetworkCount(
          new Set(supported.kinds.map((item) => item.network)).size,
        );
        setWrappers(wrapperResult.items);
      })
      .catch(() => {
        setResourceCount(0);
        setNetworkCount(0);
        setWrappers([]);
      })
      .finally(() => setLoadingMetrics(false));
  }, [sessionToken]);
  const liveWrappers = wrappers.filter((item) => item.enabled).length;
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Publish paid APIs, inspect Stellar x402 capabilities, and discover services built for agents."
      />
      {!address && (
        <section className="dashboard-welcome mt-7">
          <span>
            <Wallet />
          </span>
          <p>GET STARTED</p>
          <h2>Explore publicly, connect to publish</h2>
          <div>
            Bazaar and facilitator capabilities are public. Connect your wallet
            only when you are ready to manage credentials or deploy an xWrapper.
          </div>
          <small>
            Use <b>Connect wallet</b> in the top-right corner to continue.
          </small>
        </section>
      )}
      <section className="dashboard-summary mt-7">
            <DashboardStat
              label="Your xWrappers"
              value={loadingMetrics ? "—" : wrappers.length}
              note={address ? "Owned by this wallet" : "Connect to manage"}
            />
            <DashboardStat
              label="Live wrappers"
              value={loadingMetrics ? "—" : liveWrappers}
              note="Published paid APIs"
              tone="success"
            />
            <DashboardStat
              label="Bazaar resources"
              value={loadingMetrics ? "—" : resourceCount}
              note="HTTP and MCP listings"
            />
            <DashboardStat
              label="x402 networks"
              value={loadingMetrics ? "—" : networkCount}
              note="Advertised capabilities"
            />
      </section>
          <div className="dashboard-section-heading mt-8">
            <div>
              <h2>Seller-to-agent workflow</h2>
              <p>
                Bring an API, publish its payment terms, and make it discoverable.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-center text-xs text-slate-400 sm:grid-cols-4">
            {[
              "1. Store API credential",
              "2. Deploy xWrapper",
              "3. Verify HTTP 402",
              "4. Discover in Bazaar",
            ].map((step) => (
              <div
                className="rounded-lg border border-white/10 bg-white/[.025] px-3 py-3"
                key={step}
              >
                {step}
              </div>
            ))}
          </div>
          <section className="dashboard-cta-grid mt-4">
            <DashboardCta
              to="/console/xwrapper/new"
              icon={<Globe2 />}
              title="Deploy a paid API"
              detail="Wrap an HTTPS endpoint, attach xVault2 credentials, and publish it."
              action="Deploy"
            />
            <DashboardCta
              to="/console/bazaar"
              icon={<Boxes />}
              title="Explore Bazaar"
              detail="Search machine-payable HTTP endpoints and MCP tools."
              action="Search"
            />
            <DashboardCta
              to="/console/facilitator"
              icon={<Server />}
              title="Inspect facilitator"
              detail="View live x402 schemes, networks, extensions, and fee sponsorship."
              action="Inspect"
            />
          </section>
          <section className="dashboard-status mt-8">
            <div>
              <span className={`dashboard-status-dot is-${health}`} />
              <div>
                <strong>Hosted AutoLayer API</strong>
                <small>Live backend connectivity—not a mainnet readiness claim</small>
              </div>
            </div>
            <StatePill status={health} />
          </section>
      <div className="mt-6 text-right">
        <Link
          className="text-xs text-slate-500 transition hover:text-emerald-300"
          to="/console/automations"
        >
          Looking for scheduled execution? Open Automations →
        </Link>
      </div>
    </div>
  );
}
function DashboardStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: "success";
}) {
  return (
    <div className="dashboard-stat">
      <div>
        <span>{label}</span>
        {tone && <i />}
      </div>
      <b>{value}</b>
      <p>{note}</p>
    </div>
  );
}
function DashboardCta({
  to,
  icon,
  title,
  detail,
  action,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <Link to={to} className="dashboard-cta">
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <b>
        {action}
        <ArrowUpRight />
      </b>
    </Link>
  );
}

export function Automations({ address }: { address: string }) {
  const notify = useToast();
  const [network, setNetwork] = useState<Network>("TESTNET");
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");
  const load = useCallback(async () => {
    if (!address) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setItems((await api.automations(address, network)).automations);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not load automations";
      setError(detail);
      notify("Could not load automations", { kind: "error", detail });
    } finally {
      setLoading(false);
    }
  }, [address, network, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(id: string, name: "pause" | "resume" | "cancel") {
    setActing(`${id}:${name}`);
    try {
      await api[name](id);
      notify(
        name === "cancel" ? "Automation cancelled" : `Automation ${name}d`,
        { kind: "success" },
      );
      await load();
    } catch (error) {
      notify(`Could not ${name} automation`, {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setActing("");
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="Execution"
        title="Automations"
        description="Policy-controlled schedules tied to your Stellar smart account."
        actions={
          <>
            <select
              className="input w-32"
              value={network}
              disabled={loading}
              onChange={(event) => setNetwork(event.target.value as Network)}
            >
              <option value="TESTNET">Testnet</option>
              <option value="PUBLIC">Mainnet</option>
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
            <Link className="btn-primary" to="/console/automations/new">
              <Plus />
              New automation
            </Link>
          </>
        }
      />
      <Surface className="mt-7">
        {!address ? (
          <EmptyState
            icon={<Wallet />}
            title="Connect your wallet"
            description="Connect the wallet that owns your AutoLayer smart account to view its automations."
          />
        ) : loading && !items.length ? (
          <EmptyState
            icon={<LoaderCircle className="animate-spin" />}
            title="Loading automations"
            description="Reading the latest scheduler state."
          />
        ) : error && !items.length ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Automations unavailable"
            description={error}
            action={
              <button className="btn-secondary" onClick={() => void load()}>
                Try again
              </button>
            }
          />
        ) : !items.length ? (
          <EmptyState
            icon={<CalendarClock />}
            title="No automations yet"
            description={`There are no ${network.toLowerCase()} automations for this wallet.`}
            action={
              <Link className="btn-primary" to="/console/automations/new">
                <Plus />
                Create automation
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="console-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Automation</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Execution</th>
                  <th>Next run</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b className="text-slate-200">{formatType(item.type)}</b>
                      <p className="console-code mt-1 text-[9px] text-slate-600">
                        {item.id.slice(0, 16)}…
                      </p>
                    </td>
                    <td>
                      <StatePill status={item.state || item.status} />
                    </td>
                    <td>
                      <span className="console-code text-[10px]">
                        {item.schedule.expression}
                      </span>
                    </td>
                    <td>
                      {item.runCount} run{item.runCount === 1 ? "" : "s"}
                      {item.remainingRuns != null && (
                        <p className="mt-1 text-[9px] text-slate-600">
                          {item.remainingRuns} remaining
                        </p>
                      )}
                    </td>
                    <td>
                      {item.nextRunAt ? (
                        <>
                          <span>
                            {new Date(item.nextRunAt).toLocaleDateString()}
                          </span>
                          <p className="mt-1 text-[9px] text-slate-600">
                            {new Date(item.nextRunAt).toLocaleTimeString()}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-600">Not scheduled</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {item.status === "ACTIVE" && (
                          <ActionButton
                            title="Pause"
                            active={acting === `${item.id}:pause`}
                            disabled={!!acting}
                            onClick={() => void action(item.id, "pause")}
                            icon={<Pause />}
                          />
                        )}{" "}
                        {item.status === "PAUSED" && (
                          <ActionButton
                            title="Resume"
                            active={acting === `${item.id}:resume`}
                            disabled={!!acting}
                            onClick={() => void action(item.id, "resume")}
                            icon={<Play />}
                          />
                        )}
                        <ActionButton
                          title="Cancel"
                          active={acting === `${item.id}:cancel`}
                          disabled={!!acting || item.status === "REVOKED"}
                          onClick={() => void action(item.id, "cancel")}
                          icon={<MoreHorizontal />}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
function ActionButton({
  title,
  active,
  disabled,
  onClick,
  icon,
}: {
  title: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      className="icon-btn"
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {active ? <LoaderCircle className="animate-spin" /> : icon}
    </button>
  );
}
function formatType(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

export function NewAutomation({ address }: { address: string }) {
  const notify = useToast();
  const [network, setNetwork] = useState<Network>("TESTNET");
  const [automationType, setAutomationType] = useState<
    "CONTRACT_CALL" | "DISBURSEMENT"
  >("CONTRACT_CALL");
  const [contractArgs, setContractArgs] = useState<
    Array<{
      type: "address" | "i128" | "u128" | "string" | "symbol" | "bool";
      value: string;
    }>
  >([]);
  const [busy, setBusy] = useState("");
  const [proposal, setProposal] = useState<Proposal>();
  const [sessionHash, setSessionHash] = useState("");
  const [paid, setPaid] = useState(false);
  const [active, setActive] = useState(false);
  const smartAccount = useRef("");
  const fail = (title: string, error: unknown) =>
    notify(title, {
      kind: "error",
      detail: error instanceof Error ? error.message : "Unexpected error",
    });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      notify("Connect your wallet first", { kind: "error" });
      return;
    }
    const data = new FormData(event.currentTarget);
    smartAccount.current = String(data.get("smartAccount"));
    setBusy("proposal");
    try {
      const ledger = await getLatestLedger(network);
      const common = {
        network,
        walletAddress: smartAccount.current,
        validAfterLedger: ledger,
        expiresAtLedger: ledger + 17280,
        maxUses: Number(data.get("maxRuns")),
        schedule: {
          kind: "CRON",
          expression: String(data.get("schedule")),
          timezone: "UTC",
        },
      };
      const strategy =
        automationType === "CONTRACT_CALL"
          ? {
              contractId: String(data.get("contractId")),
              functionName: String(data.get("functionName")),
              args: contractArgs.map((argument) => ({
                type: argument.type,
                value:
                  argument.type === "bool"
                    ? argument.value === "true"
                    : argument.value,
              })),
            }
          : {
              asset: String(data.get("asset")),
              repeat: true,
              recipients: [
                {
                  address: String(data.get("recipient")),
                  amount: String(data.get("amount")),
                },
              ],
            };
      const created = await api.propose({
        type: automationType,
        ...common,
        strategy,
      });
      setProposal(created);
      notify("Proposal created", {
        kind: "success",
        detail: "Continue with wallet authorization.",
      });
    } catch (error) {
      fail("Proposal failed", error);
    } finally {
      setBusy("");
    }
  }
  async function createSession() {
    if (!proposal) return;
    setBusy("session");
    try {
      const result = await invokeContract({
        source: address,
        contractId: smartAccount.current,
        functionName: "create_session",
        argsXdr: proposal.createSessionArgsXdr,
        network,
      });
      setSessionHash(result.hash);
      notify("Wallet session created", { kind: "success" });
    } catch (error) {
      fail("Session creation failed", error);
    } finally {
      setBusy("");
    }
  }
  async function pay() {
    if (!proposal) return;
    setBusy("payment");
    try {
      const prepared = await api.preparePayment(proposal.automationId, address);
      if (prepared.unsignedAuthEntriesXdr.length !== 1)
        throw new Error(
          "Facilitator returned an invalid authorization entry count",
        );
      const signed = await signAuthEntry(
        prepared.unsignedAuthEntriesXdr[0],
        network,
        address,
      );
      await api.settlePayment(
        proposal.automationId,
        prepared.paymentSessionId,
        [signed],
      );
      setPaid(true);
      notify("Activation payment settled", { kind: "success" });
    } catch (error) {
      fail("Payment failed", error);
    } finally {
      setBusy("");
    }
  }
  async function activate() {
    if (!proposal || !sessionHash) return;
    setBusy("activation");
    try {
      await api.activate(
        proposal.automationId,
        proposal.expectedPolicyIdHex,
        sessionHash,
      );
      setActive(true);
      notify("Automation activated", { kind: "success" });
    } catch (error) {
      fail("Activation failed", error);
    } finally {
      setBusy("");
    }
  }
  const steps = [
    { label: "Configure", done: !!proposal },
    { label: "Authorize", done: !!sessionHash },
    { label: "Pay", done: paid },
    { label: "Activate", done: active },
  ];
  return (
    <div className="console-route-page">
      <Link
        to="/console/automations"
        className="mb-6 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-white"
      >
        <ArrowLeft />
        Back to automations
      </Link>
      <PageHeader
        eyebrow="New automation"
        title="Create an automation"
        description="Schedule a bounded Soroban contract invocation or a Stellar asset payment."
      />
      <div className="automation-stepper mt-7" aria-label="Activation progress">
        <div className="automation-stepper-line" />
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`automation-step ${step.done ? "is-done" : ""}`}
          >
            <span>{step.done ? <Check /> : index + 1}</span>
            <strong>{step.label}</strong>
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-5">
        <Surface>
          <SurfaceHeader
            title="Choose what to automate"
            description="Smart contract invocation is the primary path. Classic payments remain available for recurring transfers."
          />
          <div className="automation-type-grid p-6">
            <button
              type="button"
              disabled={!!proposal}
              onClick={() => setAutomationType("CONTRACT_CALL")}
              className={`automation-type-card ${automationType === "CONTRACT_CALL" ? "is-selected" : ""}`}
            >
              <Server />
              <span>
                <strong>Smart contract invocation</strong>
                <small>
                  Call any permitted Soroban function on a schedule.
                </small>
              </span>
              <span className="automation-recommended">Recommended</span>
            </button>
            <button
              type="button"
              disabled={!!proposal}
              onClick={() => setAutomationType("DISBURSEMENT")}
              className={`automation-type-card ${automationType === "DISBURSEMENT" ? "is-selected" : ""}`}
            >
              <Send />
              <span>
                <strong>Classic asset payment</strong>
                <small>Schedule a recurring SEP-41 token transfer.</small>
              </span>
            </button>
          </div>
        </Surface>
        <Surface>
          <SurfaceHeader
            title="Automation configuration"
            description="Required fields become part of the on-chain smart-account session policy."
          />
          <form onSubmit={(event) => void submit(event)} className="p-6">
            <div className="notice">
              <ShieldCheck />
              <span>
                Use an AutoLayer-compatible smart account (C…). Your wallet
                signs a bounded session that only permits this configured call.
              </span>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Network">
                <select
                  disabled={!!busy || !!proposal}
                  className="input"
                  value={network}
                  onChange={(event) =>
                    setNetwork(event.target.value as Network)
                  }
                >
                  <option value="TESTNET">Stellar testnet</option>
                  <option value="PUBLIC">Stellar mainnet</option>
                </select>
              </Field>
              <Field
                label="Smart account"
                hint="AutoLayer-compatible C address"
              >
                <input
                  className="input console-code"
                  required
                  name="smartAccount"
                  pattern="C[A-Z2-7]{55}"
                  placeholder="C…"
                  readOnly={!!proposal}
                />
              </Field>
              {automationType === "CONTRACT_CALL" ? (
                <>
                  <Field
                    label="Contract ID"
                    hint="Required · Soroban C address"
                  >
                    <input
                      className="input console-code"
                      required
                      name="contractId"
                      pattern="C[A-Z2-7]{55}"
                      placeholder="C…"
                      readOnly={!!proposal}
                    />
                  </Field>
                  <Field
                    label="Function"
                    hint="Required · exported contract function"
                  >
                    <input
                      className="input console-code"
                      required
                      name="functionName"
                      pattern="[A-Za-z][A-Za-z0-9_]{0,31}"
                      defaultValue="autolayer_run"
                      readOnly={!!proposal}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">
                        Arguments{" "}
                        <span className="text-slate-500">· Optional</span>
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!!proposal || contractArgs.length >= 32}
                        onClick={() =>
                          setContractArgs((items) => [
                            ...items,
                            { type: "address", value: "" },
                          ])
                        }
                      >
                        <Plus /> Add argument
                      </button>
                    </div>
                    {contractArgs.length === 0 ? (
                      <div className="automation-args-empty">
                        No arguments. Add them in the exact order expected by
                        the contract.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {contractArgs.map((argument, index) => (
                          <div className="automation-arg-row" key={index}>
                            <span className="automation-arg-index">
                              {index + 1}
                            </span>
                            <select
                              className="input"
                              disabled={!!proposal}
                              value={argument.type}
                              onChange={(event) =>
                                setContractArgs((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          type: event.target
                                            .value as typeof argument.type,
                                          value:
                                            event.target.value === "bool"
                                              ? "true"
                                              : "",
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="address">Address</option>
                              <option value="i128">i128</option>
                              <option value="u128">u128</option>
                              <option value="string">String</option>
                              <option value="symbol">Symbol</option>
                              <option value="bool">Boolean</option>
                            </select>
                            {argument.type === "bool" ? (
                              <select
                                className="input"
                                required
                                disabled={!!proposal}
                                value={argument.value}
                                onChange={(event) =>
                                  setContractArgs((items) =>
                                    items.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <option value="">Select value</option>
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                            ) : (
                              <input
                                className="input console-code"
                                required
                                placeholder={
                                  argument.type === "address"
                                    ? "G… or C…"
                                    : "Value"
                                }
                                readOnly={!!proposal}
                                value={argument.value}
                                onChange={(event) =>
                                  setContractArgs((items) =>
                                    items.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            )}
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove argument ${index + 1}`}
                              disabled={!!proposal}
                              onClick={() =>
                                setContractArgs((items) =>
                                  items.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Field label="SEP-41 asset" hint="Required">
                    <input
                      className="input console-code"
                      required
                      name="asset"
                      pattern="C[A-Z2-7]{55}"
                      placeholder="C…"
                      readOnly={!!proposal}
                    />
                  </Field>
                  <Field label="Recipient">
                    <input
                      className="input console-code"
                      required
                      name="recipient"
                      pattern="[CG][A-Z2-7]{55}"
                      placeholder="G… or C…"
                      readOnly={!!proposal}
                    />
                  </Field>
                  <Field label="Amount per run" hint="Atomic units / stroops">
                    <input
                      className="input"
                      required
                      name="amount"
                      pattern="[1-9][0-9]*"
                      defaultValue="10000000"
                      readOnly={!!proposal}
                    />
                  </Field>
                </>
              )}
              <Field label="Cron schedule" hint="UTC">
                <input
                  className="input console-code"
                  required
                  name="schedule"
                  defaultValue="0 */6 * * *"
                  readOnly={!!proposal}
                />
              </Field>
              <Field label="Maximum runs">
                <input
                  className="input"
                  required
                  name="maxRuns"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue="30"
                  readOnly={!!proposal}
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end border-t border-white/8 pt-5">
              {!proposal ? (
                <BusyButton
                  busy={busy === "proposal"}
                  busyLabel="Creating proposal…"
                >
                  Review proposal
                </BusyButton>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!!busy}
                  onClick={() => {
                    setProposal(undefined);
                    setSessionHash("");
                    setPaid(false);
                    setActive(false);
                  }}
                >
                  Start over
                </button>
              )}
            </div>
          </form>
        </Surface>
        {proposal && (
          <Surface>
            <SurfaceHeader
              title="Authorize and activate"
              description={`Proposal ${proposal.automationId.slice(0, 13)}…`}
            />
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <BusyButton
                busy={busy === "session"}
                disabled={!!sessionHash || !!busy}
                onClick={() => void createSession()}
                busyLabel="Open wallet…"
              >
                {sessionHash ? "Session created" : "Create wallet session"}
              </BusyButton>
              <BusyButton
                busy={busy === "payment"}
                disabled={!sessionHash || paid || !!busy}
                onClick={() => void pay()}
                busyLabel="Authorizing…"
              >
                {paid ? "Payment settled" : "Authorize payment"}
              </BusyButton>
              <BusyButton
                busy={busy === "activation"}
                disabled={!paid || active || !!busy}
                onClick={() => void activate()}
                busyLabel="Activating…"
              >
                {active ? "Automation active" : "Activate schedule"}
              </BusyButton>
            </div>
            {active && (
              <div className="border-t border-white/8 p-5">
                <div className="flex items-start gap-3 rounded-xl bg-emerald-300/[.05] p-4">
                  <Check className="text-emerald-300" />
                  <div>
                    <h3 className="text-sm text-emerald-200">
                      Automation is active
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      The first eligible run is now scheduled.
                    </p>
                    <Link
                      to="/console/automations"
                      className="mt-3 inline-flex items-center gap-2 text-xs text-emerald-300"
                    >
                      View automations <ArrowRight />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </Surface>
        )}
      </div>
    </div>
  );
}
function BusyButton({
  busy,
  busyLabel,
  children,
  ...props
}: {
  busy: boolean;
  busyLabel: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="btn-primary" {...props}>
      {busy ? (
        <>
          <LoaderCircle className="animate-spin" />
          {busyLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight />
        </>
      )}
    </button>
  );
}

export function Transactions({ address }: { address: string }) {
  const notify = useToast();
  const [network, setNetwork] = useState<Network>("TESTNET");
  const [state, setState] = useState("");
  const [account, setAccount] = useState<AccountStatus>();
  const [checking, setChecking] = useState(false);
  const [processing, setProcessing] = useState<"funding" | "sending" | "">("");
  const check = useCallback(async () => {
    if (!address) {
      setAccount(undefined);
      return;
    }
    setChecking(true);
    try {
      setAccount(await getAccountStatus(address, network));
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not check account";
      setState(detail);
      notify("Account check failed", { kind: "error", detail });
    } finally {
      setChecking(false);
    }
  }, [address, network, notify]);
  useEffect(() => {
    void check();
  }, [check]);
  async function fund() {
    if (!address) return;
    setProcessing("funding");
    try {
      await fundTestnetAccount(address);
      notify("Testnet account funded", { kind: "success" });
      await check();
    } catch (error) {
      notify("Friendbot failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setProcessing("");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !account?.exists) return;
    const data = new FormData(event.currentTarget);
    setProcessing("sending");
    setState("");
    try {
      const result = await sendXlm({
        source: address,
        destination: String(data.get("destination")),
        amount: String(data.get("amount")),
        network,
      });
      const title = result.createdDestination
        ? "Destination created"
        : "Payment submitted";
      setState(result.hash);
      notify(title, { kind: "success", detail: result.hash });
      await check();
    } catch (error) {
      notify("Transaction failed", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setProcessing("");
    }
  }
  return (
    <div className="console-route-page">
      <PageHeader
        eyebrow="Stellar classic"
        title="Send XLM"
        description="Build locally, review in your wallet, and submit directly to the selected Stellar network."
      />
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Surface>
          <SurfaceHeader
            title="New payment"
            description="The destination is created automatically when necessary."
          />
          <form onSubmit={(event) => void submit(event)} className="p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Network">
                <select
                  className="input"
                  value={network}
                  disabled={!!processing || checking}
                  onChange={(event) =>
                    setNetwork(event.target.value as Network)
                  }
                >
                  <option value="TESTNET">Stellar testnet</option>
                  <option value="PUBLIC">Stellar mainnet</option>
                </select>
              </Field>
              <Field label="Source wallet">
                <input
                  className="input console-code"
                  readOnly
                  value={address}
                  placeholder="Connect wallet"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Destination">
                  <input
                    disabled={!!processing}
                    className="input console-code"
                    required
                    name="destination"
                    pattern="G[A-Z2-7]{55}"
                    placeholder="G…"
                  />
                </Field>
              </div>
              <Field label="Amount">
                <input
                  disabled={!!processing}
                  className="input"
                  required
                  name="amount"
                  type="number"
                  min="0.0000001"
                  step="0.0000001"
                  defaultValue="1"
                />
              </Field>
              <div className="flex items-end pb-2 text-xs text-slate-500">
                XLM · up to 7 decimal places
              </div>
            </div>
            <div className="notice mt-6">
              <ShieldCheck />
              <span>
                Existing destinations receive a payment operation. Missing
                destinations receive a create-account operation after the
                current reserve is verified.
              </span>
            </div>
            <button
              type="submit"
              className="btn-primary mt-6 w-full"
              disabled={
                !address || checking || !!processing || !account?.exists
              }
            >
              {processing === "sending" ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Waiting for wallet and Stellar…
                </>
              ) : (
                <>
                  <ArrowUpRight />
                  Review in wallet
                </>
              )}
            </button>
          </form>
        </Surface>
        <div className="space-y-5">
          <Surface>
            <SurfaceHeader
              title="Source account"
              description={
                network === "PUBLIC" ? "Stellar mainnet" : "Stellar testnet"
              }
            />
            <div className="p-5">
              {!address ? (
                <EmptyState
                  icon={<Wallet />}
                  title="No wallet connected"
                  description="Connect a Stellar wallet from the top navigation."
                />
              ) : checking ? (
                <div className="flex items-center gap-3 py-3 text-xs text-slate-500">
                  <LoaderCircle className="animate-spin" />
                  Checking Horizon…
                </div>
              ) : account?.exists ? (
                <>
                  <StatePill status="Online" />
                  <p className="console-code mt-4 break-all text-[10px] text-slate-500">
                    {address}
                  </p>
                  <div className="mt-5">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600">
                      Available balance
                    </p>
                    <p className="mt-2 text-2xl">
                      {account.nativeBalance ?? "0"}{" "}
                      <span className="text-sm text-slate-500">XLM</span>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <StatePill status="Offline" />
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    This wallet is not funded on{" "}
                    {network === "PUBLIC" ? "mainnet" : "testnet"}.
                  </p>
                  {network === "TESTNET" && (
                    <button
                      className="btn-secondary mt-4 w-full"
                      disabled={!!processing}
                      onClick={() => void fund()}
                    >
                      {processing === "funding" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <CircleDollarSign />
                      )}
                      {processing === "funding"
                        ? "Funding…"
                        : "Fund with Friendbot"}
                    </button>
                  )}
                </>
              )}
            </div>
          </Surface>
          {state && (
            <Surface className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-200">
                    Transaction submitted
                  </p>
                  <p className="mt-1 text-[9px] text-slate-600">
                    Transaction hash
                  </p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(state);
                    notify("Hash copied", { kind: "success" });
                  }}
                >
                  <Copy />
                </button>
              </div>
              <p className="console-code mt-4 break-all text-[10px] text-slate-400">
                {state}
              </p>
              <a
                className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-300"
                href={`https://stellar.expert/explorer/${network === "PUBLIC" ? "public" : "testnet"}/tx/${state}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Stellar Expert <ExternalLink />
              </a>
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}
