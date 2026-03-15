import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("water_pos.db");

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  primaryPhone TEXT NOT NULL,
  name TEXT,
  qrCodeId TEXT NOT NULL UNIQUE,
  totalRefills INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customerId TEXT,
  guestPhone TEXT,
  channel TEXT NOT NULL,
  bottles INTEGER NOT NULL,
  status TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(customerId) REFERENCES customers(id)
);
`);

export type Customer = {
  id: string;
  primaryPhone: string;
  name?: string | null;
  qrCodeId: string;
  totalRefills: number;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  customerId?: string | null;
  guestPhone?: string | null;
  channel: "walk_in" | "whatsapp" | "web";
  bottles: number;
  status: "pending" | "completed";
  createdAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function generateQrCodeId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function findCustomerByPhone(phone: string): Customer | undefined {
  const stmt = db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE primaryPhone = ?"
  );
  return stmt.get(phone);
}

export function findCustomerByQr(qrCodeId: string): Customer | undefined {
  const stmt = db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE qrCodeId = ?"
  );
  return stmt.get(qrCodeId);
}

export function createCustomer(phone: string, name?: string): Customer {
  const id = randomUUID();
  const qrCodeId = generateQrCodeId();
  const createdAt = nowIso();
  const updatedAt = createdAt;

  const stmt = db.prepare(
    `INSERT INTO customers (id, primaryPhone, name, qrCodeId, totalRefills, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  );
  stmt.run(id, phone, name ?? null, qrCodeId, createdAt, updatedAt);

  return {
    id,
    primaryPhone: phone,
    name: name ?? null,
    qrCodeId,
    totalRefills: 0,
    createdAt,
    updatedAt,
  };
}

export function incrementCustomerRefills(customerId: string, bottles: number) {
  const stmt = db.prepare<[string], Customer>(
    "SELECT * FROM customers WHERE id = ?"
  );
  const customer = stmt.get(customerId);
  if (!customer) return;

  const newTotal = customer.totalRefills + bottles;
  const updatedAt = nowIso();

  const updateStmt = db.prepare(
    "UPDATE customers SET totalRefills = ?, updatedAt = ? WHERE id = ?"
  );
  updateStmt.run(newTotal, updatedAt, customerId);
}

export function createOrder(params: {
  customerId?: string;
  guestPhone?: string;
  channel: "walk_in" | "whatsapp" | "web";
  bottles: number;
}): Order {
  const id = randomUUID();
  const createdAt = nowIso();

  const stmt = db.prepare(
    `INSERT INTO orders (id, customerId, guestPhone, channel, bottles, status, createdAt)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`
  );
  stmt.run(
    id,
    params.customerId ?? null,
    params.guestPhone ?? null,
    params.channel,
    params.bottles,
    createdAt
  );

  if (params.customerId) {
    incrementCustomerRefills(params.customerId, params.bottles);
  }

  return {
    id,
    customerId: params.customerId ?? null,
    guestPhone: params.guestPhone ?? null,
    channel: params.channel,
    bottles: params.bottles,
    status: "completed",
    createdAt,
  };
}

