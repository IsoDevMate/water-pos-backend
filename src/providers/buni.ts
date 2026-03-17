// KCB Buni API — multi-network payments (M-Pesa, Airtel, VOOMA, T-Kash)
// Docs: https://buni.kcbgroup.com/discover-apis
// Required env: BUNI_CLIENT_ID, BUNI_CLIENT_SECRET, BUNI_SHORTCODE, BUNI_CALLBACK_URL, BUNI_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.BUNI_ENV === "production"
  ? "https://uat.buni.kcbgroup.com"   // swap to prod URL when KCB provides it
  : "https://uat.buni.kcbgroup.com";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.BUNI_CLIENT_ID!,
      client_secret: process.env.BUNI_CLIENT_SECRET!,
    }),
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export const BuniProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const token = await getToken();
    const res = await fetch(`${BASE}/mm/api/request/1.0.0`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessShortCode: process.env.BUNI_SHORTCODE,
        phoneNumber: normalizePhone(phone),
        amount: Math.ceil(amount),
        callbackUrl: process.env.BUNI_CALLBACK_URL,
        transactionDesc: "Water order",
        accountReference: orderId.slice(0, 12),
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message || "Buni STK push failed");
    return {
      checkoutRequestId: data.checkoutRequestID ?? data.requestId ?? orderId,
      customerMessage: data.customerMessage ?? "M-Pesa prompt sent to your phone",
    };
  },
};
