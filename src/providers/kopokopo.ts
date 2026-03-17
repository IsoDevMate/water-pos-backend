// Kopo Kopo — M-Pesa STK push aggregator popular with Kenyan SMEs
// Docs: https://developers.kopokopo.com/guides/receive-money/mpesa-stk.html
// Required env: KOPOKOPO_CLIENT_ID, KOPOKOPO_CLIENT_SECRET, KOPOKOPO_TILL,
//               KOPOKOPO_CALLBACK_URL, KOPOKOPO_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.KOPOKOPO_ENV === "production"
  ? "https://api.kopokopo.com"
  : "https://sandbox.kopokopo.com";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KOPOKOPO_CLIENT_ID!,
      client_secret: process.env.KOPOKOPO_CLIENT_SECRET!,
    }),
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export const KopoKopoProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/v1/incoming-payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_channel: "M-PESA STK Push",
        till_number: process.env.KOPOKOPO_TILL,
        subscriber: {
          phone_number: `+${normalizePhone(phone)}`,
          first_name: "Customer",
          last_name: "",
        },
        amount: { currency: "KES", value: Math.ceil(amount) },
        metadata: { order_id: orderId },
        _links: { callback_url: process.env.KOPOKOPO_CALLBACK_URL },
      }),
    });

    if (!res.ok) {
      const err = await res.json() as any;
      throw new Error(err.error_description || "Kopo Kopo STK push failed");
    }
    // Kopo Kopo returns location header with the resource URL as the ID
    const location = res.headers.get("location") ?? orderId;
    return {
      checkoutRequestId: location,
      customerMessage: "M-Pesa prompt sent to your phone",
    };
  },
};
