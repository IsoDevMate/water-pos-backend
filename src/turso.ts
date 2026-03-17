import { createClient } from "@libsql/client";
import { getPendingChanges, markChangesSynced } from "./db";

const turso = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_TOKEN!,
});

// Run once on startup to ensure Turso has the same schema
export async function initTursoSchema() {
  await turso.execute(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    primaryPhone TEXT NOT NULL UNIQUE,
    name TEXT,
    qrCodeId TEXT NOT NULL UNIQUE,
    totalRefills INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  await turso.execute(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customerId TEXT,
    guestPhone TEXT,
    channel TEXT NOT NULL,
    bottles INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  console.log("Turso schema ready");
}

// Push all unsynced local changes to Turso
export async function flushToTurso(): Promise<number> {
  const changes = getPendingChanges() as Array<{
    id: string;
    entityType: string;
    operation: string;
    payload: string;
  }>;

  if (changes.length === 0) return 0;

  for (const change of changes) {
    const payload = JSON.parse(change.payload);

    if (change.entityType === "customer") {
      await turso.execute({
        sql: `INSERT INTO customers (id, primaryPhone, name, qrCodeId, totalRefills, createdAt, updatedAt)
              VALUES (:id, :primaryPhone, :name, :qrCodeId, :totalRefills, :createdAt, :updatedAt)
              ON CONFLICT(id) DO UPDATE SET
                primaryPhone = excluded.primaryPhone,
                name = excluded.name,
                totalRefills = excluded.totalRefills,
                updatedAt = excluded.updatedAt`,
        args: {
          id: String(payload.id),
          primaryPhone: String(payload.primaryPhone),
          name: payload.name ? String(payload.name) : null,
          qrCodeId: String(payload.qrCodeId),
          totalRefills: Number(payload.totalRefills),
          createdAt: String(payload.createdAt),
          updatedAt: String(payload.updatedAt),
        },
      });
    }

    if (change.entityType === "order") {
      await turso.execute({
        sql: `INSERT INTO orders (id, customerId, guestPhone, channel, bottles, status, createdAt, updatedAt)
              VALUES (:id, :customerId, :guestPhone, :channel, :bottles, :status, :createdAt, :updatedAt)
              ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                updatedAt = excluded.updatedAt`,
        args: {
          id: String(payload.id),
          customerId: payload.customerId ? String(payload.customerId) : null,
          guestPhone: payload.guestPhone ? String(payload.guestPhone) : null,
          channel: String(payload.channel),
          bottles: Number(payload.bottles) || 0,
          status: String(payload.status),
          createdAt: String(payload.createdAt),
          updatedAt: String(payload.updatedAt),
        },
      });
    }
  }

  const ids = changes.map((c) => c.id);
  markChangesSynced(ids);
  console.log(`Synced ${ids.length} change(s) to Turso`);
  return ids.length;
}
