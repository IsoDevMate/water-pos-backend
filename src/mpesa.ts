// M-Pesa Daraja API — STK Push (works for both Paybill and Buy Goods/Till)

const isSandbox = process.env.MPESA_ENV !== "production";
const BASE_URL = isSandbox
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

async function getAccessToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY!;
  const secret = process.env.MPESA_CONSUMER_SECRET!;
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

function getPassword(timestamp: string): string {
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

// Normalize phone: 07XXXXXXXX or +2547XXXXXXXX → 2547XXXXXXXX
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

export async function stkPush(params: {
  phone: string;
  amount: number;
  orderId: string;
}): Promise<{ CheckoutRequestID: string; ResponseCode: string; CustomerMessage: string }> {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const password = getPassword(timestamp);
  const shortcode = process.env.MPESA_SHORTCODE!;
  const type = process.env.MPESA_TYPE === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  const body: Record<string, string> = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: type,
    Amount: String(Math.ceil(params.amount)),
    PartyA: normalizePhone(params.phone),
    PartyB: shortcode,
    PhoneNumber: normalizePhone(params.phone),
    CallBackURL: process.env.MPESA_CALLBACK_URL!,
    AccountReference: params.orderId.slice(0, 12),
    TransactionDesc: "Water order",
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.json() as any;
}
