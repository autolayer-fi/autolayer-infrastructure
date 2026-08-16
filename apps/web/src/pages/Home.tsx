import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Gauge,
  KeyRound,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

const docsUrl = "https://docs.autolayer.fi";
const configuredConsoleUrl = (
  import.meta.env.VITE_CONSOLE_URL as string | undefined
)?.replace(/\/$/, "");
const deployUrl = configuredConsoleUrl
  ? `${configuredConsoleUrl}/console/xwrapper/new`
  : "/console/xwrapper/new";

const products = [
  {
    icon: Route,
    name: "xWrapper",
    desc: "Turn an existing HTTPS API into a paid, discoverable x402 resource without rewriting the upstream service.",
    tag: "SELLER GATEWAY",
  },
  {
    icon: CircleDollarSign,
    name: "x402",
    desc: "Return canonical HTTP 402 requirements, verify wallet authorization, and settle Stellar payments on-chain.",
    tag: "PAYMENTS",
  },
  {
    icon: Bot,
    name: "Bazaar",
    desc: "Catalog and rank machine-payable HTTP endpoints and MCP tools for agents using standard discovery metadata.",
    tag: "DISCOVERY",
  },
  {
    icon: Cpu,
    name: "Runtime",
    desc: "Run wallet-authorized Stellar Classic operations and typed Soroban contract invocations on a schedule.",
    tag: "EXECUTION",
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
            <Sparkles size={13} /> Stellar x402 infrastructure for sellers and agents
          </div>
          <h1 className="mt-8 max-w-5xl text-balance text-5xl font-medium tracking-[-.055em] sm:text-7xl lg:text-[88px] lg:leading-[.98]">
            Turn existing APIs into{" "}
            <span className="text-emerald-300">agent-paid services.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-balance text-lg leading-8 text-slate-400">
            Add Stellar x402 payments without rewriting your upstream API. Publish
            into a native Bazaar, protect credentials with xVault2, and become
            discoverable to agents through HTTP and MCP.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a className="btn-primary btn-lg" href={deployUrl}>
              <Route size={16} />
              Deploy a paid API
            </a>
            <Link className="btn-secondary btn-lg" to="/console/bazaar">
              Explore the Bazaar
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-16 w-full max-w-5xl rounded-2xl border border-white/10 bg-[#091713]/90 p-2 shadow-2xl shadow-emerald-950/50">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 text-left text-xs text-slate-500">
              <i className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <i className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
              <span className="ml-3">seller-to-agent.flow</span>
            </div>
            <pre className="overflow-x-auto p-5 text-left text-[13px] leading-7 text-slate-300 sm:p-8">
              <code>{`Existing HTTPS API\n        ↓\nxWrapper adds canonical Stellar x402\n        +\nxVault2 injects scoped credentials after settlement\n        ↓\nBazaar catalogs and ranks the service\n        ↓\nAgents discover, pay, retry, and receive the response`}</code>
            </pre>
          </div>
        </div>
      </section>
      <section className="border-y border-white/8 py-8">
        <div className="page flex flex-wrap items-center justify-center gap-x-12 gap-y-5 text-sm text-slate-500">
          <span>OPEN X402 INFRASTRUCTURE FOR</span>
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
            <Route />
            API SELLERS
          </span>
        </div>
      </section>
      <section id="evidence" className="page py-20">
        <div className="section-label">WORKING EVIDENCE</div>
        <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-end">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">
            Demonstrated before
            <br />
            the grant.
          </h2>
          <p className="max-w-xl leading-7 text-slate-400">
            The grant advances a working open-source MVP into audited,
            production-operated infrastructure. These results are already
            reproducible from the repository.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <a
            className="product-card"
            href="https://stellar.expert/explorer/testnet/tx/ed9fa12d30ed28e5c478f9ee158e0eb7148069236504e06cfd55d718d95b2e34"
            target="_blank"
            rel="noreferrer"
          >
            <div className="product-icon"><CircleDollarSign /></div>
            <h3 className="mt-8 text-lg">Canonical settlement</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Stock x402 client, HTTP 200, sponsored fees, and a public Stellar
              testnet transaction.
            </p>
          </a>
          <article className="product-card">
            <div className="product-icon"><Bot /></div>
            <h3 className="mt-8 text-lg">Native cataloging</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              A valid Bazaar extension is cataloged after settlement without
              xWrapper or manual registration.
            </p>
          </article>
          <article className="product-card">
            <div className="product-icon"><Gauge /></div>
            <h3 className="mt-8 text-lg">Measured search</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              nDCG@10 0.998, MRR 1.0, recall@10 1.0, and approximately 44 ms
              local p95 latency.
            </p>
          </article>
          <article className="product-card">
            <div className="product-icon"><ShieldCheck /></div>
            <h3 className="mt-8 text-lg">Permissive and self-hostable</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Apache-2.0 source, Docker packaging, and no strong-copyleft or
              uncertain production dependency.
            </p>
          </article>
        </div>
      </section>
      <section id="products" className="page py-28">
        <div className="section-label">THE STACK</div>
        <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-end">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">
            From an existing API
            <br />
            to a machine-payable service.
          </h2>
          <p className="max-w-xl text-slate-400">
            A standards-based facilitator, a native Stellar Bazaar, and the
            seller tooling needed to move from integration to adoption.
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
            <div className="section-label">THE SELLER ADVANTAGE</div>
            <h2 className="mt-5 text-4xl font-medium tracking-tight sm:text-5xl">
              Keep your API.
              <br />
              Add machine payments.
            </h2>
            <p className="mt-6 max-w-lg leading-7 text-slate-400">
              xWrapper publishes a canonical x402 gateway in front of an existing
              HTTPS service. If the upstream needs authentication, xVault2 releases
              its scoped credential in memory only after valid settlement.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-300">
              {[
                "No upstream payment-code rewrite",
                "Encrypted bearer-token or custom-header injection",
                "No credential exposure to buyers, discovery, or audit logs",
                "Automatic publication into the searchable Stellar Bazaar",
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
              <span>xwrapper.request</span>
            </div>
            <pre className="overflow-x-auto text-[13px] leading-7 text-slate-300">
              <code>{`POST /gateway/weather\n→ 402 PAYMENT-REQUIRED\n→ wallet authorization\n→ facilitator verify + settle\n→ inject scoped upstream credential\n→ deliver API response`}</code>
            </pre>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="mini-node">
                <CircleDollarSign />
                Settle
              </div>
              <div className="mini-node">
                <KeyRound />
                Inject
              </div>
              <div className="mini-node">
                <Bot />
                Discover
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
            continues without a prepaid custodial balance. Upstream credentials,
            when required, remain seller-controlled and invisible to the buyer.
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
            <h2>Publish your first discoverable paid API on Stellar.</h2>
            <p>
              Start on testnet with an existing HTTPS endpoint, then verify its
              x402 terms and find it through Bazaar or MCP.
            </p>
          </div>
          <div className="home-final-actions">
            <a href={deployUrl} className="btn-primary btn-lg">
              Deploy a paid API
              <ArrowRight size={16} />
            </a>
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
