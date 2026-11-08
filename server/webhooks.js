const subscriptionStatuses = {
  "BILLING.SUBSCRIPTION.ACTIVATED": "ACTIVE",
  "BILLING.SUBSCRIPTION.CANCELLED": "CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED": "EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "PAYMENT_FAILED",
  "BILLING.SUBSCRIPTION.RENEWED": "ACTIVE",
  "BILLING.SUBSCRIPTION.SUSPENDED": "SUSPENDED",
};

export async function processPayPalEvent(prisma, event) {
  const { event_type: eventType, resource = {} } = event;
  const subscriptionId =
    resource.id ||
    resource.billing_agreement_id ||
    resource.supplementary_data?.related_ids?.billing_agreement_id;
  const invoiceId = resource.id;
  const orderId = resource.supplementary_data?.related_ids?.order_id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.paymentEvent.findUnique({
        where: { paypalEventId: event.id },
      });
      if (previous?.processed)
        return { duplicate: true, company: previous.resourceId };

      if (!previous) {
        await tx.paymentEvent.create({
          data: {
            paypalEventId: event.id,
            eventType,
            resourceId: resource.id || null,
            resourceType: event.resource_type || null,
            summary: event.summary || null,
            rawPayload: JSON.stringify(event),
            processed: false,
          },
        });
      }

      let company = resource.id || "PayPal event";
      if (eventType === "PAYMENT.CAPTURE.COMPLETED" && orderId) {
        const order = await tx.order.findUnique({
          where: { paypalOrderId: orderId },
        });
        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: "COMPLETED" },
          });
          company = order.description || orderId;
        }
      } else if (eventType === "INVOICING.INVOICE.PAID") {
        const invoice = await tx.invoice.findUnique({
          where: { paypalInvoiceId: invoiceId },
        });
        if (invoice) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: "PAID", paidAt: new Date() },
          });
          if (invoice.customerId) {
            const openInvoices = await tx.invoice.count({
              where: {
                customerId: invoice.customerId,
                status: { in: ["SENT", "OVERDUE"] },
              },
            });
            if (openInvoices === 0) {
              await tx.customer.update({
                where: { id: invoice.customerId },
                data: { paid: true, balanceDue: 0 },
              });
            }
          }
          company = invoice.description || invoiceId;
        }
      } else if (subscriptionStatuses[eventType]) {
        await tx.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            status: subscriptionStatuses[eventType],
            ...(eventType === "BILLING.SUBSCRIPTION.RENEWED"
              ? { lastPaymentAt: new Date() }
              : {}),
          },
        });
      } else if (eventType === "PAYMENT.SALE.COMPLETED" && subscriptionId) {
        await tx.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: { status: "ACTIVE", lastPaymentAt: new Date() },
        });
      }

      await tx.paymentEvent.update({
        where: { paypalEventId: event.id },
        data: { processed: true },
      });
      return { duplicate: false, company };
    });

    return {
      ...result,
      event: {
        type: "webhook",
        action: eventType,
        company: result.company,
        reason: event.summary || `${eventType} received from PayPal.`,
      },
    };
  } catch (error) {
    if (error.code === "P2002") {
      return { duplicate: true, company: resource.id };
    }
    throw error;
  }
}
