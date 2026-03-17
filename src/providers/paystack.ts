// Paystack (Stripe-owned) — M-Pesa Kenya + cards
// Docs: https://paystack.com/docs/payments/mobile-money/#kenya
// Required env: PAYSTACK_SECRET_KEY, PAYSTACK_CALLBACK_URL

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = "https://api.paystack.co";

export const PaystackProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    // Paystack charges in kobo/cents — KES uses smallest unit = 1 (multiply by 100)
    const res = await fetch(`${BASE}/charge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.ceil(amount) * 100,
        currency: "KES",
        mobile_money: {
          phone: `+${normalizePhone(phone)}`,
          provider: "mpesa",
        },
        reference: orderId.slice(0, 100),
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        metadata: { order_id: orderId },
      }),
    });

    const data = await res.json() as any;
    if (!data.status) throw new Error(data.message || "Paystack STK push failed");
    return {
      checkoutRequestId: data.data?.reference ?? orderId,
      customerMessage: data.message ?? "M-Pesa prompt sent to your phone",
    };
  },
};
