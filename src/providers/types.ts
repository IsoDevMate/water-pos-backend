// Shared types and phone normalizer used by all providers

export type StkPushParams = {
  phone: string;
  amount: number;
  orderId: string;
};

export type StkPushResult = {
  checkoutRequestId: string;
  customerMessage: string;
};

export interface PaymentProvider {
  stkPush(params: StkPushParams): Promise<StkPushResult>;
}

// Normalize phone → 2547XXXXXXXX
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}
