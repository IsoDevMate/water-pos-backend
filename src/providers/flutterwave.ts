// Flutterwave — pan-Africa payments (M-Pesa Kenya + cards + bank)
// Docs: https://developer.flutterwave.com/docs/collecting-payments/mobile-money
// Required env: FLW_SECRET_KEY, FLW_CALLBACK_URL, FLW_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = "https://api.flutterwave.com/v3"; // Flutterwave has one endpoint (no separate sandbox URL — use test keys)

export const FlutterwaveProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const res = await fetch(`${BASE}/charges?type=mpesa`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: normalizePhone(phone),
        amount: Math.ceil(amount),
        currency: "KES",
        tx_ref: orderId.slice(0, 36),
        redirect_url: process.env.FLW_CALLBACK_URL,
        meta: { order_id: orderId },
      }),
    });

    const data = await res.json() as any;
    if (data.status !== "success") throw new Error(data.message || "Flutterwave STK push failed");
    return {
      checkoutRequestId: String(data.data?.id ?? orderId),
      customerMessage: data.message ?? "M-Pesa prompt sent to your phone",
    };
  },
};
