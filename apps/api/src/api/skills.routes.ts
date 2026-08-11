import { Router, type Router as ExpressRouter } from "express";

export const skillsRoutes: ExpressRouter = Router();

const networks = ["stellar:testnet", "stellar:pubnet"] as const;
const commonErrors = [
  {
    code: "INVALID_INPUT",
    retryable: false,
    description: "Input did not satisfy the action schema.",
  },
  {
    code: "WALLET_AUTHORIZATION_REQUIRED",
    retryable: true,
    description: "A compatible wallet signature is required.",
  },
  {
    code: "SIMULATION_FAILED",
    retryable: false,
    description: "Stellar simulation rejected the proposed operation.",
  },
  {
    code: "SUBMISSION_FAILED",
    retryable: true,
    description: "The signed transaction could not be submitted or confirmed.",
  },
];

const skills = [
  {
    slug: "stellar-payment",
    version: "1.0.0",
    name: "Stellar payment",
    protocol: "Stellar Classic",
    category: "Payments",
    description:
      "Create an account or send XLM and issued assets through a human-readable operation model.",
    networks,
    actions: ["pay"],
    authentication: "wallet",
    safety: {
      simulationRequired: false,
      walletAuthorizationRequired: true,
      secretsAccepted: false,
      networkMustBeExplicit: true,
    },
    actionSpecs: [
      {
        name: "pay",
        description:
          "Send an asset, using createAccount automatically when an unfunded G-address receives XLM.",
        inputSchema: {
          type: "object",
          required: ["destination", "asset", "amount", "network"],
          properties: {
            destination: { type: "string", description: "Stellar G-address" },
            asset: { type: "string", description: "native or CODE:ISSUER" },
            amount: { type: "string", description: "Decimal display amount" },
            network: { enum: networks },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            transactionHash: { type: "string" },
            operation: { enum: ["payment", "createAccount"] },
            ledger: { type: "integer" },
          },
        },
      },
    ],
    errors: commonErrors,
  },
  {
    slug: "soroban-invoke",
    version: "1.0.0",
    name: "Soroban contract invocation",
    protocol: "Soroban",
    category: "Contracts",
    description:
      "Simulate and invoke a typed contract function without constructing XDR or operating RPC directly.",
    networks,
    actions: ["simulate", "invoke", "automate"],
    authentication: "wallet",
    safety: {
      simulationRequired: true,
      walletAuthorizationRequired: true,
      secretsAccepted: false,
      networkMustBeExplicit: true,
    },
    actionSpecs: [
      {
        name: "invoke",
        description:
          "Simulate, authorize, assemble, submit, and confirm a Soroban invocation.",
        inputSchema: {
          type: "object",
          required: ["contractId", "functionName", "args", "network"],
          properties: {
            contractId: { type: "string", pattern: "^C[A-Z2-7]{55}$" },
            functionName: { type: "string" },
            args: {
              type: "array",
              items: { type: "object", required: ["type", "value"] },
            },
            network: { enum: networks },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            transactionHash: { type: "string" },
            result: {},
            ledger: { type: "integer" },
          },
        },
      },
    ],
    errors: commonErrors,
  },
  {
    slug: "aquarius-swap",
    version: "1.0.0",
    name: "Aquarius swap",
    protocol: "Aquarius",
    category: "DeFi",
    description:
      "Quote, execute, or schedule policy-limited swaps through the configured Aquarius router.",
    networks,
    actions: ["quote", "swap", "automate"],
    authentication: "wallet",
    safety: {
      simulationRequired: true,
      walletAuthorizationRequired: true,
      secretsAccepted: false,
      networkMustBeExplicit: true,
    },
    actionSpecs: [
      {
        name: "quote",
        description:
          "Find a strict-send route and minimum output under the supplied slippage limit.",
        inputSchema: {
          type: "object",
          required: [
            "inputAsset",
            "outputAsset",
            "amount",
            "slippageBps",
            "network",
          ],
          properties: {
            inputAsset: { type: "string" },
            outputAsset: { type: "string" },
            amount: { type: "string" },
            slippageBps: { type: "integer", minimum: 0, maximum: 5000 },
            network: { enum: networks },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            estimatedOutputAmount: { type: "string" },
            minimumOutputAmount: { type: "string" },
            route: { type: "array" },
          },
        },
      },
    ],
    errors: [
      ...commonErrors,
      {
        code: "NO_ROUTE",
        retryable: true,
        description: "No executable route met the requested constraints.",
      },
    ],
  },
  {
    slug: "scheduled-disbursement",
    version: "1.0.0",
    name: "Scheduled disbursement",
    protocol: "AutoLayer",
    category: "Automation",
    description:
      "Pay one or more Stellar addresses with bounded recipients, totals, run counts, and schedule.",
    networks,
    actions: ["preview", "automate"],
    authentication: "wallet-session",
    safety: {
      simulationRequired: true,
      walletAuthorizationRequired: true,
      secretsAccepted: false,
      networkMustBeExplicit: true,
    },
    actionSpecs: [
      {
        name: "automate",
        description:
          "Create a wallet-authorized, fee-sponsored recurring disbursement.",
        inputSchema: {
          type: "object",
          required: [
            "smartAccount",
            "asset",
            "recipients",
            "schedule",
            "maxUses",
            "network",
          ],
          properties: {
            smartAccount: { type: "string" },
            asset: { type: "string" },
            recipients: { type: "array" },
            schedule: { type: "object" },
            maxUses: { type: "integer", minimum: 1 },
            network: { enum: networks },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            automationId: { type: "string" },
            status: { type: "string" },
            nextRunAt: { type: "string" },
          },
        },
      },
    ],
    errors: commonErrors,
  },
] as const;

skillsRoutes.get("/v1/skills", (request, response) => {
  const query = String(request.query.query ?? "")
    .trim()
    .toLowerCase();
  const protocol = String(request.query.protocol ?? "")
    .trim()
    .toLowerCase();
  const network = String(request.query.network ?? "").trim();
  const action = String(request.query.action ?? "")
    .trim()
    .toLowerCase();
  const items = skills
    .filter(
      (skill) =>
        (!query || JSON.stringify(skill).toLowerCase().includes(query)) &&
        (!protocol || skill.protocol.toLowerCase() === protocol) &&
        (!network ||
          skill.networks.includes(network as (typeof networks)[number])) &&
        (!action ||
          skill.actions.some((item) => item.toLowerCase() === action)),
    )
    .map(
      ({
        actionSpecs: _actionSpecs,
        errors: _errors,
        safety: _safety,
        ...skill
      }) => skill,
    );
  response.json({
    items,
    count: items.length,
    filters: { query, protocol, network, action },
  });
});

skillsRoutes.get("/v1/skills/:slug/spec", (request, response) => {
  const skill = skills.find((item) => item.slug === request.params.slug);
  if (!skill)
    return response
      .status(404)
      .json({ error: "Skill not found", code: "SKILL_NOT_FOUND" });
  return response.json({
    schemaVersion: "2026-08-01",
    ...skill,
    endpoints: {
      catalog: "/v1/skills",
      specification: `/v1/skills/${skill.slug}/spec`,
      mcp: "/mcp",
    },
  });
});
