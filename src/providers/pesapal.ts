// Pesapal — payment aggregator (M-Pesa, cards, bank)
// Docs: https://developer.pesapal.com
// Required env: PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET,
//               PESAPAL_CALLBACK_URL, PESAPAL_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.PESAPAL_ENV === "production"
  ? "https://pay.pesapal.com/v3"
  : "https://cybqa.pesapal.com/pesapalv3";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    }),
  });
  const data = await res.json() as { token: string };
  return data.token;
}

export const PesapalProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const token = await getToken();

    // Step 1: Register IPN callback (idempotent — safe to call each time)
    await fetch(`${BASE}/api/URLSetup/RegisterIPN`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: process.env.PESAPAL_CALLBACK_URL, ipn_notification_type: "POST" }),
    });

    // Step 2: Submit order
    const res = await fetch(`${BASE}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: orderId,
        currency: "KES",
        amount: Math.ceil(amount),
        description: "Water order",
        callback_url: process.env.PESAPAL_CALLBACK_URL,
        notification_id: "",
        billing_address: { phone_number: normalizePhone(phone) },
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message || "Pesapal order submission failed");
    return {
      checkoutRequestId: data.order_tracking_id ?? orderId,
      customerMessage: "M-Pesa prompt sent to your phone",
    };
  },
};
