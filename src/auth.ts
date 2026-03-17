import jwt from "jsonwebtoken";
import { Resend } from "resend";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const OTP_ENABLED = process.env.OTP_ENABLED === "true";

// ── Email (Resend) ─────────────────────────────────────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? "placeholder");
  return _resend;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to: email,
    subject: "Your POS login code",
    text: `Your one-time login code is: ${code}\n\nExpires in 10 minutes.`,
    html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>Expires in 10 minutes.</p>`,
  });
}

export { OTP_ENABLED };

export type JwtPayload = {
  businessId: string;
  ownerPhone: string;
  ownerEmail: string;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ── Middleware ─────────────────────────────────────────────

export interface AuthRequest extends Request {
  business?: JwtPayload;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authorization token required" });
    return;
  }
  try {
    req.business = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
