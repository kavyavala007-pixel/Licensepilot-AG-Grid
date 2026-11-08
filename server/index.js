// server/index.js — LicensePilot Express server (complete rewrite)
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import cron from "node-cron";
import { z } from "zod";
import {
  paypalOn,
  paypalWebhookConfigured,
  createOrder,
  captureOrder,
  createAndSendInvoice,
  verifyWebhookSignature,
  createSubscriptionPlan,
  createSubscription,
} from "./paypal.js";
import { runAgentForCustomer } from "./agent.js";
import { processPayPalEvent } from "./webhooks.js";
import { calcRenewalAmount, runPolicyChecks } from "./policy.js";

const app = express();
const prisma = new PrismaClient();
const distPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const PORT = process.env.PORT || 3001;
const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";
const AK = process.env.ANTHROPIC_API_KEY;
const demoMode = !paypalOn;

// ─── Middleware ──────────────────────────────────────────────────────────────

// Raw body needed for webhook signature verification
app.use(
  "/api/webhooks/paypal",
  express.raw({ type: "application/json", limit: "1mb" }),
);

app.use(
  helmet({
    contentSecurityPolicy: false, // Vite handles this in dev
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/events" || req.path === "/api/log",
  }),
);

app.use(express.json({ limit: "100kb" }));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: e.flatten() });
    }
    console.error("API error:", req.path, e.name || "Error");
    res.status(500).json({ error: e.message || "Internal server error" });
  });

// ─── SSE Event Bus ───────────────────────────────────────────────────────────

const sseClients = new Set();

function emit(event) {
  const ev = { time: new Date().toISOString(), ...event };
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
  return ev;
}

app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(
    `data: ${JSON.stringify({ type: "hello", paypalOn, aiEnabled: Boolean(AK) })}\n\n`,
  );
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function licenceKey() {
  return "LP-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

async function fulfillOrder(order) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) throw new Error("Order not found");
    if (current.status === "COMPLETED" && current.licenceKey)
      return current.licenceKey;

    const key = current.licenceKey || licenceKey();
    await tx.order.update({
      where: { id: current.id },
      data: { status: "COMPLETED", licenceKey: key },
    });

    if (current.customerId && current.product) {
      const customer = await tx.customer.findUnique({
        where: { id: current.customerId },
      });
      if (!customer) throw new Error("Order customer not found");
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1);
      await tx.licence.upsert({
        where: { orderId: current.paypalOrderId },
        create: {
          vendorId: customer.vendorId,
          customerId: customer.id,
          orderId: current.paypalOrderId,
          key,
          product: current.product,
          seats: current.seats,
          validUntil,
        },
        update: {},
      });
    }
    return key;
  });
}

async function getPolicyConfig() {
  const rows = await prisma.policy.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    autoInvoiceLimit: Number(map.auto_invoice_limit ?? 12000),
    renewalPct: Number(map.renewal_pct ?? 30),
    renewalWindowDays: Number(map.renewal_window_days ?? 30),
    excludedRegions: JSON.parse(map.excluded_regions ?? "[]"),
  };
}

/** Wrapper: create invoice via PayPal or mock, then save to DB */
async function makeInvoice({ customer, amount, note }) {
  const email =
    customer.billingEmail ||
    `billing@${customer.company.toLowerCase().replace(/[^a-z0-9]/g, "")}.example`;
  if (!paypalOn) {
    const mockId =
      "INV-DEMO-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    await prisma.invoice.create({
      data: {
        paypalInvoiceId: mockId,
        customerId: customer.id,
        amount,
        recipientEmail: email,
        description: note || "LicensePilot renewal",
        status: "SENT",
        mock: true,
      },
    });
    return { id: mockId, mock: true };
  }

  const inv = await createAndSendInvoice({
    name: `Renewal: ${customer.company}`,
    amount,
    email,
    note: note || "Automatic renewal by LicensePilot",
  });

  await prisma.invoice.create({
    data: {
      paypalInvoiceId: inv.id,
      customerId: customer.id,
      amount,
      recipientEmail: email,
      description: note || "Renewal",
      status: "SENT",
      mock: false,
    },
  });

  return inv;
}

async function makeSubscription({ customer, amount }) {
  if (!paypalOn) {
    const subscription = {
      id: "SUB-DEMO-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      approvalUrl: null,
    };
    await prisma.subscription.create({
      data: {
        paypalSubscriptionId: subscription.id,
        customerId: customer.id,
        amount,
        status: "PENDING",
        mock: true,
      },
    });
    return { ...subscription, amount };
  }

  const existingPlan = await prisma.subscription.findFirst({
    where: { amount, mock: false, paypalPlanId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { paypalPlanId: true },
  });
  const plan = existingPlan
    ? { id: existingPlan.paypalPlanId }
    : await createSubscriptionPlan({
        productName: "Annual Software Licence Renewal",
        amount,
        description: "Annual renewal subscription for a software licence.",
      });
  const subscription = await createSubscription({
    planId: plan.id,
    customerEmail: customer.billingEmail,
    companyName: customer.company,
  });
  await prisma.subscription.create({
    data: {
      paypalSubscriptionId: subscription.id,
      paypalPlanId: plan.id,
      customerId: customer.id,
      amount,
      status: "PENDING",
      approvalUrl: subscription.approvalUrl,
      mock: false,
    },
  });
  return { ...subscription, amount };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Config
app.get("/api/config", (_, res) =>
  res.json({
    paypalClientId: paypalOn ? process.env.PAYPAL_CLIENT_ID : null,
    paypalWebhookConfigured,
    aiEnabled: Boolean(AK),
    demoMode,
  }),
);

// ── Orders (Checkout) ────────────────────────────────────────────────────────

const orderSchema = z.object({
  amount: z.literal(1),
  desc: z.string().min(1).max(200),
  product: z.string().min(1).max(120).optional(),
  seats: z.number().int().min(1).max(1000).default(1),
  customerId: z.number().int().optional(),
});

app.post(
  "/api/orders",
  wrap(async (req, res) => {
    const { amount, desc, product, seats, customerId } = orderSchema.parse(
      req.body,
    );
    if (
      customerId &&
      !(await prisma.customer.findUnique({ where: { id: customerId } }))
    ) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (!paypalOn) {
      const mockId = "DEMO-" + Date.now();
      await prisma.order.create({
        data: {
          paypalOrderId: mockId,
          customerId,
          amount,
          description: desc,
          product,
          seats,
          status: "CREATED",
          mock: true,
        },
      });
      return res.json({ id: mockId, mock: true });
    }

    const d = await createOrder({ amount, description: desc });
    await prisma.order.create({
      data: {
        paypalOrderId: d.id,
        customerId,
        amount,
        description: desc,
        product,
        seats,
        status: "CREATED",
        mock: false,
      },
    });
    res.json({ id: d.id });
  }),
);

app.post(
  "/api/orders/:id/capture",
  wrap(async (req, res) => {
    const orderId = req.params.id;
    const order = await prisma.order.findUnique({
      where: { paypalOrderId: orderId },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "COMPLETED" && order.licenceKey) {
      return res.json({
        status: "COMPLETED",
        mock: order.mock,
        key: order.licenceKey,
      });
    }

    if (!paypalOn) {
      const key = await fulfillOrder(order);
      emit({
        type: "payment",
        action: "Payment captured",
        company: order.description,
        reason: "Demo mode",
        mock: true,
      });
      return res.json({ status: "COMPLETED", mock: true, key });
    }

    const d = await captureOrder(orderId);
    if (d.status === "COMPLETED") {
      const capture = d.purchase_units?.[0]?.payments?.captures?.[0];
      const capturedAmount = Number(capture?.amount?.value);
      if (
        !Number.isFinite(capturedAmount) ||
        capturedAmount !== Number(order.amount.toFixed(2)) ||
        capture?.amount?.currency_code !== order.currency
      ) {
        throw new Error(
          "Captured amount did not match the stored order amount",
        );
      }
      const key = await fulfillOrder(order);
      emit({
        type: "payment",
        action: "Payment captured",
        company: order.description,
        reason: "PayPal sandbox",
      });
      res.json({ status: "COMPLETED", mock: false, key });
    } else {
      res.json({ status: d.status, key: null });
    }
  }),
);

// ── Invoices ─────────────────────────────────────────────────────────────────

const invoiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().finite().positive(),
  email: z.string().email(),
  customerId: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

app.post(
  "/api/invoices",
  wrap(async (req, res) => {
    const { name, amount, email, customerId, note } = invoiceSchema.parse(
      req.body,
    );
    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId } })
      : { id: null, company: name, billingEmail: email };

    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const inv = await makeInvoice({
      customer,
      amount,
      note: note || `Invoice for ${name}`,
    });
    emit({
      type: "invoice",
      action: "Invoice sent",
      company: name,
      amount,
      invoiceId: inv.id,
      mock: inv.mock,
    });
    res.json(inv);
  }),
);

// ── Subscriptions ─────────────────────────────────────────────────────────────

app.post(
  "/api/subscriptions",
  wrap(async (req, res) => {
    const { customerId } = z
      .object({
        customerId: z.number().int().positive(),
      })
      .parse(req.body);
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.autoRenewRequested) {
      return res
        .status(409)
        .json({ error: "Customer has not opted into automatic renewal." });
    }
    const policyConfig = await getPolicyConfig();
    const expectedAmount = calcRenewalAmount(
      customer.value,
      policyConfig.renewalPct,
    );
    const amount = expectedAmount;
    const policyVerdict = runPolicyChecks(customer, amount, policyConfig);
    if (!policyVerdict.passed) {
      return res
        .status(409)
        .json({ error: "Subscription blocked by policy.", policyVerdict });
    }

    if (!paypalOn) {
      const mockSubId =
        "SUB-DEMO-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      await prisma.subscription.create({
        data: {
          paypalSubscriptionId: mockSubId,
          customerId,
          amount,
          status: "PENDING",
          mock: true,
        },
      });
      emit({
        type: "subscription",
        action: "Subscription setup simulated",
        company: customer.company,
        amount,
        mock: true,
      });
      return res.json({ id: mockSubId, approvalUrl: null, amount, mock: true });
    }

    const subscription = await makeSubscription({ customer, amount });
    emit({
      type: "subscription",
      action: "Subscription approval link created",
      company: customer.company,
      amount,
      approvalUrl: subscription.approvalUrl,
      mock: false,
    });
    res.json(subscription);
  }),
);

// ── AI Explain ───────────────────────────────────────────────────────────────

app.post(
  "/api/explain",
  wrap(async (req, res) => {
    const { product, devs, audience, route, sandboxTestAmount } = z
      .object({
        product: z.string().min(1).max(120),
        devs: z.number().int().positive().max(1000),
        audience: z.enum(["internal", "external"]),
        route: z.enum(["free", "online", "sales"]),
        sandboxTestAmount: z.literal(1),
      })
      .parse(req.body);
    if (!AK) {
      const fallback =
        route === "sales"
          ? `${product} for ${devs} developer(s) requires a vendor quote. ${audience === "external" ? "Customer-facing apps are priced by the vendor." : "Teams over 10 developers are quoted by sales."} See the vendor's pricing configurator for current pricing.`
          : `${product} for ${devs} developer(s) can use the internal-app online checkout route. The $${sandboxTestAmount.toFixed(2)} charge is sandbox test money only, not a licence price. Final pricing is set by the vendor.`;
      return res.json({ text: fallback, ai: false });
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: AK });
    const r = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      system:
        "You explain software licence routing to a busy manager in 3 short sentences, plain words. Every front-end developer needs a licence; online purchase only for 1-10 developers on internal apps; customer-facing apps or more than 10 developers go through vendor sales. Never invent or state a vendor price. Explicitly say the $1.00 charge is sandbox test money only and not a licence price.",
      messages: [
        {
          role: "user",
          content: `Product: ${product}. Developers: ${devs}. Audience: ${audience}. Route: ${route}. Sandbox test amount: $${sandboxTestAmount}.`,
        },
      ],
    });
    const text = r.content.map((c) => c.text || "").join("");
    res.json({ text, ai: true });
  }),
);

// ── Vendor AI Q&A ────────────────────────────────────────────────────────────

app.post(
  "/api/ask",
  wrap(async (req, res) => {
    const { question } = z
      .object({ question: z.string().max(500).default("") })
      .parse(req.body);
    const q = question.toLowerCase().trim();
    const [
      customerCount,
      leakCount,
      renewalCount,
      unpaidCount,
      unpaidAgg,
      sampleLeaks,
      sampleRenewals,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({
        where: { devsDetected: { gt: prisma.customer.fields.seats } },
      }),
      prisma.customer.count({ where: { renewalInDays: { gte: 0, lte: 30 } } }),
      prisma.customer.count({ where: { paid: false } }),
      prisma.customer.aggregate({
        where: { paid: false },
        _sum: { balanceDue: true },
      }),
      prisma.customer.findMany({
        where: { devsDetected: { gt: prisma.customer.fields.seats } },
        orderBy: { renewalInDays: "asc" },
        take: 5,
        select: { company: true },
      }),
      prisma.customer.findMany({
        where: { renewalInDays: { gte: 0, lte: 30 } },
        orderBy: { renewalInDays: "asc" },
        take: 5,
        select: { company: true, renewalInDays: true },
      }),
    ]);

    const ctx = {
      customers: customerCount,
      usingMoreSeatsThanPaid: leakCount,
      renewalsNext30Days: renewalCount,
      unpaidCount,
      unpaidValue: unpaidAgg._sum.balanceDue || 0,
      sampleLeaks: sampleLeaks.map((customer) => customer.company),
      sampleRenewals: sampleRenewals.map(
        (customer) => `${customer.company} in ${customer.renewalInDays} days`,
      ),
    };

    if (!AK) {
      let a = `${ctx.customers} customers total. ${ctx.usingMoreSeatsThanPaid} over their seats. ${ctx.renewalsNext30Days} renewals in 30 days. ${ctx.unpaidCount} unpaid ($${ctx.unpaidValue.toLocaleString()}).`;
      if (/renew|due|soon|30/.test(q))
        a = `${ctx.renewalsNext30Days} renewals due in 30 days:\n${ctx.sampleRenewals.join("\n")}`;
      else if (/unpaid|balance|owe/.test(q))
        a = `${ctx.unpaidCount} customers have unpaid balances. Total: $${ctx.unpaidValue.toLocaleString()}`;
      else if (/seat|leak|more|licen/.test(q))
        a = `${ctx.usingMoreSeatsThanPaid} customers use more devs than paid seats:\n${ctx.sampleLeaks.join(", ")}`;
      return res.json({ answer: a, ai: false });
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: AK });
    const r = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      system: `You are a helpful licence analytics assistant for a software vendor. Answer questions about their customer data concisely (2-4 sentences max). Today's context: ${JSON.stringify(ctx)}`,
      messages: [{ role: "user", content: q || "Give me a summary" }],
    });
    res.json({ answer: r.content.map((c) => c.text || "").join(""), ai: true });
  }),
);

// ── Log (from DB now) ─────────────────────────────────────────────────────────

app.get(
  "/api/log",
  wrap(async (_q, res) => {
    const decisions = await prisma.agentDecision.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { customer: { select: { company: true, region: true } } },
    });
    const events = await prisma.paymentEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const formatted = [
      ...decisions.map((d) => ({
        time: d.createdAt.toISOString(),
        type: "autopilot",
        company: d.customer?.company ?? "Unknown",
        action: d.action,
        amount: JSON.parse(d.inputs)?.amount,
        reason:
          d.action === "Invoice sent"
            ? JSON.parse(d.policyVerdict)?.checks?.find(
                (c) => c.rule === "within_auto_limit",
              )?.reason
            : d.aiReasoning ||
              JSON.parse(d.policyVerdict)?.checks?.find((c) => !c.pass)?.reason,
        invoiceId: d.result,
        approvalUrl: d.approvalUrl,
        mock: d.mock,
        dryRun: d.dryRun,
      })),
      ...events.map((e) => ({
        time: e.createdAt.toISOString(),
        type: "webhook",
        action: e.eventType,
        company: e.resourceId,
        reason: e.summary,
      })),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 60);
    res.json(formatted);
  }),
);

// ── Customers (paginated) ─────────────────────────────────────────────────────

app.get(
  "/api/customers",
  wrap(async (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
        q: z.string().max(100).default(""),
      })
      .parse(req.query);
    const { page, pageSize, q: search } = query;

    const where = search
      ? {
          OR: [
            { company: { contains: search } },
            { region: { contains: search } },
            { plan: { contains: search } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { renewalInDays: "asc" },
      }),
    ]);

    res.json({ total, page, pageSize, rows });
  }),
);

app.get(
  "/api/customers/:id",
  wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        licences: { orderBy: { createdAt: "desc" }, take: 5 },
        orders: { orderBy: { createdAt: "desc" }, take: 10 },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 10 },
        agentDecisions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  }),
);

app.patch(
  "/api/customers/:id/auto-renew",
  wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { requested } = z.object({ requested: z.boolean() }).parse(req.body);
    const result = await prisma.customer.updateMany({
      where: { id },
      data: { autoRenewRequested: requested },
    });
    if (result.count === 0)
      return res.status(404).json({ error: "Customer not found" });
    res.json({ id, autoRenewRequested: requested });
  }),
);

app.get(
  "/api/pipeline",
  wrap(async (_req, res) => {
    const policyConfig = await getPolicyConfig();
    const customers = await prisma.customer.findMany({
      where: { renewalInDays: { lte: 30 } },
      take: 200,
      orderBy: { renewalInDays: "asc" },
      include: {
        invoices: { orderBy: { createdAt: "desc" }, take: 1 },
        agentDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const rows = customers.map((customer) => {
      const invoice = customer.invoices[0];
      const decision = customer.agentDecisions[0];
      const recentSubscriptionPayment =
        customer.subscriptions[0]?.lastPaymentAt &&
        Date.now() -
          new Date(customer.subscriptions[0].lastPaymentAt).getTime() <
          365 * 24 * 60 * 60 * 1000;
      const status =
        invoice?.status === "PAID" || recentSubscriptionPayment
          ? "paid"
          : invoice && ["SENT", "OVERDUE"].includes(invoice.status)
            ? "invoiced"
            : decision &&
                ["Held", "Escalated", "Skipped"].includes(decision.action)
              ? "held"
              : "due";
      return {
        id: customer.id,
        company: customer.company,
        renewalInDays: customer.renewalInDays,
        estimatedAmount: calcRenewalAmount(
          customer.value,
          policyConfig.renewalPct,
        ),
        status,
      };
    });
    res.json(rows);
  }),
);

app.get(
  "/api/analytics",
  wrap(async (_req, res) => {
    const grouped = await prisma.customer.groupBy({
      by: ["region", "paid"],
      _sum: { value: true, balanceDue: true },
      orderBy: { region: "asc" },
    });
    res.json(
      grouped.map((entry) => ({
        region: entry.region,
        paid: entry.paid,
        value: entry.paid ? entry._sum.value || 0 : entry._sum.balanceDue || 0,
      })),
    );
  }),
);

app.get(
  "/api/licences",
  wrap(async (_req, res) => {
    const licences = await prisma.licence.findMany({
      select: { product: true, seats: true, validUntil: true },
      orderBy: { validUntil: "desc" },
    });
    res.json(licences);
  }),
);

// ── Policies ──────────────────────────────────────────────────────────────────

app.get(
  "/api/policies",
  wrap(async (_q, res) => {
    const policies = await prisma.policy.findMany();
    res.json(policies);
  }),
);

app.patch(
  "/api/policies/:key",
  wrap(async (req, res) => {
    const key = z
      .enum([
        "auto_invoice_limit",
        "renewal_pct",
        "renewal_window_days",
        "max_devs_online",
        "excluded_regions",
      ])
      .parse(req.params.key);
    const { value } = z.object({ value: z.string().max(1000) }).parse(req.body);
    let normalizedValue = value;
    if (key === "excluded_regions") {
      let parsedRegions;
      try {
        parsedRegions = JSON.parse(value);
      } catch {
        return res
          .status(400)
          .json({ error: "Excluded regions must be a JSON array of strings" });
      }
      const regions = z
        .array(z.string().trim().min(1).max(80))
        .parse(parsedRegions);
      normalizedValue = JSON.stringify(regions);
    } else {
      const number = z.coerce.number().finite().parse(value);
      const constraints = {
        auto_invoice_limit: z.number().min(0).max(1_000_000),
        renewal_pct: z.number().positive().max(100),
        renewal_window_days: z.number().int().positive().max(365),
        max_devs_online: z.number().int().positive().max(1000),
      };
      normalizedValue = String(constraints[key].parse(number));
    }
    const exists = await prisma.policy.findUnique({ where: { key } });
    if (!exists) return res.status(404).json({ error: "Policy not found" });
    const updated = await prisma.policy.update({
      where: { key },
      data: { value: normalizedValue },
    });
    res.json(updated);
  }),
);

// ── Webhooks ─────────────────────────────────────────────────────────────────

app.post("/api/webhooks/paypal", async (req, res) => {
  if (!Buffer.isBuffer(req.body))
    return res.status(400).json({ error: "Expected raw webhook body" });
  const rawBody = req.body.toString("utf8");
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // Signature verification
  let valid;
  try {
    valid = await verifyWebhookSignature({ headers: req.headers, rawBody });
  } catch (error) {
    console.error(
      "PayPal webhook verification unavailable:",
      error.name || "Error",
    );
    return res.status(503).json({
      error: "Webhook verification unavailable; event not processed.",
    });
  }
  if (!valid) {
    console.warn("Webhook signature verification FAILED");
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const paypalEventId = event.id;
  if (!paypalEventId)
    return res.status(400).json({ error: "Missing event ID" });

  try {
    const result = await processPayPalEvent(prisma, {
      ...event,
      id: paypalEventId,
    });
    if (!result.duplicate) emit(result.event);
    res.status(200).json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("PayPal webhook processing failed:", error.name || "Error");
    res.status(500).json({
      error: "Webhook processing failed; PayPal may retry this event.",
    });
  }
});

// ── Autopilot ─────────────────────────────────────────────────────────────────

app.post(
  "/api/autopilot/run",
  wrap(async (req, res) => {
    const { dryRun, runAll } = z
      .object({
        dryRun: z.boolean().default(false),
        runAll: z.boolean().default(false),
      })
      .parse(req.body);
    const policyConfig = await getPolicyConfig();

    const runId = crypto.randomBytes(6).toString("hex");

    // Find customers with renewals due
    const pool = await prisma.customer.findMany({
      where: {
        renewalInDays: { gte: 0, lte: policyConfig.renewalWindowDays },
        invoices: { none: { status: { in: ["SENT", "OVERDUE"] } } },
      },
      take: runAll ? 50 : 5,
      orderBy: { renewalInDays: "asc" },
    });

    let processed = 0;
    for (const customer of pool) {
      const result = await runAgentForCustomer(
        customer,
        policyConfig,
        (params) => makeInvoice(params),
        dryRun,
        (params) => makeSubscription(params),
      );

      await prisma.agentDecision.create({
        data: {
          customerId: customer.id,
          runId,
          dryRun,
          inputs: JSON.stringify({
            customer: {
              id: customer.id,
              company: customer.company,
              region: customer.region,
              plan: customer.plan,
              seats: customer.seats,
              devsDetected: customer.devsDetected,
              renewalInDays: customer.renewalInDays,
              paid: customer.paid,
              autoRenewRequested: customer.autoRenewRequested,
              value: customer.value,
            },
            amount: result.amount,
          }),
          aiReasoning: result.aiReasoning || null,
          policyVerdict: JSON.stringify(result.policyVerdict),
          action: result.action,
          result: result.invoiceId || null,
          approvalUrl: result.approvalUrl || null,
          mock: result.mock,
        },
      });

      emit({
        type: "autopilot",
        company: customer.company,
        action: result.action,
        amount: result.amount,
        reason: result.reason,
        invoiceId: result.invoiceId,
        approvalUrl: result.approvalUrl,
        mock: result.mock,
        dryRun,
      });

      processed++;
    }

    res.json({ processed, runId, dryRun });
  }),
);

app.post(
  "/api/autopilot/reset",
  wrap(async (_q, res) => {
    await prisma.agentDecision.deleteMany();
    res.json({ ok: true });
  }),
);

// ── Stats for dashboard ───────────────────────────────────────────────────────

app.get(
  "/api/stats",
  wrap(async (_q, res) => {
    const [total, leakCount, soonCount, unpaidAgg] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({
        where: { devsDetected: { gt: prisma.customer.fields.seats } },
      }),
      prisma.customer.count({ where: { renewalInDays: { gte: 0, lte: 30 } } }),
      prisma.customer.aggregate({
        where: { paid: false },
        _sum: { balanceDue: true },
      }),
    ]);
    res.json({
      total,
      leakCount,
      soonCount,
      unpaid: unpaidAgg._sum.balanceDue || 0,
    });
  }),
);

// ── Seed / Reset demo ─────────────────────────────────────────────────────────

app.post(
  "/api/demo/reset",
  wrap(async (_q, res) => {
    if (!demoMode) {
      return res.status(403).json({
        error:
          "Reset is available only in demo mode; sandbox records are preserved.",
      });
    }
    await prisma.agentDecision.deleteMany({
      where: { OR: [{ dryRun: true }, { mock: true }] },
    });
    await prisma.invoice.deleteMany({ where: { mock: true } });
    await prisma.order.deleteMany({ where: { mock: true } });
    await prisma.subscription.deleteMany({ where: { mock: true } });
    emit({
      type: "system",
      action: "Demo reset",
      reason: "Database cleared for a fresh demo.",
    });
    res.json({
      ok: true,
      message:
        "Demo activity cleared. Seeded sample customers and policies are unchanged.",
    });
  }),
);

app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found" }),
);
app.use(express.static(distPath));
app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));

// ─── Scheduler (node-cron) ────────────────────────────────────────────────────

// Run autopilot daily at 09:00 UTC
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] Running scheduled autopilot…");
  try {
    const policyConfig = await getPolicyConfig();
    const pool = await prisma.customer.findMany({
      where: { renewalInDays: { gte: 0, lte: policyConfig.renewalWindowDays } },
      take: 50,
      orderBy: { renewalInDays: "asc" },
    });
    const runId = "cron-" + new Date().toISOString().split("T")[0];
    for (const customer of pool) {
      const result = await runAgentForCustomer(
        customer,
        policyConfig,
        (params) => makeInvoice(params),
        false,
        (params) => makeSubscription(params),
      );
      await prisma.agentDecision.create({
        data: {
          customerId: customer.id,
          runId,
          dryRun: false,
          inputs: JSON.stringify({
            customer: {
              id: customer.id,
              paid: customer.paid,
              autoRenewRequested: customer.autoRenewRequested,
              seats: customer.seats,
              devsDetected: customer.devsDetected,
              region: customer.region,
            },
            amount: result.amount,
          }),
          aiReasoning: result.aiReasoning || null,
          policyVerdict: JSON.stringify(result.policyVerdict),
          action: result.action,
          result: result.invoiceId || null,
          approvalUrl: result.approvalUrl || null,
          mock: result.mock,
        },
      });
      emit({
        type: "autopilot",
        company: customer.company,
        action: result.action,
        amount: result.amount,
        reason: result.reason,
        invoiceId: result.invoiceId,
        approvalUrl: result.approvalUrl,
      });
    }
    console.log(`[Cron] Processed ${pool.length} renewals.`);
  } catch (e) {
    console.error("[Cron] Error:", e.message);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🚀 LicensePilot API → http://127.0.0.1:${PORT}`);
  console.log(
    `   PayPal: ${paypalOn ? "✅ sandbox mode" : "⚠️  demo mode (no credentials)"}`,
  );
  console.log(
    `   AI:     ${AK ? "✅ Anthropic " + AI_MODEL : "⚠️  rules-only fallback"}`,
  );
  console.log(
    `   DB:     ${/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || "") ? "PostgreSQL" : "SQLite"} via Prisma\n`,
  );
});

export default app;
