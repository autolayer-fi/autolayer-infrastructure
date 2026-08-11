import {
  Activity,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Gauge,
  Globe2,
  Layers3,
  KeyRound,
  Menu,
  Orbit,
  Search,
  Server,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

const consoleUrl = import.meta.env.VITE_CONSOLE_URL || "/console";
const docsUrl = "https://docs.autolayer.fi";
export function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="console-mark">
      <span>
        <Orbit />
      </span>
      {!compact && <b>AutoLayer</b>}
    </Link>
  );
}
export function MarketingShell() {
  const [open, setOpen] = useState(false);
  const path = useLocation().pathname;
  const links = [
    ["Products", "/#products"],
    ["Developers", docsUrl],
    ["Playground", "/playground"],
    ["Pricing", "/#pricing"],
  ];
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="page flex h-18 items-center justify-between">
          <Mark />
          <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            {links.map(([label, to]) => (
              <a
                className={path === to ? "text-white" : "hover:text-white"}
                href={to}
                target={to === docsUrl ? "_blank" : undefined}
                rel={to === docsUrl ? "noreferrer" : undefined}
                key={label}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              Documentation
            </a>
            <a href={consoleUrl} className="btn-primary">
              Open console ↗
            </a>
          </div>
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav className="page grid gap-2 border-t border-white/10 py-4 md:hidden">
            {links.map(([label, to]) => (
              <a
                className="rounded-lg px-3 py-2 text-slate-300"
                href={to}
                target={to === docsUrl ? "_blank" : undefined}
                rel={to === docsUrl ? "noreferrer" : undefined}
                key={label}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const productNav = [
  { to: "/console", label: "Overview", icon: Gauge, group: "Workspace" },
  {
    to: "/console/api-keys",
    label: "API Keys",
    icon: KeyRound,
    group: "Workspace",
  },
  {
    to: "/console/automations",
    label: "Automations",
    icon: Activity,
    group: "Build",
  },
  { to: "/console/xwrapper", label: "xWrapper", icon: Globe2, group: "Build" },
  {
    to: "/console/facilitator",
    label: "Facilitator",
    icon: Server,
    group: "Infrastructure",
  },
  {
    to: "/console/bazaar",
    label: "Bazaar",
    icon: Search,
    group: "Infrastructure",
  },
  {
    to: "/console/skills",
    label: "Agent Skills",
    icon: Sparkles,
    group: "Infrastructure",
  },
];
const titles: Record<string, string> = {
  "/console": "Overview",
  "/console/api-keys": "API Keys",
  "/console/automations": "Automations",
  "/console/automations/new": "Create automation",
  "/console/transactions": "Transactions",
  "/console/xwrapper": "xWrapper",
  "/console/xwrapper/new": "Deploy xWrapper",
  "/console/facilitator": "Facilitator",
  "/console/bazaar": "Bazaar",
  "/console/skills": "Skills",
};
export function ConsoleShell({
  address,
  onConnect,
}: {
  address: string;
  onConnect: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const title = titles[location.pathname] || "Console";
  return (
    <div className="console-app">
      {mobile && (
        <button
          className="console-nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`ankr-sidebar ${mobile ? "open" : ""}`}>
        <div className="ankr-sidebar-brand">
          <Mark />
          <span>Console</span>
        </div>
        <button className="ankr-workspace">
          <span>
            <Layers3 />
          </span>
          <div>
            <small>Workspace</small>
            <b>Personal</b>
          </div>
          <ChevronDown />
        </button>
        <nav className="ankr-nav">
          {["Workspace", "Build", "Infrastructure"].map((group) => (
            <div className="ankr-nav-group" key={group}>
              <p>{group}</p>
              {productNav
                .filter((item) => item.group === group)
                .map(({ to, label, icon: Icon }) => (
                  <NavLink
                    end={to === "/console"}
                    to={to}
                    key={to}
                    onClick={() => setMobile(false)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="ankr-sidebar-bottom">
          <a href={docsUrl} target="_blank" rel="noreferrer">
            <BookOpen />
            <span>Documentation</span>
          </a>
          <div className="ankr-network">
            <i />
            <div>
              <b>All systems operational</b>
              <small>Testnet & Mainnet</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="ankr-frame">
        <header className="ankr-topbar">
          <div className="ankr-topbar-title">
            <button
              className="icon-btn ankr-menu"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>AutoLayer</span>
            <b>/</b>
            <strong>{title}</strong>
          </div>
          <div className="console-global-actions">
            <button className="ankr-search hidden md:flex">
              <Search />
              <span>Search resources...</span>
              <kbd>⌘ K</kbd>
            </button>
            <a
              className="icon-btn hidden sm:grid"
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open documentation"
            >
              <CircleHelp />
            </a>
            <button className="console-wallet" onClick={onConnect}>
              <span>
                <Wallet />
              </span>
              <div>
                {address ? (
                  <>
                    <b>
                      {address.slice(0, 6)}…{address.slice(-4)}
                    </b>
                    <small>Stellar wallet</small>
                  </>
                ) : (
                  <>
                    <b>Connect wallet</b>
                    <small>Stellar Wallets Kit</small>
                  </>
                )}
              </div>
              <ChevronDown />
            </button>
          </div>
        </header>
        <main className="console-main">
          <div className="console-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
