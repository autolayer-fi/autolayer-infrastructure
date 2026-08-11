import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ConsoleShell, MarketingShell } from "./components/Shell";
import { useToast } from "./components/Toast";
import {
  connectWallet,
  openWalletProfile,
  restoreWallet,
  signXdr,
} from "./lib/wallet";
import { api } from "./lib/api";
import {
  Automations,
  ConsoleOverview,
  NewAutomation,
  Transactions,
} from "./pages/Console";
import { Home } from "./pages/Home";
import { Bazaar, Facilitator, Skills } from "./pages/Infrastructure";
import { Playground } from "./pages/Playground";
import { XWrapper, XWrapperCreate } from "./pages/XWrapper";
import { ApiKeys } from "./pages/ApiKeys";

function ExternalDocumentation() {
  useEffect(() => {
    window.location.replace("https://docs.autolayer.fi");
  }, []);
  return null;
}

export function App() {
  const notify = useToast();
  const [address, setAddress] = useState("");
  const [sessionToken, setSessionToken] = useState(
    () => sessionStorage.getItem("autolayer:session") || "",
  );
  const location = useLocation();
  const consoleHost = window.location.hostname.startsWith("console.");

  useEffect(() => {
    if (consoleHost && location.pathname === "/")
      window.history.replaceState({}, "", "/console");
  }, [consoleHost, location.pathname]);
  useEffect(() => {
    let active = true;
    void restoreWallet().then(async (restored) => {
      if (!active || !restored) return;
      setAddress(restored);
      if (sessionToken) {
        try {
          const current = await api.authMe(sessionToken);
          if (current.user.walletAddress !== restored)
            throw new Error("Wallet changed");
        } catch {
          sessionStorage.removeItem("autolayer:session");
          if (active) setSessionToken("");
        }
      }
    });
    return () => {
      active = false;
    };
  }, [sessionToken]);

  async function authenticate(walletAddress: string) {
    if (!walletAddress) throw new Error("Connect a Stellar wallet first");
    const challenge = await api.authChallenge(walletAddress, "TESTNET");
    const signedXdr = await signXdr(
      challenge.transactionXdr,
      challenge.network,
      walletAddress,
    );
    const session = await api.authVerify(challenge.challengeId, signedXdr);
    sessionStorage.setItem("autolayer:session", session.token);
    setSessionToken(session.token);
    return session.token;
  }

  async function walletAction() {
    try {
      if (address) {
        const next = await openWalletProfile();
        setAddress(next || "");
        if (!next) {
          if (sessionToken)
            void api.authLogout(sessionToken).catch(() => undefined);
          sessionStorage.removeItem("autolayer:xwrapper:key");
          sessionStorage.removeItem("autolayer:session");
          setSessionToken("");
          notify("Wallet disconnected");
        }
      } else {
        const next = await connectWallet();
        setAddress(next);
        await authenticate(next);
        notify("Wallet connected and authenticated", {
          kind: "success",
          detail: next,
        });
      }
    } catch (error) {
      notify("Could not connect wallet", {
        kind: "error",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <Routes>
      <Route element={<MarketingShell />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="/playground" element={<Playground />} />
      <Route path="/docs" element={<ExternalDocumentation />} />
      <Route
        element={
          <ConsoleShell
            address={address}
            onConnect={() => void walletAction()}
          />
        }
      >
        <Route
          path="/console"
          element={<ConsoleOverview address={address} />}
        />
        <Route
          path="/console/automations"
          element={<Automations address={address} />}
        />
        <Route
          path="/console/automations/new"
          element={<NewAutomation address={address} />}
        />
        <Route
          path="/console/transactions"
          element={<Transactions address={address} />}
        />
        <Route
          path="/console/xwrapper"
          element={
            <XWrapper
              address={address}
              sessionToken={sessionToken}
              onAuthenticate={() => authenticate(address)}
            />
          }
        />
        <Route
          path="/console/xwrapper/new"
          element={
            <XWrapperCreate address={address} sessionToken={sessionToken} />
          }
        />
        <Route
          path="/console/api-keys"
          element={
            <ApiKeys
              address={address}
              sessionToken={sessionToken}
              onAuthenticate={() => authenticate(address)}
            />
          }
        />
        <Route path="/console/facilitator" element={<Facilitator />} />
        <Route path="/console/bazaar" element={<Bazaar />} />
        <Route path="/console/skills" element={<Skills />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
