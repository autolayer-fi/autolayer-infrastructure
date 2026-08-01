import {
  AutoLayerClient,
  type AutoLayerConfiguration,
  type FetchAllAutomationsOptions,
} from "./client.js";

import type {
  ActivateAutomationInput,
  AutomationRef,
  PaymentPrepareInput,
  PaymentSettleInput,
  ProposeAutomationInput,
  RequestPaymentOptions,
} from "./types.js";

const client = new AutoLayerClient();

export const AutoLayer = {
  configure(configuration: AutoLayerConfiguration): void {
    client.configure(configuration);
  },

  propose(input: ProposeAutomationInput) {
    return client.propose(input);
  },

  get(ref: AutomationRef) {
    return client.get(ref);
  },

  /**
   * Fetches every automation tied to a wallet directly from AutoLayer.
   *
   * The returned records include AutoLayer's current lifecycle state,
   * scheduled-run limits, completed run count, remaining runs, payment state,
   * spend amount, expiry information, pause state, and cancellation state.
   */
  fetchAll(walletAddress: string, options?: FetchAllAutomationsOptions) {
    return client.fetchAll(walletAddress, options);
  },

  pay(ref: AutomationRef, options?: RequestPaymentOptions) {
    return client.pay(ref, options);
  },

  preparePayment(ref: AutomationRef, input: PaymentPrepareInput) {
    return client.preparePayment(ref, input);
  },

  settlePayment(ref: AutomationRef, input: PaymentSettleInput) {
    return client.settlePayment(ref, input);
  },

  activate(
    ref: AutomationRef,
    input: ActivateAutomationInput,
    options?: RequestPaymentOptions
  ) {
    return client.activate(ref, input, options);
  },

  pause(ref: AutomationRef) {
    return client.pause(ref);
  },

  resume(ref: AutomationRef) {
    return client.resume(ref);
  },

  /**
   * Permanently stops AutoLayer from scheduling or executing the automation.
   *
   * This is distinct from pause because a cancelled automation cannot be
   * resumed. Revoke the wallet session on-chain separately when immediate
   * delegated-key invalidation is also required.
   */
  cancel(ref: AutomationRef) {
    return client.cancel(ref);
  },

  revoke(ref: AutomationRef) {
    return client.revoke(ref);
  },
} as const;
