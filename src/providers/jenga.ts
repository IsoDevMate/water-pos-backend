// Equity Bank Jenga API — STK push via Equity gateway, settles to Equity account
// Docs: https://jengahq.zendesk.com/hc/en-us/articles/8424485232529-Receive-Payments-API
// Required env: JENGA_API_KEY, JENGA_MERCHANT_CODE, JENGA_CALLBACK_URL, JENGA_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.JENGA_ENV === "production"
  ? "https://api.jengahq.io"
  : "https://sandbox.jengahq.io";

export const JengaProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const res = await fetch(`${BASE}/transaction/v2/receive-money/mobile-money`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JENGA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchantCode: process.env.JENGA_MERCHANT_CODE,
        currency: "KES",
        amount: String(Math.ceil(amount)),
        mobileNumber: normalizePhone(phone),
        reference: orderId.slice(0, 20),
        callbackUrl: process.env.JENGA_CALLBACK_URL,
        description: "Water order",
        channel: "MPESA",
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message || "Jenga STK push failed");
    // Jenga returns transactionReference as the checkout ID
    return {
      checkoutRequestId: data.transactionReference ?? data.checkoutRequestId ?? orderId,
      customerMessage: "M-Pesa prompt sent to your phone",
    };
  },
};
