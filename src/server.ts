import express, { Request, Response } from "express";
import cors from "cors";
import {
  createCustomer,
  createOrder,
  Customer,
  findCustomerByPhone,
  findCustomerByQr,
  Order,
} from "./db";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Find or create by phone (optionally autoCreate)
app.post(
  "/customers/find-or-create-by-phone",
  (req: Request, res: Response) => {
    const { phone, name, autoCreate } = req.body as {
      phone: string;
      name?: string;
      autoCreate?: boolean;
    };

    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    let customer = findCustomerByPhone(phone);
    if (customer) {
      return res.json({ exists: true, customer });
    }

    if (autoCreate) {
      customer = createCustomer(phone, name);
      return res.json({ exists: false, created: true, customer });
    }

    return res.json({ exists: false, created: false });
  }
);

// Register a new customer explicitly
app.post("/customers/register", (req: Request, res: Response) => {
  const { phone, name } = req.body as { phone: string; name?: string };

  if (!phone) {
    return res.status(400).json({ error: "phone is required" });
  }

  const existing = findCustomerByPhone(phone);
  if (existing) {
    return res
      .status(409)
      .json({ error: "Customer with this phone already exists" });
  }

  const customer = createCustomer(phone, name);
  res.status(201).json({ customer });
});

// Lookup customer by QR code ID
app.get("/customers/by-qr/:qrCodeId", (req: Request, res: Response) => {
  const qrCodeId = req.params.qrCodeId as string;
  const customer = findCustomerByQr(qrCodeId);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }
  res.json({ customer });
});

// Basic customer detail
app.get("/customers/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const customerStmt = findCustomerByPhone; // placeholder to avoid unused import
  // Instead of direct SQL here, reuse helpers or add dedicated getter later.
  // For now we can return 501 to keep backend compiling cleanly.
  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }
  return res.status(501).json({ error: "Not implemented in this build" });
});

// Orders for a customer
app.get("/customers/:id/orders", (_req: Request, res: Response) => {
  return res.status(501).json({ error: "Not implemented in this build" });
});

// Create an order (customer or guest)
app.post("/orders", (req: Request, res: Response) => {
  const { phone, bottles, channel, asGuest, name } = req.body as {
    phone?: string;
    bottles: number;
    channel: "walk_in" | "whatsapp" | "web";
    asGuest?: boolean;
    name?: string;
  };

  if (!bottles || bottles <= 0) {
    return res.status(400).json({ error: "bottles must be > 0" });
  }
  if (!channel) {
    return res.status(400).json({ error: "channel is required" });
  }

  let customer: Customer | undefined;
  let guestPhone: string | undefined;

  if (!asGuest) {
    if (!phone) {
      return res.status(400).json({ error: "phone is required for customer" });
    }
    customer = findCustomerByPhone(phone) ?? createCustomer(phone, name);
  } else {
    if (!phone) {
      return res
        .status(400)
        .json({ error: "phone is required for guest order" });
    }
    guestPhone = phone;
  }

  const order = createOrder(
    {
      customerId: customer?.id,
      guestPhone,
      channel,
      bottles,
    } as {
      customerId?: string;
      guestPhone?: string;
      channel: "walk_in" | "whatsapp" | "web";
      bottles: number;
    }
  );

  res.status(201).json({ order, customer: customer ?? null });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
});

