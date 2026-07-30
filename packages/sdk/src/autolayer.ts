import { AutoLayerClient, type AutoLayerConfiguration } from "./client.js";

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

  revoke(ref: AutomationRef) {
    return client.revoke(ref);
  },
} as const;
