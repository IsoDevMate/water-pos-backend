// Provider registry — each business has its own paymentProvider + paymentConfig
// No global PAYMENT_PROVIDER env needed — config comes from the businesses table

export { normalizePhone } from "./types";
export type { StkPushParams, StkPushResult, PaymentProvider } from "./types";

import { DarajaProvider } from "./daraja";
import { JengaProvider } from "./jenga";
import { BuniProvider } from "./buni";
import { StanbicProvider } from "./stanbic";
import { IntaSendProvider } from "./intasend";
import { KopoKopoProvider } from "./kopokopo";
import { PesapalProvider } from "./pesapal";
import { AfricasTalkingProvider } from "./africastalking";
import { FlutterwaveProvider } from "./flutterwave";
import { PaystackProvider } from "./paystack";
import type { PaymentProvider, StkPushParams, StkPushResult } from "./types";

const registry: Record<string, PaymentProvider> = {
  daraja: DarajaProvider,
  jenga: JengaProvider,
  buni: BuniProvider,
  stanbic: StanbicProvider,
  intasend: IntaSendProvider,
  kopokopo: KopoKopoProvider,
  pesapal: PesapalProvider,
  africastalking: AfricasTalkingProvider,
  flutterwave: FlutterwaveProvider,
  paystack: PaystackProvider,
};

export function getProvider(providerKey: string): PaymentProvider {
  const p = registry[providerKey.toLowerCase()];
  if (!p) throw new Error(`Unknown payment provider "${providerKey}". Valid: ${Object.keys(registry).join(", ")}`);
  return p;
}

export const SUPPORTED_PROVIDERS = Object.keys(registry);

// Per-business STK push — injects business config into process.env temporarily
// Each provider reads its credentials from env vars; we overlay the business config before calling
export async function stkPushForBusiness(
  providerKey: string,
  config: Record<string, string>,
  params: StkPushParams
): Promise<StkPushResult> {
  const provider = getProvider(providerKey);

  // Temporarily overlay business-specific config into env for this call
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(config)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }

  try {
    return await provider.stkPush(params);
  } finally {
    // Restore original env
    for (const k of Object.keys(config)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
