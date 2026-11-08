import { describe, expect, it, vi } from "vitest";
import { processPayPalEvent } from "../server/webhooks.js";

function createPrismaStub() {
  const events = new Map();
  const tx = {
    paymentEvent: {
      findUnique: vi.fn(
        async ({ where }) => events.get(where.paypalEventId) || null,
      ),
      create: vi.fn(async ({ data }) => {
        events.set(data.paypalEventId, data);
        return data;
      }),
      update: vi.fn(async ({ where, data }) => {
        const event = { ...events.get(where.paypalEventId), ...data };
        events.set(where.paypalEventId, event);
        return event;
      }),
    },
    order: {
      findUnique: vi.fn(async () => ({
        id: 8,
        description: "Enterprise licence order",
      })),
      update: vi.fn(async () => undefined),
    },
    invoice: {
      findUnique: vi.fn(async () => ({
        id: 11,
        customerId: 4,
        description: "Annual renewal",
      })),
      update: vi.fn(async () => undefined),
      count: vi.fn(async () => 0),
    },
    customer: { update: vi.fn(async () => undefined) },
    subscription: { updateMany: vi.fn(async () => undefined) },
  };
  return { $transaction: (fn) => fn(tx), tx };
}

describe("PayPal webhook event processing", () => {
  it("stores, applies, and deduplicates a completed checkout event", async () => {
    const prisma = createPrismaStub();
    const event = {
      id: "evt-checkout-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "capture-1",
        supplementary_data: { related_ids: { order_id: "ORDER-1" } },
      },
    };

    const first = await processPayPalEvent(prisma, event);
    const duplicate = await processPayPalEvent(prisma, event);

    expect(first.duplicate).toBe(false);
    expect(first.event.action).toBe("PAYMENT.CAPTURE.COMPLETED");
    expect(prisma.tx.order.update).toHaveBeenCalledOnce();
    expect(prisma.tx.paymentEvent.create).toHaveBeenCalledOnce();
    expect(duplicate.duplicate).toBe(true);
  });

  it("marks the related subscription active only after PayPal activates it", async () => {
    const prisma = createPrismaStub();
    await processPayPalEvent(prisma, {
      id: "evt-sub-1",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: { id: "I-SUBSCRIPTION-1" },
    });

    expect(prisma.tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { paypalSubscriptionId: "I-SUBSCRIPTION-1" },
      data: { status: "ACTIVE" },
    });
  });

  it("marks a paid invoice and restores the account only after all open invoices are paid", async () => {
    const prisma = createPrismaStub();
    const result = await processPayPalEvent(prisma, {
      id: "evt-invoice-1",
      event_type: "INVOICING.INVOICE.PAID",
      resource: { id: "INV-1" },
    });

    expect(result.duplicate).toBe(false);
    expect(prisma.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 11 },
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
    expect(prisma.tx.customer.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { paid: true, balanceDue: 0 },
    });
  });

  it("records a successful recurring payment timestamp", async () => {
    const prisma = createPrismaStub();
    await processPayPalEvent(prisma, {
      id: "evt-sale-1",
      event_type: "PAYMENT.SALE.COMPLETED",
      resource: { billing_agreement_id: "I-SUBSCRIPTION-1" },
    });

    expect(prisma.tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { paypalSubscriptionId: "I-SUBSCRIPTION-1" },
      data: { status: "ACTIVE", lastPaymentAt: expect.any(Date) },
    });
  });
});
