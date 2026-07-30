import { AutoLayer } from "@autolayer/sdk";

/**
 * Real client-side payment using a SocketFi contract wallet.
 * AutoLayer prepares the exact transfer and the user approves it with passkey.
 */
export async function payAutomationWithSocketFi({
  proposal,
  socketfi,
  accessToken,
  walletAddress,
}) {
  const prepared = await AutoLayer.preparePayment(proposal, {
    payerAddress: walletAddress,
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

  if (!Array.isArray(signedAuthEntriesXdr) || signedAuthEntriesXdr.length !== 1) {
    throw new Error("SocketFi did not return exactly one signed authorization entry");
  }

  return AutoLayer.settlePayment(proposal, {
    paymentSessionId: prepared.paymentSessionId,
    signedAuthEntriesXdr,
  });
}
