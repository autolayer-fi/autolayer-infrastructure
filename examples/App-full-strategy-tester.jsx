import React, { useMemo, useState } from "react";
import { useSocketFi } from "@socketfi/react";
import {
  Asset,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { AutoLayer, PaymentRequiredError } from "@autolayer/sdk";

const SOCKETFI_SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:5001";

const AUTOLAYER_API_URL =
  import.meta.env.VITE_AUTOLAYER_URL || "http://localhost:5001";

const TESTNET_RPC_URL =
  import.meta.env.VITE_TESTNET_RPC_URL || "https://soroban-testnet.stellar.org";

const PUBLIC_RPC_URL =
  import.meta.env.VITE_PUBLIC_RPC_URL ||
  "https://rpc.ankr.com/stellar_soroban/625462b8555cf73532d249bd339c1460378a86e672494dee3cbf171157442bb0";

AutoLayer.configure({
  environment: import.meta.env.PROD ? "PRODUCTION" : "DEVELOPMENT",
  apiUrl: import.meta.env.PROD ? undefined : AUTOLAYER_API_URL,
});

const STRATEGY_TABS = [
  { id: "DISBURSEMENT", label: "Disbursement" },
  { id: "DCA", label: "DCA" },
  { id: "REBALANCE", label: "Rebalance" },
];

function getNetworkConfig(network) {
  if (network === "PUBLIC") {
    if (!PUBLIC_RPC_URL) {
      throw new Error("Set VITE_PUBLIC_RPC_URL before using PUBLIC network");
    }

    return {
      passphrase: Networks.PUBLIC,
      rpcUrl: PUBLIC_RPC_URL,
    };
  }

  return {
    passphrase: Networks.TESTNET,
    rpcUrl: TESTNET_RPC_URL,
  };
}

function getXlmContractId(network) {
  return Asset.native().contractId(getNetworkConfig(network).passphrase);
}

function normalizeTokenAddress(tokenInput, network) {
  const value = tokenInput.trim();

  if (!value) {
    throw new Error("Enter an asset contract address");
  }

  if (value.toUpperCase() === "XLM") {
    return getXlmContractId(network);
  }

  return value;
}

function toTokenAmount(value, decimals = 7) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid token amount: ${normalized || "empty"}`);
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const paddedFraction = fractionalPart
    .slice(0, decimals)
    .padEnd(decimals, "0");

  const amount =
    BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (amount <= 0n) {
    throw new Error("Amount must be greater than zero");
  }

  return amount;
}

function parseAddressList(value) {
  const addresses = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (addresses.length === 0) {
    throw new Error("Enter at least one address");
  }

  return [...new Set(addresses)];
}

function parseIntegerList(value, fieldName) {
  const values = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item));

  if (
    values.length === 0 ||
    values.some((item) => !Number.isInteger(item) || item < 0)
  ) {
    throw new Error(`Enter valid ${fieldName}`);
  }

  return values;
}

function buildTransferArgsXdr({ from, to, amount }) {
  return [
    nativeToScVal(from, { type: "address" }),
    nativeToScVal(to, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
  ].map((arg) => arg.toXDR("base64"));
}

function extractTransactionHash(response) {
  const hash =
    response?.txHash ??
    response?.hash ??
    response?.transactionHash ??
    response?.data?.txHash ??
    response?.data?.hash ??
    response?.data?.transactionHash;

  if (!hash || typeof hash !== "string") {
    throw new Error("SocketFi did not return a transaction hash");
  }

  return hash;
}

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function getCurrentLedger(network) {
  const { rpcUrl } = getNetworkConfig(network);
  const server = new rpc.Server(rpcUrl);
  const latest = await server.getLatestLedger();

  const sequence =
    latest?.sequence ?? latest?.sequenceNumber ?? latest?.ledgerSequence;

  if (!Number.isInteger(sequence)) {
    throw new Error("Unable to determine the current Stellar ledger");
  }

  return sequence;
}

async function readTokenBalance({ network, tokenContractId, address }) {
  const healthResponse = await fetch(`${SOCKETFI_SERVER_URL}/health`);

  if (!healthResponse.ok) {
    throw new Error(`SocketFi backend health failed: ${healthResponse.status}`);
  }

  const health = await healthResponse.json();
  const { rpcUrl, passphrase } = getNetworkConfig(network);

  const server = new rpc.Server(rpcUrl);
  const sourceAccount = await server.getAccount(health.paymaster);

  const contract = new Contract(tokenContractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(
      contract.call(
        "balance",
        nativeToScVal(address, {
          type: "address",
        })
      )
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  return BigInt(scValToNative(simulation.result.retval).toString());
}

async function fundWithFriendbot(account) {
  const response = await fetch(`${SOCKETFI_SERVER_URL}/friendbot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ account }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error ?? data)
    );
  }

  return data.data;
}

function Section({ title, children }) {
  return (
    <section className="box">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function App() {
  const socketfi = useSocketFi();

  const [network, setNetwork] = useState("TESTNET");
  const [activeStrategy, setActiveStrategy] = useState("DISBURSEMENT");

  const [wallet, setWallet] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [tokenInput, setTokenInput] = useState(
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
  );

  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const [scheduleExpression, setScheduleExpression] = useState("2 minutes");
  const [sessionDays, setSessionDays] = useState("30");
  const [maxUses, setMaxUses] = useState("5");

  // Disbursement.
  const [disbursementRepeat, setDisbursementRepeat] = useState(true);
  const [disbursementRecipients, setDisbursementRecipients] = useState([
    { address: "", amount: "1" },
  ]);

  // DCA.
  const [dcaProtocolName, setDcaProtocolName] = useState("CUSTOM");
  const [dcaProtocolContract, setDcaProtocolContract] = useState("");
  const [dcaProtocolFunction, setDcaProtocolFunction] = useState("swap");
  const [dcaOutputAsset, setDcaOutputAsset] = useState("");
  const [dcaAmount, setDcaAmount] = useState("1");
  const [dcaMaxTotal, setDcaMaxTotal] = useState("10");
  const [dcaSpendRecipients, setDcaSpendRecipients] = useState("");

  // Rebalance.
  const [rebalanceProtocolName, setRebalanceProtocolName] = useState("CUSTOM");
  const [rebalanceProtocolContract, setRebalanceProtocolContract] =
    useState("");
  const [rebalanceProtocolFunction, setRebalanceProtocolFunction] =
    useState("rebalance");
  const [rebalanceAllowedAssets, setRebalanceAllowedAssets] = useState("");
  const [rebalanceTargetWeights, setRebalanceTargetWeights] =
    useState("5000,5000");
  const [rebalanceMaxTradeAmount, setRebalanceMaxTradeAmount] = useState("1");
  const [rebalanceMaxTotalAmount, setRebalanceMaxTotalAmount] = useState("10");
  const [rebalanceSpendRecipients, setRebalanceSpendRecipients] = useState("");

  // Shared workflow.
  const [proposal, setProposal] = useState(null);
  const [sessionCreationTxHash, setSessionCreationTxHash] = useState("");
  const [payment, setPayment] = useState(null);
  const [paymentRequirements, setPaymentRequirements] = useState(null);
  const [activation, setActivation] = useState(null);

  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const isConnected = Boolean(wallet);

  const currentStrategyLabel = useMemo(
    () =>
      STRATEGY_TABS.find((tab) => tab.id === activeStrategy)?.label ??
      activeStrategy,
    [activeStrategy]
  );

  function resetWorkflow() {
    setProposal(null);
    setSessionCreationTxHash("");
    setPayment(null);
    setPaymentRequirements(null);
    setActivation(null);
    setResult(null);
    setStatus("");
  }

  function selectStrategy(strategy) {
    setActiveStrategy(strategy);
    resetWorkflow();
  }

  async function connectWallet() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      const data = await socketfi.authenticate("signin");

      const connectedWallet = data.session.address[network];

      if (!connectedWallet) {
        throw new Error(`No ${network} wallet was returned by SocketFi`);
      }

      setWallet(connectedWallet);
      setAccessToken(data.session.socketfiAccessToken);
      setStatus(`${network} wallet connected`);
    } catch (error) {
      setStatus(normalizeError(error, "Wallet connection failed"));
    } finally {
      setLoading(false);
    }
  }

  async function changeNetwork(nextNetwork) {
    setNetwork(nextNetwork);
    setWallet("");
    setAccessToken("");
    resetWorkflow();
  }

  async function validateBalance({ tokenContractId, amountStroops }) {
    const balance = await readTokenBalance({
      network,
      tokenContractId,
      address: wallet,
    });

    if (balance < amountStroops) {
      throw new Error(
        `Insufficient balance. Balance: ${balance}, required: ${amountStroops}`
      );
    }
  }

  function buildTransferPayload() {
    if (!wallet) {
      throw new Error("Connect wallet first");
    }

    if (!transferRecipient.trim()) {
      throw new Error("Enter a recipient");
    }

    const tokenContractId = normalizeTokenAddress(tokenInput, network);

    const amountStroops = toTokenAmount(transferAmount);

    return {
      tokenContractId,
      amountStroops,
      argsXdr: buildTransferArgsXdr({
        from: wallet,
        to: transferRecipient.trim(),
        amount: amountStroops,
      }),
    };
  }

  async function transferWithSocketFiSubmit() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      const { tokenContractId, amountStroops, argsXdr } =
        buildTransferPayload();

      await validateBalance({
        tokenContractId,
        amountStroops,
      });

      const response = await socketfi.signAndSubmitTx({
        contractId: tokenContractId,
        callFunction: {
          name: "transfer",
        },
        argsXdr,
        accessToken,
      });

      setStatus("Transfer submitted with SocketFi");
      setResult(response);
    } catch (error) {
      setStatus(normalizeError(error, "Transfer failed"));
    } finally {
      setLoading(false);
    }
  }

  async function fundWalletWithFriendbot() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      if (network !== "TESTNET") {
        throw new Error("Friendbot is only available on testnet");
      }

      const response = await fundWithFriendbot(wallet);

      setStatus("Wallet funded with Friendbot");
      setResult(response);
    } catch (error) {
      setStatus(normalizeError(error, "Friendbot funding failed"));
    } finally {
      setLoading(false);
    }
  }

  function validateSharedProposalFields() {
    if (!wallet) {
      throw new Error("Connect wallet first");
    }

    const days = Number(sessionDays);
    const parsedMaxUses = Number(maxUses);

    if (!Number.isInteger(days) || days <= 0) {
      throw new Error("Session duration must be a positive number of days");
    }

    if (!Number.isInteger(parsedMaxUses) || parsedMaxUses <= 0) {
      throw new Error("Maximum executions must be a positive integer");
    }

    if (!scheduleExpression.trim()) {
      throw new Error("Enter a schedule");
    }

    return {
      days,
      parsedMaxUses,
    };
  }

  function buildDisbursementStrategy(parsedMaxUses) {
    const asset = normalizeTokenAddress(tokenInput, network);

    const recipients = disbursementRecipients.map((recipient, index) => {
      const address = recipient.address.trim();

      if (!address) {
        throw new Error(`Recipient ${index + 1} address is required`);
      }

      return {
        address,
        amount: toTokenAmount(recipient.amount).toString(),
      };
    });

    const uniqueRecipients = new Set(
      recipients.map((recipient) => recipient.address)
    );

    if (uniqueRecipients.size !== recipients.length) {
      throw new Error("Duplicate disbursement recipients are not allowed");
    }

    if (!disbursementRepeat && parsedMaxUses !== 1) {
      throw new Error(
        "A one-time disbursement must use exactly 1 maximum execution"
      );
    }

    return {
      asset,
      repeat: disbursementRepeat,
      recipients,
    };
  }

  function buildDcaStrategy() {
    if (!dcaProtocolContract.trim()) {
      throw new Error("Enter the DCA protocol contract");
    }

    if (!dcaProtocolFunction.trim()) {
      throw new Error("Enter the DCA protocol function");
    }

    if (!dcaOutputAsset.trim()) {
      throw new Error("Enter the DCA output asset");
    }

    const amountPerRun = toTokenAmount(dcaAmount).toString();

    const maxTotalAmount = toTokenAmount(dcaMaxTotal).toString();

    if (BigInt(amountPerRun) > BigInt(maxTotalAmount)) {
      throw new Error("DCA amount per run exceeds the maximum total");
    }

    const spendRecipients = dcaSpendRecipients.trim()
      ? parseAddressList(dcaSpendRecipients)
      : [dcaProtocolContract.trim()];

    return {
      protocol: {
        name: dcaProtocolName.trim() || "CUSTOM",
        contractId: dcaProtocolContract.trim(),
        functionName: dcaProtocolFunction.trim(),
      },
      inputAsset: normalizeTokenAddress(tokenInput, network),
      outputAsset: normalizeTokenAddress(dcaOutputAsset, network),
      amountPerRun,
      maxTotalAmount,
      spendRecipients,
    };
  }

  function buildRebalanceStrategy() {
    if (!rebalanceProtocolContract.trim()) {
      throw new Error("Enter the rebalance protocol contract");
    }

    if (!rebalanceProtocolFunction.trim()) {
      throw new Error("Enter the rebalance protocol function");
    }

    const allowedAssets = parseAddressList(rebalanceAllowedAssets).map(
      (asset) => normalizeTokenAddress(asset, network)
    );

    if (allowedAssets.length < 2) {
      throw new Error("Rebalancing requires at least two allowed assets");
    }

    const targetWeightsBps = parseIntegerList(
      rebalanceTargetWeights,
      "target weights"
    );

    if (targetWeightsBps.length !== allowedAssets.length) {
      throw new Error("Target weights must match the number of allowed assets");
    }

    if (targetWeightsBps.reduce((sum, value) => sum + value, 0) !== 10_000) {
      throw new Error("Target weights must total 10,000 basis points");
    }

    const maxTradeAmount = toTokenAmount(rebalanceMaxTradeAmount).toString();

    const maxTotalAmount = toTokenAmount(rebalanceMaxTotalAmount).toString();

    if (BigInt(maxTradeAmount) > BigInt(maxTotalAmount)) {
      throw new Error("Maximum trade amount exceeds maximum total");
    }

    return {
      protocol: {
        name: rebalanceProtocolName.trim() || "CUSTOM",
        contractId: rebalanceProtocolContract.trim(),
        functionName: rebalanceProtocolFunction.trim(),
      },
      allowedAssets,
      targetWeightsBps,
      maxTradeAmount,
      maxTotalAmount,
      spendRecipients: parseAddressList(rebalanceSpendRecipients),
    };
  }

  async function proposeAutomation() {
    setLoading(true);
    setStatus("");
    setResult(null);
    setProposal(null);
    setSessionCreationTxHash("");
    setPayment(null);
    setPaymentRequirements(null);
    setActivation(null);

    try {
      const { days, parsedMaxUses } = validateSharedProposalFields();

      const currentLedger = await getCurrentLedger(network);

      // A short buffer avoids a proposal becoming stale while
      // the user reviews and approves it.
      const validAfterLedger = currentLedger;

      const durationLedgers = Math.ceil((days * 24 * 60 * 60) / 5);

      let strategy;

      if (activeStrategy === "DISBURSEMENT") {
        strategy = buildDisbursementStrategy(parsedMaxUses);
      } else if (activeStrategy === "DCA") {
        strategy = buildDcaStrategy();
      } else {
        strategy = buildRebalanceStrategy();
      }

      const proposed = await AutoLayer.propose({
        network,
        type: activeStrategy,
        walletAddress: wallet,
        validAfterLedger,
        expiresAtLedger: validAfterLedger + durationLedgers,
        maxUses: parsedMaxUses,
        schedule: {
          kind: "INTERVAL",
          expression: scheduleExpression.trim(),
          timezone: "UTC",
        },
        strategy,
      });

      setProposal(proposed);
      setPaymentRequirements(proposed.paymentRequirements);
      setStatus(
        `${currentStrategyLabel} proposal created. Review it, then create the wallet session.`
      );
      setResult(proposed);
    } catch (error) {
      setStatus(
        normalizeError(error, `${currentStrategyLabel} proposal failed`)
      );
    } finally {
      setLoading(false);
    }
  }

  function getSessionDisplayValues() {
    if (!proposal) {
      return [];
    }

    const commonValues = [
      {
        automationId: proposal.automationId,
      },
      {
        strategy: proposal.type,
      },
      {
        delegate: proposal.delegatePublicKey,
      },
      {
        expiresAtLedger: proposal.sessionPolicyInput.expires_at_ledger,
      },
    ];

    if (proposal.type === "DISBURSEMENT") {
      return [
        ...commonValues,
        {
          recipientCount:
            proposal.sessionPolicyInput.spend_limits[0]?.recipients?.length ??
            0,
        },
      ];
    }

    return commonValues;
  }

  async function createWalletSession() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      if (!wallet) {
        throw new Error("Connect wallet first");
      }

      if (!proposal) {
        throw new Error("Create an AutoLayer proposal first");
      }

      if (
        !Array.isArray(proposal.createSessionArgsXdr) ||
        proposal.createSessionArgsXdr.length !== 2
      ) {
        throw new Error("Proposal is missing create_session XDR");
      }

      const response = await socketfi.signAndSubmitTx({
        contractId: wallet,
        callFunction: {
          name: "create_session",
        },
        argsXdr: proposal.createSessionArgsXdr,
        accessToken,
        displayMode: "full",
        description: `Create a limited AutoLayer ${proposal.type} session`,
        values: getSessionDisplayValues(),
      });

      const transactionHash = extractTransactionHash(response);

      setSessionCreationTxHash(transactionHash);
      setStatus("Session created on-chain. Pay for the automation next.");
      setResult({
        response,
        policyIdHex: proposal.expectedPolicyIdHex,
        transactionHash,
      });
    } catch (error) {
      setStatus(normalizeError(error, "Session creation failed"));
    } finally {
      setLoading(false);
    }
  }

  async function payForAutomation() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      if (!proposal) throw new Error("Create a proposal first");
      if (!wallet) throw new Error("Connect wallet first");

      const prepared = await AutoLayer.preparePayment(proposal, {
        payerAddress: wallet,
      });

      const signed = await socketfi.signTx({
        contractId: prepared.contractId,
        callFunction: { name: prepared.functionName },
        argsXdr: prepared.argsXdr,
        accessToken,
        clientPaymaster: "SERVER_SIDE_PAYMASTER",
        displayMode: "full",
        description: prepared.requirements.description,
        values: [
          { amount: prepared.requirements.maxAmountRequired },
          { asset: prepared.contractId },
          { recipient: prepared.requirements.payTo },
          { automationId: prepared.automationId },
        ],
      });

      const signedAuthEntriesXdr =
        signed.signedAuthEntriesXdr ?? signed.data?.signedAuthEntriesXdr;

      if (
        !Array.isArray(signedAuthEntriesXdr) ||
        signedAuthEntriesXdr.length !== 1
      ) {
        throw new Error(
          "SocketFi did not return exactly one signed payment authorization entry"
        );
      }

      const paid = await AutoLayer.settlePayment(proposal, {
        paymentSessionId: prepared.paymentSessionId,
        signedAuthEntriesXdr,
      });

      setPayment(paid);
      setStatus("Automation payment settled on-chain");
      setResult(paid);
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        setPaymentRequirements(error.requirements);
        setResult(error.requirements);
      }
      setStatus(normalizeError(error, "Automation payment failed"));
    } finally {
      setLoading(false);
    }
  }

  async function activateAutomation() {
    setLoading(true);
    setStatus("");
    setResult(null);

    try {
      if (!proposal) {
        throw new Error("Create a proposal first");
      }

      if (!sessionCreationTxHash) {
        throw new Error("Create the wallet session first");
      }

      if (!payment) {
        throw new Error("Pay for the automation before activation");
      }

      const activated = await AutoLayer.activate(proposal, {
        policyIdHex: proposal.expectedPolicyIdHex,
        transactionHash: sessionCreationTxHash,
      });

      setActivation(activated);
      setStatus(`${proposal.type} automation activated`);
      setResult(activated);
    } catch (error) {
      if (error instanceof PaymentRequiredError) {
        setPaymentRequirements(error.requirements);
        setStatus(
          "Payment is required. Paste a valid x402 payment signature and retry activation, or use the Pay button first."
        );
        setResult(error.requirements);
      } else {
        setStatus(normalizeError(error, "Automation activation failed"));
      }
    } finally {
      setLoading(false);
    }
  }

  function updateDisbursementRecipient(index, field, value) {
    setDisbursementRecipients((current) =>
      current.map((recipient, itemIndex) =>
        itemIndex === index
          ? {
              ...recipient,
              [field]: value,
            }
          : recipient
      )
    );
  }

  function addDisbursementRecipient() {
    setDisbursementRecipients((current) => [
      ...current,
      {
        address: "",
        amount: "1",
      },
    ]);
  }

  function removeDisbursementRecipient(index) {
    setDisbursementRecipients((current) =>
      current.length === 1
        ? current
        : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div>
          <p className="eyebrow">AutoLayer Strategy Tester</p>
          <h1>Create, pay for, and activate scheduled wallet automations</h1>
          <p className="subtitle">
            Test disbursement first, then DCA and rebalancing through the same
            delegated-session lifecycle.
          </p>
        </div>

        <div className="grid">
          <label>
            Stellar network
            <select
              value={network}
              onChange={(event) => changeNetwork(event.target.value)}
              disabled={loading}
            >
              <option value="TESTNET">TESTNET</option>
              <option value="PUBLIC">PUBLIC</option>
            </select>
          </label>

          <div className="box">
            <p className="label">Connected wallet</p>
            <p className="mono">{wallet || "Not connected"}</p>
          </div>
        </div>

        {!isConnected ? (
          <button className="button" onClick={connectWallet} disabled={loading}>
            {loading ? "Connecting..." : `Connect ${network} SocketFi wallet`}
          </button>
        ) : (
          <>
            <Section title="Quick token utilities">
              <div className="grid">
                <label>
                  Asset contract
                  <input
                    value={tokenInput}
                    onChange={(event) => {
                      setTokenInput(event.target.value);
                      resetWorkflow();
                    }}
                    placeholder='Use "XLM" or a C... contract'
                  />
                </label>

                <label>
                  Direct transfer recipient
                  <input
                    value={transferRecipient}
                    onChange={(event) =>
                      setTransferRecipient(event.target.value)
                    }
                    placeholder="G... or C..."
                  />
                </label>

                <label>
                  Direct transfer amount
                  <input
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    placeholder="1"
                  />
                </label>
              </div>

              <div className="actions">
                {network === "TESTNET" && (
                  <button
                    className="secondaryButton"
                    onClick={fundWalletWithFriendbot}
                    disabled={loading}
                  >
                    Fund wallet with Friendbot
                  </button>
                )}

                <button
                  className="button"
                  onClick={transferWithSocketFiSubmit}
                  disabled={loading}
                >
                  Test direct transfer
                </button>
              </div>
            </Section>

            <div className="tabs">
              {STRATEGY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={
                    activeStrategy === tab.id ? "button" : "secondaryButton"
                  }
                  onClick={() => selectStrategy(tab.id)}
                  disabled={loading}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Section title={`${currentStrategyLabel} configuration`}>
              {activeStrategy === "DISBURSEMENT" && (
                <>
                  <div className="grid">
                    <label>
                      Asset to disburse
                      <input value={tokenInput} disabled />
                    </label>

                    <label>
                      Repeat on every schedule
                      <select
                        value={disbursementRepeat ? "YES" : "NO"}
                        onChange={(event) => {
                          const repeat = event.target.value === "YES";
                          setDisbursementRepeat(repeat);

                          if (!repeat) {
                            setMaxUses("1");
                          }
                        }}
                      >
                        <option value="YES">Yes</option>
                        <option value="NO">No, run once</option>
                      </select>
                    </label>
                  </div>

                  {disbursementRecipients.map((recipient, index) => (
                    <div className="grid" key={index}>
                      <label>
                        Recipient {index + 1}
                        <input
                          value={recipient.address}
                          onChange={(event) =>
                            updateDisbursementRecipient(
                              index,
                              "address",
                              event.target.value
                            )
                          }
                          placeholder="G... or C..."
                        />
                      </label>

                      <label>
                        Amount
                        <input
                          value={recipient.amount}
                          onChange={(event) =>
                            updateDisbursementRecipient(
                              index,
                              "amount",
                              event.target.value
                            )
                          }
                          placeholder="1"
                        />
                      </label>

                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() => removeDisbursementRecipient(index)}
                        disabled={disbursementRecipients.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={addDisbursementRecipient}
                  >
                    Add recipient
                  </button>
                </>
              )}

              {activeStrategy === "DCA" && (
                <div className="grid">
                  <label>
                    Protocol name
                    <input
                      value={dcaProtocolName}
                      onChange={(event) =>
                        setDcaProtocolName(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Protocol contract
                    <input
                      value={dcaProtocolContract}
                      onChange={(event) =>
                        setDcaProtocolContract(event.target.value)
                      }
                      placeholder="C..."
                    />
                  </label>

                  <label>
                    Protocol function
                    <input
                      value={dcaProtocolFunction}
                      onChange={(event) =>
                        setDcaProtocolFunction(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Input asset
                    <input value={tokenInput} disabled />
                  </label>

                  <label>
                    Output asset
                    <input
                      value={dcaOutputAsset}
                      onChange={(event) =>
                        setDcaOutputAsset(event.target.value)
                      }
                      placeholder="C... or XLM"
                    />
                  </label>

                  <label>
                    Amount per run
                    <input
                      value={dcaAmount}
                      onChange={(event) => setDcaAmount(event.target.value)}
                    />
                  </label>

                  <label>
                    Maximum total
                    <input
                      value={dcaMaxTotal}
                      onChange={(event) => setDcaMaxTotal(event.target.value)}
                    />
                  </label>

                  <label>
                    Spend recipients
                    <textarea
                      value={dcaSpendRecipients}
                      onChange={(event) =>
                        setDcaSpendRecipients(event.target.value)
                      }
                      placeholder="Pool/router addresses, one per line. Defaults to protocol contract."
                    />
                  </label>
                </div>
              )}

              {activeStrategy === "REBALANCE" && (
                <div className="grid">
                  <label>
                    Protocol name
                    <input
                      value={rebalanceProtocolName}
                      onChange={(event) =>
                        setRebalanceProtocolName(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Protocol contract
                    <input
                      value={rebalanceProtocolContract}
                      onChange={(event) =>
                        setRebalanceProtocolContract(event.target.value)
                      }
                      placeholder="C..."
                    />
                  </label>

                  <label>
                    Protocol function
                    <input
                      value={rebalanceProtocolFunction}
                      onChange={(event) =>
                        setRebalanceProtocolFunction(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Allowed asset contracts
                    <textarea
                      value={rebalanceAllowedAssets}
                      onChange={(event) =>
                        setRebalanceAllowedAssets(event.target.value)
                      }
                      placeholder="C...&#10;C..."
                    />
                  </label>

                  <label>
                    Target weights in bps
                    <input
                      value={rebalanceTargetWeights}
                      onChange={(event) =>
                        setRebalanceTargetWeights(event.target.value)
                      }
                      placeholder="5000,5000"
                    />
                  </label>

                  <label>
                    Maximum trade amount
                    <input
                      value={rebalanceMaxTradeAmount}
                      onChange={(event) =>
                        setRebalanceMaxTradeAmount(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Maximum total
                    <input
                      value={rebalanceMaxTotalAmount}
                      onChange={(event) =>
                        setRebalanceMaxTotalAmount(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Spend recipients
                    <textarea
                      value={rebalanceSpendRecipients}
                      onChange={(event) =>
                        setRebalanceSpendRecipients(event.target.value)
                      }
                      placeholder="Approved pool/router addresses"
                    />
                  </label>
                </div>
              )}

              <div className="grid">
                <label>
                  Schedule
                  <input
                    value={scheduleExpression}
                    onChange={(event) =>
                      setScheduleExpression(event.target.value)
                    }
                    placeholder="2 minutes"
                  />
                </label>

                <label>
                  Session duration in days
                  <input
                    type="number"
                    min="1"
                    value={sessionDays}
                    onChange={(event) => setSessionDays(event.target.value)}
                  />
                </label>

                <label>
                  Maximum executions
                  <input
                    type="number"
                    min="1"
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                    disabled={
                      activeStrategy === "DISBURSEMENT" && !disbursementRepeat
                    }
                  />
                </label>
              </div>
            </Section>

            <Section title="Automation lifecycle">
              <div className="actions">
                <button
                  className="button"
                  onClick={proposeAutomation}
                  disabled={loading}
                >
                  1. Propose {currentStrategyLabel}
                </button>

                <button
                  className="button"
                  onClick={createWalletSession}
                  disabled={loading || !proposal}
                >
                  2. Create session with passkey
                </button>

                <button
                  className="button"
                  onClick={payForAutomation}
                  disabled={loading || !proposal}
                >
                  3. Pay with SocketFi
                </button>

                <button
                  className="button"
                  onClick={activateAutomation}
                  disabled={loading || !proposal || !sessionCreationTxHash}
                >
                  4. Activate automation
                </button>
              </div>

              {proposal && (
                <div className="box">
                  <p className="label">Proposal</p>
                  <p className="mono">ID: {proposal.automationId}</p>
                  <p className="mono">Policy: {proposal.expectedPolicyIdHex}</p>
                  <p className="mono">Delegate: {proposal.delegatePublicKey}</p>
                  <p>
                    Price: {proposal.price?.amount} {proposal.price?.asset}
                  </p>
                </div>
              )}

              {paymentRequirements && (
                <div className="box">
                  <p className="label">x402 payment requirements</p>
                  <pre>{JSON.stringify(paymentRequirements, null, 2)}</pre>
                </div>
              )}

              {sessionCreationTxHash && (
                <div className="box">
                  <p className="label">Session creation transaction</p>
                  <p className="mono">{sessionCreationTxHash}</p>
                </div>
              )}

              {payment && (
                <div className="box">
                  <p className="label">Payment settled</p>
                  <pre>{JSON.stringify(payment, null, 2)}</pre>
                </div>
              )}

              {activation && (
                <div className="box">
                  <p className="label">Automation active</p>
                  <pre>{JSON.stringify(activation, null, 2)}</pre>
                </div>
              )}
            </Section>
          </>
        )}

        {status && <div className="status">{status}</div>}

        {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </section>
    </main>
  );
}
