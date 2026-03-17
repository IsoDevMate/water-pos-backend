import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("water_pos.db");

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  businessId TEXT NOT NULL,
  primaryPhone TEXT NOT NULL,
  name TEXT,
  qrCodeId TEXT NOT NULL UNIQUE,
  totalRefills INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(businessId, primaryPhone)
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ownerPhone TEXT NOT NULL UNIQUE,
  bottlePrice INTEGER NOT NULL DEFAULT 50,
  paymentProvider TEXT,
  paymentConfig TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  businessId TEXT NOT NULL,
  customerId TEXT,
  guestPhone TEXT,
  channel TEXT NOT NULL,
  bottles INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(customerId) REFERENCES customers(id),
  FOREIGN KEY(businessId) REFERENCES businesses(id)
);

CREATE TABLE IF NOT EXISTS pending_changes (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  sentAt TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(customerId) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  businessId TEXT NOT NULL,
  orderId TEXT NOT NULL,
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL,
  checkoutRequestId TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  mpesaReceiptNumber TEXT,
  resultDesc TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(orderId) REFERENCES orders(id),
  FOREIGN KEY(businessId) REFERENCES businesses(id)
);
`);

export type Customer = {
  id: string;
  businessId: string;
  primaryPhone: string;
  name?: string | null;
  qrCodeId: string;
  totalRefills: number;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  businessId: string;
  customerId?: string | null;
  guestPhone?: string | null;
  channel: "walk_in" | "whatsapp" | "web";
  bottles: number;
  status: "pending" | "confirmed" | "delivered" | "completed";
  createdAt: string;
  updatedAt: string;
};

export type Business = {
  id: string;
  name: string;
  ownerPhone: string;
  bottlePrice: number;
  paymentProvider: string | null;
  paymentConfig: string | null; // JSON string of provider credentials
  createdAt: string;
  updatedAt: string;
};

export type LoyaltyInfo = {
  totalRefills: number;
  bottlesToNextFree: number;
  freeBottlesAvailable: number;
};

const LOYALTY_INTERVAL = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function generateQrCodeId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function computeLoyalty(totalRefills: number): LoyaltyInfo {
  const freeBottlesAvailable = Math.floor(totalRefills / LOYALTY_INTERVAL);
  const bottlesToNextFree = LOYALTY_INTERVAL - (totalRefills % LOYALTY_INTERVAL);
  return { totalRefills, bottlesToNextFree, freeBottlesAvailable };
}

export function findCustomerByPhone(phone: string, businessId: string): Customer | undefined {
  return db.prepare<[string, string], Customer>(
    "SELECT * FROM customers WHERE primaryPhone = ? AND businessId = ?"
  ).get(phone, businessId);
}

export function findCustomerById(id: string): Customer | undefined {
  return db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE id = ?"
  ).get(id);
}

export function findCustomerByQr(qrCodeId: string): Customer | undefined {
  return db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE qrCodeId = ?"
  ).get(qrCodeId);
}

export function getOrdersByCustomerId(customerId: string): Order[] {
  return db.prepare<[string], Order>(
    "SELECT * FROM orders WHERE customerId = ? ORDER BY createdAt DESC"
  ).all(customerId);
}

export function getAllCustomers(businessId: string): Customer[] {
  return db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE businessId = ? ORDER BY createdAt DESC"
  ).all(businessId);
}

export function createCustomer(phone: string, businessId: string, name?: string): Customer {
  const id = randomUUID();
  const qrCodeId = generateQrCodeId();
  const now = nowIso();

  db.prepare(
    `INSERT INTO customers (id, businessId, primaryPhone, name, qrCodeId, totalRefills, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, businessId, phone, name ?? null, qrCodeId, now, now);

  queueChange("customer", id, "upsert", { id, businessId, primaryPhone: phone, name, qrCodeId, totalRefills: 0, createdAt: now, updatedAt: now });

  return { id, businessId, primaryPhone: phone, name: name ?? null, qrCodeId, totalRefills: 0, createdAt: now, updatedAt: now };
}

// ── Business CRUD ──────────────────────────────────────────

export function createBusiness(name: string, ownerPhone: string, bottlePrice = 50): Business {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO businesses (id, name, ownerPhone, bottlePrice, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, ownerPhone, bottlePrice, now, now);
  return { id, name, ownerPhone, bottlePrice, paymentProvider: null, paymentConfig: null, createdAt: now, updatedAt: now };
}

export function getBusinessById(id: string): Business | undefined {
  return db.prepare<[string], Business>("SELECT * FROM businesses WHERE id = ?").get(id);
}

export function getBusinessByOwnerPhone(phone: string): Business | undefined {
  return db.prepare<[string], Business>("SELECT * FROM businesses WHERE ownerPhone = ?").get(phone);
}

export function updateBusinessPayment(
  businessId: string,
  provider: string,
  config: Record<string, string>
): void {
  db.prepare(
    "UPDATE businesses SET paymentProvider = ?, paymentConfig = ?, updatedAt = ? WHERE id = ?"
  ).run(provider, JSON.stringify(config), nowIso(), businessId);
}

export function updateBusinessBottlePrice(businessId: string, price: number): void {
  db.prepare("UPDATE businesses SET bottlePrice = ?, updatedAt = ? WHERE id = ?")
    .run(price, nowIso(), businessId);
}

export function updateOrderStatus(orderId: string, status: Order["status"]): void {
  const now = nowIso();
  db.prepare("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?").run(status, now, orderId);
  queueChange("order", orderId, "upsert", { id: orderId, status, updatedAt: now });
}

export function createOrder(params: {
  businessId: string;
  customerId?: string;
  guestPhone?: string;
  channel: "walk_in" | "whatsapp" | "web";
  bottles: number;
}): Order {
  const id = randomUUID();
  const now = nowIso();
  const status = params.channel === "walk_in" ? "completed" : "pending";

  db.prepare(
    `INSERT INTO orders (id, businessId, customerId, guestPhone, channel, bottles, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.businessId, params.customerId ?? null, params.guestPhone ?? null, params.channel, params.bottles, status, now, now);

  if (params.customerId) {
    db.prepare(
      "UPDATE customers SET totalRefills = totalRefills + ?, updatedAt = ? WHERE id = ?"
    ).run(params.bottles, now, params.customerId);

    const updated = findCustomerById(params.customerId);
    if (updated) {
      const loyalty = computeLoyalty(updated.totalRefills);
      if (loyalty.bottlesToNextFree <= 2) {
        const msg = loyalty.bottlesToNextFree === 1
          ? `💧 Just 1 more bottle and your next refill is FREE! Keep it up 🎉`
          : `💧 You're 2 bottles away from a FREE refill! Order now to claim it.`;
        queueNotification(updated.id, updated.primaryPhone, msg, "loyalty_reminder");
      }
    }
  }

  const order: Order = {
    id,
    businessId: params.businessId,
    customerId: params.customerId ?? null,
    guestPhone: params.guestPhone ?? null,
    channel: params.channel,
    bottles: params.bottles,
    status,
    createdAt: now,
    updatedAt: now,
  };

  queueChange("order", id, "upsert", order);
  return order;
}

export function getPendingActiveOrders(businessId: string): Order[] {
  return db.prepare<[string], Order>(
    "SELECT * FROM orders WHERE businessId = ? AND status IN ('pending','confirmed','delivered') ORDER BY createdAt DESC"
  ).all(businessId);
}

export function getPendingChanges() {
  return db.prepare(
    "SELECT * FROM pending_changes WHERE syncedAt IS NULL ORDER BY createdAt ASC"
  ).all();
}

export function markChangesSynced(ids: string[]): void {
  const now = nowIso();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE pending_changes SET syncedAt = ? WHERE id IN (${placeholders})`).run(now, ...ids);
}

// ── Analytics ──────────────────────────────────────────────

export function getDailySales(businessId: string, days = 7): { date: string; bottles: number; orders: number }[] {
  return db.prepare<[string, number], { date: string; bottles: number; orders: number }>(`
    SELECT date(createdAt) as date,
           SUM(bottles) as bottles,
           COUNT(*) as orders
    FROM orders
    WHERE businessId = ? AND createdAt >= date('now', ? || ' days')
    GROUP BY date(createdAt)
    ORDER BY date ASC
  `).all(businessId, -days);
}

export function getTopCustomers(businessId: string, limit = 5): (Customer & { orderCount: number })[] {
  return db.prepare<[string, number], Customer & { orderCount: number }>(`
    SELECT c.*, COUNT(o.id) as orderCount
    FROM customers c
    LEFT JOIN orders o ON o.customerId = c.id
    WHERE c.businessId = ?
    GROUP BY c.id
    ORDER BY c.totalRefills DESC
    LIMIT ?
  `).all(businessId, limit);
}

export function getInactiveCustomers(businessId: string, days = 30): Customer[] {
  return db.prepare<[string, number], Customer>(`
    SELECT c.* FROM customers c
    WHERE c.businessId = ? AND (
      (SELECT MAX(o.createdAt) FROM orders o WHERE o.customerId = c.id) < date('now', ? || ' days')
      OR (SELECT COUNT(*) FROM orders o WHERE o.customerId = c.id) = 0
    )
  `).all(businessId, -days);
}

// ── Notifications ──────────────────────────────────────────

export type Notification = {
  id: string;
  customerId: string;
  phone: string;
  message: string;
  type: string;
  sentAt: string | null;
  createdAt: string;
};

export function queueNotification(customerId: string, phone: string, message: string, type: string): void {
  db.prepare(
    `INSERT INTO notifications (id, customerId, phone, message, type, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), customerId, phone, message, type, nowIso());
}

export function getPendingNotifications(): Notification[] {
  return db.prepare<[], Notification>(
    "SELECT * FROM notifications WHERE sentAt IS NULL ORDER BY createdAt ASC"
  ).all();
}

export function markNotificationSent(id: string): void {
  db.prepare("UPDATE notifications SET sentAt = ? WHERE id = ?").run(nowIso(), id);
}

function queueChange(entityType: string, entityId: string, operation: string, payload: object): void {
  db.prepare(
    `INSERT INTO pending_changes (id, entityType, entityId, operation, payload, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), entityType, entityId, operation, JSON.stringify(payload), nowIso());
}

// ── Payments ───────────────────────────────────────────────

export type Payment = {
  id: string;
  orderId: string;
  phone: string;
  amount: number;
  checkoutRequestId: string | null;
  status: "pending" | "success" | "failed" | "cancelled";
  mpesaReceiptNumber: string | null;
  resultDesc: string | null;
  createdAt: string;
  updatedAt: string;
};

export function createPayment(businessId: string, orderId: string, phone: string, amount: number): Payment {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO payments (id, businessId, orderId, phone, amount, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(id, businessId, orderId, phone, amount, now, now);
  return { id, orderId, phone, amount, checkoutRequestId: null, status: "pending", mpesaReceiptNumber: null, resultDesc: null, createdAt: now, updatedAt: now };
}

export function setPaymentCheckoutId(paymentId: string, checkoutRequestId: string): void {
  db.prepare("UPDATE payments SET checkoutRequestId = ?, updatedAt = ? WHERE id = ?")
    .run(checkoutRequestId, nowIso(), paymentId);
}

export function updatePaymentStatus(
  checkoutRequestId: string,
  status: Payment["status"],
  mpesaReceiptNumber?: string,
  resultDesc?: string
): void {
  db.prepare(
    "UPDATE payments SET status = ?, mpesaReceiptNumber = ?, resultDesc = ?, updatedAt = ? WHERE checkoutRequestId = ?"
  ).run(status, mpesaReceiptNumber ?? null, resultDesc ?? null, nowIso(), checkoutRequestId);
}

export function getPaymentByOrderId(orderId: string): Payment | undefined {
  return db.prepare<[string], Payment>("SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt DESC LIMIT 1").get(orderId);
}

export function getPaymentByOrderIdForBusiness(
  businessId: string,
  orderId: string
): Payment | undefined {
  return db
    .prepare<[string, string], Payment>(
      "SELECT * FROM payments WHERE businessId = ? AND orderId = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(businessId, orderId);
}
