export type Network = "TESTNET" | "PUBLIC";
export type AutomationEnvironment = "DEVELOPMENT" | "PRODUCTION";
export type StrategyType =
  "CONTRACT_CALL" | "DCA" | "REBALANCE" | "DISBURSEMENT";
export type AutomationStatus =
  "PROPOSED" | "PAID" | "ACTIVE" | "PAUSED" | "REVOKED" | "EXPIRED" | "FAILED";
export type PaymentStatus = "REQUIRED" | "VERIFYING" | "PAID" | "FAILED";

export type Schedule =
  | { kind: "INTERVAL"; expression: string; timezone?: string }
  | { kind: "CRON"; expression: string; timezone?: string };

export interface ProtocolConfig {
  name: string;
  contractId: string;
  functionName: string;
}

export interface DcaStrategy {
  protocol: ProtocolConfig;
  inputAsset: string;
  outputAsset: string;
  amountPerRun: string;
  maxTotalAmount: string;
  slippageBps: number;
  spendRecipients: string[];
}

export interface RebalanceStrategy {
  protocol: ProtocolConfig;
  allowedAssets: string[];
  targetWeightsBps: number[];
  rebalanceThresholdBps?: number;
  slippageBps?: number;
  maxTradeAmount: string;
  maxTotalAmount: string;
  spendRecipients: string[];
}

export interface DisbursementRecipient {
  address: string;
  amount: string;
}

export interface DisbursementStrategy {
  asset: string;
  recipients: DisbursementRecipient[];
  repeat: boolean;
}

export type ContractArgument =
  | { type: "address"; value: string }
  | { type: "i128" | "u128"; value: string }
  | { type: "string" | "symbol"; value: string }
  | { type: "bool"; value: boolean };

export interface ContractCallStrategy {
  contractId: string;
  functionName: string;
  args: ContractArgument[];
}

export type StrategyConfig =
  ContractCallStrategy | DcaStrategy | RebalanceStrategy | DisbursementStrategy;

interface ProposalBase {
  walletAddress: string;
  network: Network;
  validAfterLedger: number;
  expiresAtLedger: number;
  maxUses?: number | null;
  schedule: Schedule;
}

export type ProposeAutomationInput =
  | (ProposalBase & { type: "CONTRACT_CALL"; strategy: ContractCallStrategy })
  | (ProposalBase & { type: "DCA"; strategy: DcaStrategy })
  | (ProposalBase & { type: "REBALANCE"; strategy: RebalanceStrategy })
  | (ProposalBase & { type: "DISBURSEMENT"; strategy: DisbursementStrategy });

export interface ProtocolPermission {
  contract: string;
  function: string;
}

export interface AssetSpendLimitInput {
  asset: string;
  recipients: string[];
  max_per_call: string;
  max_total: string;
}

export interface SessionPolicyInput {
  salt: string;
  delegate: string;
  valid_after_ledger: number;
  expires_at_ledger: number;
  max_uses: number | null;
  permissions: ProtocolPermission[];
  spend_limits: AssetSpendLimitInput[];
}

export interface X402PaymentRequirements {
  scheme?: string;
  network: string;
  asset: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  resource?: string;
  description?: string;
  mimeType?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProposalResponse {
  automationId: string;
  network: Network;
  type: StrategyType;
  status: AutomationStatus;
  price: { amount: string; asset: string; network: string; payTo: string };
  paymentRequirements: X402PaymentRequirements;
  expectedPolicyIdHex: string;
  delegatePublicKey: string;
  delegatePublicKeyRawHex: string;
  delegatePopHex: string;
  createSessionArgsXdr: [string, string];
  sessionPolicyInput: SessionPolicyInput;
  payEndpoint: string;
  paymentPrepareEndpoint: string;
  paymentSettleEndpoint: string;
  activateEndpoint: string;
}

export interface PaymentPrepareInput {
  payerAddress: string;
}
export interface PaymentPrepareResponse {
  paymentSessionId: string;
  automationId: string;
  network: Network;
  payerAddress: string;
  contractId: string;
  functionName: "transfer";
  argsXdr: [string, string, string];
  unsignedAuthEntriesXdr: string[];
  signatureExpirationLedger: number;
  requirements: X402PaymentRequirements;
}
export interface PaymentSettleInput {
  paymentSessionId: string;
  signedAuthEntriesXdr: string[];
}
export interface PaymentSettlementResponse {
  automationId: string;
  paymentStatus: "PAID";
  transactionHash: string;
  payer: string;
}
export interface PaymentResponse {
  automationId: string;
  paymentStatus: "PAID";
  transactionHash: string | null;
  payer?: string | null;
  paymentResponse?: unknown;
}
export interface ActivateAutomationInput {
  policyIdHex: string;
  transactionHash: string;
  firstRunAt: string;
}
export interface ActivationResponse {
  automationId: string;
  status: "ACTIVE";
  policyIdHex: string;
  agendaJobId?: string;
  paymentResponse?: unknown;
}

export type PublicAutomationState =
  | "PROPOSED"
  | "PAYMENT_REQUIRED"
  | "READY_TO_ACTIVATE"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED";

export interface AutomationResponse {
  id: string;
  network: Network;
  type: StrategyType;
  status: AutomationStatus;
  state: PublicAutomationState;
  walletAddress: string;
  policyIdHex: string | null;
  expectedPolicyIdHex: string;
  delegatePublicKey: string;
  strategy: StrategyConfig;
  schedule: Required<Schedule>;
  payment: {
    status: string;
    amount: string;
    asset: string;
    network: string;
    payTo: string;
    transactionHash: string | null;
    payer?: string | null;
  };
  runCount: number;
  spentAmount: string;
  agendaJobId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  lastError: string | null;
}

export interface AutomationPageResponse {
  walletAddress: string;
  network: Network | null;
  count: number;
  limit: number;
  nextCursor: string | null;
  automations: AutomationResponse[];
}

export interface LifecycleResponse {
  id: string;
  status: "PAUSED" | "ACTIVE" | "REVOKED";
  agendaJobId?: string;
  note?: string;
}

export type AutomationRef = string | { automationId: string; network: Network };
export type PaymentHandler = (
  requirements: X402PaymentRequirements,
  context: {
    automationId: string;
    network: Network;
    operation: "pay" | "activate";
  },
) => Promise<string> | string;
export interface RequestPaymentOptions {
  paymentSignature?: string;
  paymentHandler?: PaymentHandler;
}
export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
}

export interface Automation {
  id: string;
  walletAddress: string;
  network: Network;
  type: StrategyType;
  status: AutomationStatus;
  expectedPolicyIdHex: string;
  onchainPolicyIdHex: string | null;
  sessionCreationTxHash: string | null;
  delegatePublicKeyEncrypted: EncryptedValue;
  delegatePrivateKeyEncrypted: EncryptedValue;
  policyInput: SessionPolicyInput;
  policyInputXdrBase64: string;
  delegatePopHex: string;
  delegatePopXdrBase64: string;
  strategy: StrategyConfig;
  schedule: { kind: "INTERVAL" | "CRON"; expression: string; timezone: string };
  validAfterLedger: number;
  expiresAtLedger: number;
  maxUses: number | null;
  runCount: number;
  spentAmount: string;
  agendaJobId: string | null;
  paymentStatus: PaymentStatus;
  paymentAmount: string;
  paymentAsset: string;
  paymentNetwork: Network;
  paymentTreasury: string;
  paymentQuoteExpiresAt: Date;
  paymentTxHash: string | null;
  paymentPayer: string | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastFinishedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  activatedAt: Date | null;
  revokedAt: Date | null;
  lastError: string | null;
}
