// IntaSend — payment aggregator (M-Pesa + cards + bank transfers)
// Docs: https://developers.intasend.com/docs/m-pesa-stk-push
// Required env: INTASEND_API_KEY, INTASEND_CALLBACK_URL, INTASEND_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.INTASEND_ENV === "production"
  ? "https://payment.intasend.com"
  : "https://sandbox.intasend.com";

export const IntaSendProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const res = await fetch(`${BASE}/api/v1/payment/mpesa-stk-push/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INTASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.ceil(amount),
        phone_number: normalizePhone(phone),
        api_ref: orderId.slice(0, 30),
        callback_url: process.env.INTASEND_CALLBACK_URL,
        narrative: "Water order",
      }),
    });

    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.detail || "IntaSend STK push failed");
    return {
      checkoutRequestId: data.invoice?.invoice_id ?? data.id ?? orderId,
      customerMessage: "M-Pesa prompt sent to your phone",
    };
  },
};
