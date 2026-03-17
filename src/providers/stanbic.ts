// Stanbic Bank Kenya — STK Push M-Pesa Checkout API
// Docs: https://developer.stanbicbank.co.ke/product (STK PUSH - M-PESA CHECKOUT API)
// Required env: STANBIC_CLIENT_ID, STANBIC_CLIENT_SECRET, STANBIC_SHORTCODE,
//               STANBIC_PASSKEY, STANBIC_CALLBACK_URL, STANBIC_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.STANBIC_ENV === "production"
  ? "https://api.stanbicbank.co.ke"
  : "https://sandbox.stanbicbank.co.ke";

async function getToken(): Promise<string> {
  const creds = Buffer.from(`${process.env.STANBIC_CLIENT_ID}:${process.env.STANBIC_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/oauth/token?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export const StanbicProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const token = await getToken();
    const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const shortcode = process.env.STANBIC_SHORTCODE!;
    const password = Buffer.from(`${shortcode}${process.env.STANBIC_PASSKEY}${ts}`).toString("base64");

    const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: String(Math.ceil(amount)),
        PartyA: normalizePhone(phone),
        PartyB: shortcode,
        PhoneNumber: normalizePhone(phone),
        CallBackURL: process.env.STANBIC_CALLBACK_URL!,
        AccountReference: orderId.slice(0, 12),
        TransactionDesc: "Water order",
      }),
    });

    const data = await res.json() as any;
    if (data.ResponseCode !== "0") throw new Error(data.CustomerMessage || "Stanbic STK push failed");
    return { checkoutRequestId: data.CheckoutRequestID, customerMessage: data.CustomerMessage };
  },
};
