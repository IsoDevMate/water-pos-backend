// Africa's Talking — multi-country mobile money including M-Pesa Kenya STK push
// Docs: https://developers.africastalking.com/docs/payment/mobile/checkout
// Required env: AT_API_KEY, AT_USERNAME, AT_PRODUCT_NAME, AT_CALLBACK_URL, AT_ENV

import { PaymentProvider, StkPushParams, StkPushResult, normalizePhone } from "./types";

const BASE = process.env.AT_ENV === "production"
  ? "https://payments.africastalking.com"
  : "https://payments.sandbox.africastalking.com";

export const AfricasTalkingProvider: PaymentProvider = {
  async stkPush({ phone, amount, orderId }: StkPushParams): Promise<StkPushResult> {
    const res = await fetch(`${BASE}/mobile/checkout/request`, {
      method: "POST",
      headers: {
        apiKey: process.env.AT_API_KEY!,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username: process.env.AT_USERNAME!,
        productName: process.env.AT_PRODUCT_NAME!,
        phoneNumber: `+${normalizePhone(phone)}`,
        currencyCode: "KES",
        amount: String(Math.ceil(amount)),
        metadata: JSON.stringify({ orderId }),
      }),
    });

    const data = await res.json() as any;
    if (data.status !== "PendingConfirmation") throw new Error(data.description || "Africa's Talking STK push failed");
    return {
      checkoutRequestId: data.transactionId ?? orderId,
      customerMessage: "M-Pesa prompt sent to your phone",
    };
  },
};
