// Safaricom Daraja — direct M-Pesa STK push
// Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate
// Supports both Paybill (CustomerPayBillOnline) and Till (CustomerBuyGoodsOnline)
// Required env: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
//               MPESA_PASSKEY, MPESA_TYPE (paybill|till), MPESA_CALLBACK_URL, MPESA_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

async function getToken(): Promise<string> {
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export const DarajaProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const token = await getToken();
    const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const shortcode = process.env.MPESA_SHORTCODE!;
    const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${ts}`).toString("base64");
    const type = process.env.MPESA_TYPE === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: type,
        Amount: String(Math.ceil(amount)),
        PartyA: normalizePhone(phone),
        PartyB: shortcode,
        PhoneNumber: normalizePhone(phone),
        CallBackURL: process.env.MPESA_CALLBACK_URL!,
        AccountReference: orderId.slice(0, 12),
        TransactionDesc: "Water order",
      }),
    });

    const data = await res.json() as { CheckoutRequestID: string; ResponseCode: string; CustomerMessage: string };
    if (data.ResponseCode !== "0") throw new Error(data.CustomerMessage || "Daraja STK push failed");
    return { checkoutRequestId: data.CheckoutRequestID, customerMessage: data.CustomerMessage };
  },
};
