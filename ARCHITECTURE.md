# Water POS — Architecture

## Stack
- Frontend: React + TypeScript + Tailwind (PWA, installable on mobile)
- Backend: Node.js + Express
- Local DB: SQLite via `better-sqlite3` (offline-first)
- Cloud DB: Turso (libSQL, SQLite-compatible) — sync target when online
- Offline layer: Dexie.js (IndexedDB) on frontend + `pending_changes` queue
- Messaging: Meta WhatsApp Cloud API + Nodemailer (email)

## Decision: React PWA (NOT Flutter)
Flutter was considered and rejected. Staying with React + Node because:
- Codebase already started in React/Node/SQLite
- React PWA is installable on Android/iOS (Add to Home Screen)
- No Dart, no second codebase

## DB Strategy
- Dev/edge: SQLite (local file, `water_pos.db`)
- Production/cloud: Turso (same SQLite schema, libSQL driver)
- Same queries work on both — no translation layer needed
- Sync: `pending_changes` table queues offline writes → flushed to Turso on reconnect

## Deployment
- Backend (production): https://water-pos-backend.onrender.com
- Frontend: React PWA (served via Vite dev locally, deploy to Vercel/Netlify later)
- DB: Turso — libsql://water-pos-isodevmate.aws-us-east-1.turso.io

## Architecture Flow
```
React PWA (mobile + desktop)
  └── Dexie.js (IndexedDB) ← works offline
  └── syncs when online ↓
Node.js Backend (always online — Render)
  ├── /api/clients
  ├── /api/orders
  ├── /api/loyalty
  ├── /api/sync        ← offline queue flush → Turso
  └── /api/webhook     ← WhatsApp incoming orders
  └── SQLite (local dev) / Turso (production)
  └── Meta WhatsApp Cloud API + Nodemailer
```

## Unifying Factor
Phone number is the single identity across all channels:
- Walk-in (POS staff enters phone)
- WhatsApp order (sender's number)
- Web order form (customer enters phone)
All map to `customers.primaryPhone` → same `customer_id`

## Two Sides
- **POS / Owner:** client management, sales, loyalty tracking, delivery, campaigns
- **Customer:** order water (WhatsApp or web form), view history, loyalty rewards

## Loyalty Rules
- Every 10th bottle refill → next bottle free (11th, 21st, 31st...)
- Configurable per business owner
- Tracked via `customers.totalRefills`

## Channels
- Walk-in: staff uses POS app
- WhatsApp: customer texts → webhook → order created on backend
- Web form: lightweight public page → POST /api/orders

---

## Sprint Status

### ✅ Sprint 1 — Core POS (DONE)
- Customer find-or-create by phone
- Walk-in order creation
- Loyalty counter (totalRefills + bottlesToNextFree + freeBottlesAvailable)
- All CRUD endpoints working
- React PWA: New Sale, Customers, Pending Orders, Customer Detail screens
- Bottom nav, loyalty bar, sync status bar

### ✅ Sprint 2 — Turso Cloud Sync (DONE)
- `pending_changes` table queues all writes
- Auto-flush to Turso every 30s + on startup
- Manual flush via POST /api/sync/flush
- Frontend SyncBar: shows offline/syncing/pending state
- Render backend URL: https://water-pos-backend.onrender.com

### 🔜 Sprint 3 — WhatsApp Orders (PARKED — needs Meta account setup)
**What's needed before starting:**
1. Meta Developer account at developers.facebook.com
2. Create a Meta App (type: Business) → add WhatsApp product
3. Get a test phone number from Meta dashboard
4. Deploy backend to Render (URL ready: https://water-pos-backend.onrender.com)
5. Set webhook URL in Meta to: https://water-pos-backend.onrender.com/api/webhook/whatsapp
6. Add to .env:
   - WHATSAPP_VERIFY_TOKEN=<make up any string>
   - WHATSAPP_TOKEN=<from Meta dashboard>
   - WHATSAPP_PHONE_ID=<from Meta dashboard>
**Simulate endpoint ready:** POST /api/webhook/whatsapp/simulate

### ✅ Sprint 4 — Customer Web Order Form (DONE)
- Public `/order` page — phone + quantity → submits to backend with `channel: "web"`
- No login required, no nav/sync bar shown
- Shows loyalty status and last 3 orders
- All API calls go through `api.ts` (no hardcoded IPs)

### ✅ Sprint 5 — Campaigns & Reminders (DONE)
- `notifications` table queues all outbound messages
- Auto-queues loyalty reminder after order if customer is ≤2 bottles from free
- `GET /api/analytics/summary` — daily sales (7 days), top 5 customers, totals
- `GET /api/analytics/inactive` — customers inactive >30 days
- `POST /api/campaigns/broadcast` — queue message to segment (all / inactive / close_to_free)
- Analytics page: daily bar chart + top customers
- Campaigns page: segment picker + message composer + broadcast
- Messages queued and ready to send when WhatsApp (Sprint 3) is connected
