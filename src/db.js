"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.findCustomerByPhone = findCustomerByPhone;
exports.findCustomerByQr = findCustomerByQr;
exports.createCustomer = createCustomer;
exports.incrementCustomerRefills = incrementCustomerRefills;
exports.createOrder = createOrder;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = require("crypto");
exports.db = new better_sqlite3_1.default("water_pos.db");
// Initialize tables
exports.db.exec(`
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
function nowIso() {
    return new Date().toISOString();
}
function generateQrCodeId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function findCustomerByPhone(phone) {
    const stmt = exports.db.prepare("SELECT * FROM customers WHERE primaryPhone = ?");
    return stmt.get(phone);
}
function findCustomerByQr(qrCodeId) {
    const stmt = exports.db.prepare("SELECT * FROM customers WHERE qrCodeId = ?");
    return stmt.get(qrCodeId);
}
function createCustomer(phone, name) {
    const id = (0, crypto_1.randomUUID)();
    const qrCodeId = generateQrCodeId();
    const createdAt = nowIso();
    const updatedAt = createdAt;
    const stmt = exports.db.prepare(`INSERT INTO customers (id, primaryPhone, name, qrCodeId, totalRefills, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 0, ?, ?)`);
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
function incrementCustomerRefills(customerId, bottles) {
    const stmt = exports.db.prepare("SELECT * FROM customers WHERE id = ?");
    const customer = stmt.get(customerId);
    if (!customer)
        return;
    const newTotal = customer.totalRefills + bottles;
    const updatedAt = nowIso();
    const updateStmt = exports.db.prepare("UPDATE customers SET totalRefills = ?, updatedAt = ? WHERE id = ?");
    updateStmt.run(newTotal, updatedAt, customerId);
}
function createOrder(params) {
    const id = (0, crypto_1.randomUUID)();
    const createdAt = nowIso();
    const stmt = exports.db.prepare(`INSERT INTO orders (id, customerId, guestPhone, channel, bottles, status, createdAt)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`);
    stmt.run(id, params.customerId ?? null, params.guestPhone ?? null, params.channel, params.bottles, createdAt);
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
//# sourceMappingURL=db.js.map