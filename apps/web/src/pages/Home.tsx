import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Gauge,
  Network,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

const docsUrl = "https://docs.autolayer.fi";

const products = [
  {
    icon: Cpu,
    name: "Runtime",
    desc: "Run wallet-authorized Stellar Classic operations and typed Soroban contract invocations on a schedule.",
    tag: "EXECUTION",
  },
  {
    icon: CircleDollarSign,
    name: "x402",
    desc: "Return canonical HTTP 402 requirements, verify wallet authorization, and settle Stellar payments on-chain.",
    tag: "PAYMENTS",
  },
  {
    icon: Route,
    name: "Gateway",
    desc: "Turn an HTTPS API into a discoverable x402 resource with encrypted xVault2 credential injection.",
    tag: "XWRAPPER",
  },
  {
    icon: WalletCards,
    name: "Paymaster",
    desc: "Sponsor Stellar network fees with programmable budgets, policies and rate limits.",
    tag: "SPONSORSHIP",
  },
];
export function Home() {
  return (
    <>
      <section className="relative overflow-hidden pt-18">
        <div className="hero-grid absolute inset-0 opacity-40" />
        <div className="glow absolute left-1/2 top-20 h-[500px] w-[700px] -translate-x-1/2" />
        <div className="page relative flex min-h-[780px] flex-col items-center justify-center py-24 text-center">
          <div className="eyebrow">
            <Sparkles size={13} /> Built for autonomous applications on Stellar
          </div>
          <h1 className="mt-8 max-w-5xl text-balance text-5xl font-medium tracking-[-.055em] sm:text-7xl lg:text-[88px] lg:leading-[.98]">
            Infrastructure for software that{" "}
            <span className="text-emerald-300">acts on its own.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-balance text-lg leading-8 text-slate-400">
            One programmable layer for transaction execution, x402 payments, API
            monetization and fee sponsorship on Stellar.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="btn-primary btn-lg" to="/playground">
              <Play size={16} fill="currentColor" />
              Try the playground
            </Link>
            <a
              className="btn-secondary btn-lg"
              href={import.meta.env.VITE_CONSOLE_URL || "/console"}
            >
              Build an automation
              <ArrowRight size={16} />
            </a>
          </div>
          <div className="mt-16 w-full max-w-5xl rounded-2xl border border-white/10 bg-[#091713]/90 p-2 shadow-2xl shadow-emerald-950/50">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 text-left text-xs text-slate-500">
              <i className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <i className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
              <span className="ml-3">automation.ts</span>
            </div>
            <pre className="overflow-x-auto p-5 text-left text-[13px] leading-7 text-slate-300 sm:p-8">
              <code>
                <span className="code-purple">import</span> {"{ AutoLayer }"}{" "}
                <span className="code-purple">from</span>{" "}
                <span className="code-green">&quot;@autolayer/sdk&quot;</span>;
                {`\n\n`}
                <span className="code-purple">const</span> proposal ={" "}
                <span className="code-purple">await</span> AutoLayer.
                <span className="code-blue">propose</span>({"{"}
                {`\n  `}network:{" "}
                <span className="code-green">&quot;TESTNET&quot;</span>,{`\n  `}
                type:{" "}
                <span className="code-green">&quot;CONTRACT_CALL&quot;</span>,
                {`\n  `}walletAddress: smartAccount,
                {`\n  `}validAfterLedger: currentLedger,
                {`\n  `}expiresAtLedger: currentLedger + 17280,
                {`\n  `}maxUses: 12,
                {`\n  `}schedule: {"{"} kind:{" "}
                <span className="code-green">&quot;CRON&quot;</span>,
                expression:{" "}
                <span className="code-green">&quot;0 */6 * * *&quot;</span>{" "}
                {"}"},{`\n  `}strategy: {"{"} contractId, functionName:{" "}
                <span className="code-green">&quot;autolayer_run&quot;</span>,
                args: [] {"}"}
                {`\n`}
                {"}"});
              </code>
            </pre>
          </div>
        </div>
      </section>
      <section className="border-y border-white/8 py-8">
        <div className="page flex flex-wrap items-center justify-center gap-x-12 gap-y-5 text-sm text-slate-500">
          <span>THE EXECUTION LAYER FOR</span>
          <span className="brand-chip">
            <Network />
            STELLAR
          </span>
          <span className="brand-chip">
            <Braces />
            SOROBAN
          </span>
          <span className="brand-chip">
            <Bot />
            AGENTS
          </span>
          <span className="brand-chip">
            <Zap />
            AUTOMATION
          </span>
        </div>
      </section>
      <section id="products" className="page py-28">
        <div className="section-label">THE STACK</div>
        <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-end">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">
            Everything machines need
            <br />
            to transact.
          </h2>
          <p className="max-w-xl text-slate-400">
            Composable infrastructure that removes keys, fees, payment flows and
            transaction lifecycle management from your application code.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {products.map(({ icon: Icon, name, desc, tag }) => (
            <article className="product-card" key={name}>
              <div className="product-icon">
                <Icon />
              </div>
              <span className="tag">{tag}</span>
              <h3 className="mt-10 text-2xl">AutoLayer {name}</h3>
              <p className="mt-3 max-w-md leading-7 text-slate-400">{desc}</p>
              <a
                className="mt-7 inline-flex items-center gap-2 text-sm text-emerald-300"
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Explore {name}
                <ChevronRight size={15} />
              </a>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y border-white/8 bg-[#08130f]">
        <div className="page grid gap-14 py-28 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="section-label">ONE INTERFACE</div>
            <h2 className="mt-5 text-4xl font-medium tracking-tight sm:text-5xl">
              Make any contract
              <br />
              automation-ready.
            </h2>
            <p className="mt-6 max-w-lg leading-7 text-slate-400">
              Expose a predictable check-and-run convention, then keep
              authorization inside your contract. AutoLayer remains the bounded
              delegated caller—not the owner of your funds or contract.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-300">
              {[
                "Wallet-signed, contract-and-function-scoped sessions",
                "Explicit TESTNET or PUBLIC selection on every proposal",
                "Simulation, sponsored execution and observable run history",
              ].map((x) => (
                <li className="flex gap-3" key={x}>
                  <Check className="text-emerald-300" size={18} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#06100d] p-6 shadow-2xl shadow-emerald-950/30">
            <div className="mb-5 flex items-center gap-2 border-b border-white/8 pb-4 text-xs text-slate-500">
              <Braces size={15} />
              <span>src/lib.rs</span>
            </div>
            <pre className="overflow-x-auto text-[13px] leading-7 text-slate-300">
              <code>{`pub trait AutoLayerKeeper {\n    fn autolayer_check(env: Env) -> bool;\n    fn autolayer_run(\n        env: Env,\n        executor: Address\n    ) -> Val;\n}`}</code>
            </pre>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="mini-node">
                <Gauge />
                Simulate
              </div>
              <div className="mini-node">
                <ShieldCheck />
                Authorize
              </div>
              <div className="mini-node">
                <Zap />
                Execute
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="page py-28">
        <div className="section-label">PAYMENT FLOW</div>
        <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-end">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">
            Stellar payments,
            <br />
            native to HTTP.
          </h2>
          <p className="max-w-xl leading-7 text-slate-400">
            A protected resource returns HTTP 402 with exact payment
            requirements. The buyer signs a Stellar token authorization, the
            facilitator verifies and settles it, and the request
            continues—without an API key or custodial balance.
          </p>
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-4">
          {[
            ["01", "Request", "Call the protected resource."],
            ["02", "Price", "Receive Stellar x402 terms."],
            ["03", "Authorize", "Sign with a compatible wallet."],
            ["04", "Settle", "Confirm on-chain and continue."],
          ].map(([number, title, copy]) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[.025] p-5"
              key={number}
            >
              <span className="text-xs font-semibold text-emerald-300">
                {number}
              </span>
              <h3 className="mt-8 text-base font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="pricing" className="page py-24">
        <div className="home-final-cta">
          <div className="home-final-copy">
            <div className="section-label">BUILD ON AUTOLAYER</div>
            <h2>Move from your first testnet call to production automation.</h2>
            <p>
              Explore the execution and payment flow in the playground, then use
              the developer guides to deploy on Stellar mainnet.
            </p>
          </div>
          <div className="home-final-actions">
            <Link to="/playground" className="btn-primary btn-lg">
              Try the playground
              <ArrowRight size={16} />
            </Link>
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="home-docs-link"
            >
              Read documentation
              <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
