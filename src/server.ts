import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import logger from "./logger";
import { initTursoSchema, flushToTurso } from "./turso";
import {
  createBusiness,
  createCustomer,
  createOrder,
  getBusinessById,
  getBusinessByOwnerPhone,
  getBusinessByOwnerEmail,
  updateBusinessBottlePrice,
  updateBusinessPayment,
  findCustomerByPhone,
  findCustomerById,
  findCustomerByQr,
  getOrdersByCustomerId,
  getAllCustomers,
  updateOrderStatus,
  getPendingActiveOrders,
  getPendingChanges,
  markChangesSynced,
  computeLoyalty,
  getDailySales,
  getMonthlySales,
  getChannelBreakdown,
  getRevenueStats,
  getTopCustomers,
  getInactiveCustomers,
  addStock,
  adjustStock,
  getStockSummary,
  addExpense,
  getExpenses,
  getExpenseSummary,
  getProfitSummary,
  getPendingNotifications,
  markNotificationSent,
  queueNotification,
  createPayment,
  setPaymentCheckoutId,
  updatePaymentStatus,
  getPaymentByOrderId,
  getPaymentByOrderIdForBusiness,
  createOtp,
  verifyOtp,
  Order,
} from "./db";
import { stkPushForBusiness } from "./providers";
import { sendOtpEmail, signToken, requireAuth, AuthRequest, OTP_ENABLED } from "./auth";

const app = express();
app.use(cors());
app.use(express.json());

// ── Request logger ─────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level]({ method: req.method, path: req.path, status: res.statusCode, ms });
  });
  next();
});

// ── Global error handler ───────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Auth ───────────────────────────────────────────────────

app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "email is required" });

  const business = getBusinessByOwnerEmail(email);
  if (!business) return res.status(404).json({ error: "No business found with this email" });

  // OTP disabled — issue token directly
  if (!OTP_ENABLED) {
    const token = signToken({ businessId: business.id, ownerPhone: business.ownerPhone, ownerEmail: email });
    return res.json({ ok: true, otpDisabled: true, token, business });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  createOtp(email, code);

  try {
    await sendOtpEmail(email, code);
    res.json({ ok: true, message: "OTP sent to your email" });
  } catch (e: any) {
    res.status(502).json({ error: "Failed to send email: " + e.message });
  }
});

app.post("/api/auth/verify-otp", (req: Request, res: Response) => {
  if (!OTP_ENABLED) return res.status(503).json({ error: "OTP login is not enabled" });

  const { email, code } = req.body as { email: string; code: string };
  if (!email || !code) return res.status(400).json({ error: "email and code are required" });

  const valid = verifyOtp(email, code);
  if (!valid) return res.status(401).json({ error: "Invalid or expired OTP" });

  const business = getBusinessByOwnerEmail(email)!;
  const token = signToken({ businessId: business.id, ownerPhone: business.ownerPhone, ownerEmail: email });
  res.json({ token, business });
});

// Reads businessId from JWT — all protected routes use this
function requireBusinessId(req: Request, res: Response): string | null {
  const authReq = req as AuthRequest;
  if (!authReq.business?.businessId) {
    res.status(401).json({ error: "Unauthorized — please log in" });
    return null;
  }
  return authReq.business.businessId;
}

// Apply JWT auth to all /api routes except public ones
app.use("/api", (req: Request, res: Response, next) => {
  const pub = [
    { method: "POST", path: "/api/auth/send-otp" },
    { method: "POST", path: "/api/auth/verify-otp" },
    { method: "POST", path: "/api/businesses/register" },
    { method: "GET",  path: "/api/businesses/" },
    { method: "POST", path: "/api/payments/callback" },
    { method: "GET",  path: "/api/webhook/whatsapp" },
    { method: "POST", path: "/api/webhook/whatsapp" },
  ];
  const isPublic = pub.some(
    (r) => req.method === r.method && req.path.startsWith(r.path.replace("/api", ""))
  );
  if (isPublic) return next();
  requireAuth(req as AuthRequest, res, next);
});
// ── Businesses (tenants) ────────────────────────────────────

app.post("/api/businesses/register", (req: Request, res: Response) => {
  const { name, ownerPhone, ownerEmail, bottlePrice } = req.body as {
    name: string;
    ownerPhone: string;
    ownerEmail?: string;
    bottlePrice?: number;
  };
  if (!name || !ownerPhone) {
    return res.status(400).json({ error: "name and ownerPhone required" });
  }
  if (getBusinessByOwnerPhone(ownerPhone)) {
    return res.status(409).json({ error: "Business with this ownerPhone already exists" });
  }
  if (ownerEmail && getBusinessByOwnerEmail(ownerEmail)) {
    return res.status(409).json({ error: "Business with this email already exists" });
  }
  const business = createBusiness(name, ownerPhone, bottlePrice ?? 50, ownerEmail);
  res.status(201).json({ business });
});

app.get("/api/businesses/:id", (req: Request<{ id: string }>, res: Response) => {
  const business = getBusinessById(req.params.id);
  if (!business) return res.status(404).json({ error: "Business not found" });
  res.json({ business });
});

app.patch("/api/businesses/:id/payment", (req: Request<{ id: string }>, res: Response) => {
  const { provider, config } = req.body as {
    provider: string;
    config: Record<string, string>;
  };
  if (!provider || !config || typeof config !== "object") {
    return res.status(400).json({ error: "provider and config object required" });
  }
  const business = getBusinessById(req.params.id);
  if (!business) return res.status(404).json({ error: "Business not found" });
  updateBusinessPayment(req.params.id, provider, config);
  res.json({ ok: true });
});

app.patch("/api/businesses/:id/bottle-price", (req: Request<{ id: string }>, res: Response) => {
  const { bottlePrice } = req.body as { bottlePrice: number };
  if (!bottlePrice || bottlePrice <= 0) return res.status(400).json({ error: "bottlePrice must be > 0" });
  const business = getBusinessById(req.params.id);
  if (!business) return res.status(404).json({ error: "Business not found" });
  updateBusinessBottlePrice(req.params.id, bottlePrice);
  res.json({ ok: true });
});

// ── Customers ──────────────────────────────────────────────

app.get("/api/customers", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  res.json({ customers: getAllCustomers(businessId) });
});

app.post("/api/customers/find-or-create", (req: Request, res: Response) => {
  const { phone, name, autoCreate } = req.body as { phone: string; name?: string; autoCreate?: boolean };
  if (!phone) return res.status(400).json({ error: "phone is required" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;

  let customer = findCustomerByPhone(phone, businessId);
  if (customer) return res.json({ exists: true, customer, loyalty: computeLoyalty(customer.totalRefills) });

  if (autoCreate) {
    customer = createCustomer(phone, businessId, name);
    return res.status(201).json({ exists: false, created: true, customer, loyalty: computeLoyalty(0) });
  }

  return res.json({ exists: false, created: false });
});

app.post("/api/customers/register", (req: Request, res: Response) => {
  const { phone, name } = req.body as { phone: string; name?: string };
  if (!phone) return res.status(400).json({ error: "phone is required" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;

  if (findCustomerByPhone(phone, businessId)) {
    return res.status(409).json({ error: "Customer with this phone already exists" });
  }

  const customer = createCustomer(phone, businessId, name);
  res.status(201).json({ customer, loyalty: computeLoyalty(0) });
});

app.get("/api/customers/by-qr/:qrCodeId", (req: Request<{ qrCodeId: string }>, res: Response) => {
  const customer = findCustomerByQr(req.params.qrCodeId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer, loyalty: computeLoyalty(customer.totalRefills) });
});

app.get("/api/customers/:id", (req: Request<{ id: string }>, res: Response) => {
  const customer = findCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer, loyalty: computeLoyalty(customer.totalRefills) });
});

app.get("/api/customers/:id/orders", (req: Request<{ id: string }>, res: Response) => {
  const customer = findCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ orders: getOrdersByCustomerId(req.params.id) });
});

// ── Orders ─────────────────────────────────────────────────

// Customer-facing: get own orders by phone
app.get("/api/orders/customer/:phone", (req: Request<{ phone: string }>, res: Response) => {
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  const customer = findCustomerByPhone(req.params.phone, businessId);
  if (!customer) return res.json({ customer: null, orders: [], loyalty: null });
  const orders = getOrdersByCustomerId(customer.id);
  res.json({ customer, orders, loyalty: computeLoyalty(customer.totalRefills) });
});

app.get("/api/orders/pending", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  res.json({ orders: getPendingActiveOrders(businessId) });
});

app.post("/api/orders", (req: Request, res: Response) => {
  const { phone, bottles, channel, name } = req.body as {
    phone: string;
    bottles: number;
    channel: "walk_in" | "whatsapp" | "web";
    name?: string;
  };

  if (!phone) return res.status(400).json({ error: "phone is required" });
  if (!bottles || bottles <= 0) return res.status(400).json({ error: "bottles must be > 0" });
  if (!channel) return res.status(400).json({ error: "channel is required" });

  const businessId = requireBusinessId(req, res);
  if (!businessId) return;

  const customer = findCustomerByPhone(phone, businessId) ?? createCustomer(phone, businessId, name);
  const order = createOrder({ businessId, customerId: customer.id, channel, bottles });
  const updated = findCustomerById(customer.id)!;

  res.status(201).json({ order, customer: updated, loyalty: computeLoyalty(updated.totalRefills) });
});

app.patch("/api/orders/:id/status", (req: Request<{ id: string }>, res: Response) => {
  const { status } = req.body as { status: Order["status"] };
  const allowed = ["pending", "confirmed", "delivered", "completed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "invalid status" });
  updateOrderStatus(req.params.id, status);
  res.json({ ok: true });
});

// ── WhatsApp webhook ───────────────────────────────────────

app.post("/api/webhook/whatsapp", (req: Request, res: Response) => {
  // Meta sends a GET for verification
  res.sendStatus(200);
});

app.get("/api/webhook/whatsapp", (req: Request, res: Response) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query as Record<string, string>;
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.sendStatus(403);
});

// Simulate an inbound WhatsApp message (for testing without Meta setup)
app.post("/api/webhook/whatsapp/simulate", (req: Request, res: Response) => {
  const { phone, text } = req.body as { phone: string; text: string };
  if (!phone || !text) return res.status(400).json({ error: "phone and text required" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;

  // Parse "3" or "order 3" or "3 bottles" → bottles = 3
  const match = text.match(/\d+/);
  if (!match) return res.status(400).json({ error: "Could not parse bottle count from message" });

  const bottles = parseInt(match[0], 10);
  const customer = findCustomerByPhone(phone, businessId) ?? createCustomer(phone, businessId);
  const order = createOrder({ businessId, customerId: customer.id, channel: "whatsapp", bottles });
  const updated = findCustomerById(customer.id)!;

  res.status(201).json({ order, customer: updated, loyalty: computeLoyalty(updated.totalRefills) });
});

// ── Sync ───────────────────────────────────────────────────

app.get("/api/sync/pending", (_req: Request, res: Response) => {
  res.json({ changes: getPendingChanges() });
});

app.post("/api/sync/ack", (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
  markChangesSynced(ids);
  res.json({ ok: true, synced: ids.length });
});

app.post("/api/sync/flush", async (_req: Request, res: Response) => {
  const count = await flushToTurso();
  res.json({ ok: true, synced: count });
});

// ── Analytics ─────────────────────────────────────────────

app.get("/api/analytics/summary", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  const daily = getDailySales(businessId, 7);
  const topCustomers = getTopCustomers(businessId, 5);
  const revenue = getRevenueStats(businessId);
  const channels = getChannelBreakdown(businessId, 30);
  res.json({ daily, topCustomers, revenue, channels });
});

app.get("/api/analytics/monthly", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  res.json({ monthly: getMonthlySales(businessId, 6) });
});

app.get("/api/analytics/inactive", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  res.json({ customers: getInactiveCustomers(businessId, 30) });
});

// ── Inventory ─────────────────────────────────────────────

app.get("/api/inventory", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  res.json(getStockSummary(businessId));
});

app.post("/api/inventory/stock-in", (req: Request, res: Response) => {
  const { quantity, note } = req.body as { quantity: number; note?: string };
  if (!quantity || quantity <= 0) return res.status(400).json({ error: "quantity must be > 0" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  res.status(201).json({ entry: addStock(businessId, quantity, note) });
});

app.post("/api/inventory/adjust", (req: Request, res: Response) => {
  const { quantity, note } = req.body as { quantity: number; note?: string };
  if (quantity === undefined) return res.status(400).json({ error: "quantity required (can be negative)" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  res.status(201).json({ entry: adjustStock(businessId, quantity, note) });
});

// ── Bookkeeping (Expenses) ─────────────────────────────────

app.get("/api/bookkeeping/expenses", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  const days = Number((_req.query as any).days) || 30;
  res.json({ expenses: getExpenses(businessId, days) });
});

app.post("/api/bookkeeping/expenses", (req: Request, res: Response) => {
  const { amount, category, note } = req.body as { amount: number; category: string; note?: string };
  if (!amount || amount <= 0) return res.status(400).json({ error: "amount must be > 0" });
  if (!category) return res.status(400).json({ error: "category is required" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  res.status(201).json({ expense: addExpense(businessId, amount, category, note) });
});

app.get("/api/bookkeeping/summary", (_req: Request, res: Response) => {
  const businessId = requireBusinessId(_req, res);
  if (!businessId) return;
  const days = Number((_req.query as any).days) || 30;
  const profit = getProfitSummary(businessId, days);
  const byCategory = getExpenseSummary(businessId, days);
  res.json({ ...profit, byCategory, days });
});

// ── Notifications ──────────────────────────────────────────

app.get("/api/notifications/pending", (_req: Request, res: Response) => {
  res.json({ notifications: getPendingNotifications() });
});

app.post("/api/notifications/:id/sent", (req: Request<{ id: string }>, res: Response) => {
  markNotificationSent(req.params.id);
  res.json({ ok: true });
});

// ── Campaigns ─────────────────────────────────────────────

app.post("/api/campaigns/broadcast", (req: Request, res: Response) => {
  const { message, segment } = req.body as {
    message: string;
    segment: "all" | "inactive" | "close_to_free";
  };
  if (!message || !segment) return res.status(400).json({ error: "message and segment required" });

  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  let customers = getAllCustomers(businessId);

  if (segment === "inactive") {
    customers = getInactiveCustomers(businessId, 30);
  } else if (segment === "close_to_free") {
    customers = customers.filter((c) => {
      const { bottlesToNextFree } = computeLoyalty(c.totalRefills);
      return bottlesToNextFree <= 2;
    });
  }

  for (const c of customers) {
    queueNotification(c.id, c.primaryPhone, message, "campaign");
  }

  res.json({ ok: true, queued: customers.length });
});

// ── Payments (M-Pesa STK Push) ─────────────────────────────

app.post("/api/payments/stk-push", async (req: Request, res: Response) => {
  const { orderId, phone, amount } = req.body as { orderId: string; phone: string; amount: number };
  if (!orderId || !phone || !amount) return res.status(400).json({ error: "orderId, phone, amount required" });
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;

  const business = getBusinessById(businessId);
  if (!business) return res.status(404).json({ error: "Business not found" });
  if (!business.paymentProvider || !business.paymentConfig) {
    return res.status(400).json({ error: "Business payment provider/config not set" });
  }

  let config: Record<string, string>;
  try {
    config = JSON.parse(business.paymentConfig) as Record<string, string>;
  } catch {
    return res.status(400).json({ error: "Business paymentConfig is invalid JSON" });
  }

  const payment = createPayment(businessId, orderId, phone, amount);

  try {
    const result = await stkPushForBusiness(business.paymentProvider, config, {
      phone,
      amount,
      orderId,
    });
    setPaymentCheckoutId(payment.id, result.checkoutRequestId);
    res.json({ ok: true, paymentId: payment.id, checkoutRequestId: result.checkoutRequestId, message: result.customerMessage });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

// M-Pesa calls this after customer enters PIN
app.post("/api/payments/callback", (req: Request, res: Response) => {
  const body = req.body?.Body?.stkCallback;
  if (!body) return res.sendStatus(200);

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body;
  const status = ResultCode === 0 ? "success" : "failed";
  const receipt = CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value;

  updatePaymentStatus(CheckoutRequestID, status, receipt, ResultDesc);

  // If paid, mark order completed
  if (status === "success") {
    // We don't have orderId here directly — look it up via checkoutRequestId handled in DB
  }

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

app.get("/api/payments/status/:orderId", (req: Request<{ orderId: string }>, res: Response) => {
  const businessId = requireBusinessId(req, res);
  if (!businessId) return;
  const payment = getPaymentByOrderIdForBusiness(businessId, req.params.orderId);
  if (!payment) return res.json({ status: "none" });
  res.json({ status: payment.status, receipt: payment.mpesaReceiptNumber, paymentId: payment.id });
});

// ── Start ──────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`Backend running on http://0.0.0.0:${PORT}`);
  initTursoSchema()
    .then(() => flushToTurso())
    .catch((e) => logger.error({ err: e.message }, "Turso init error"));
  setInterval(() => flushToTurso().catch((e) => logger.error({ err: e.message }, "Sync error")), 30_000);
});
