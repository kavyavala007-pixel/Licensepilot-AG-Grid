import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function mockFetch(responses) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      const response = responses.shift();
      const status = response.status || 200;
      return new Response(
        status === 204 ? null : JSON.stringify(response.body),
        { status },
      );
    }),
  );
}

async function loadPayPal() {
  vi.stubEnv("PAYPAL_CLIENT_ID", "sandbox-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "sandbox-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "sandbox-webhook");
  vi.resetModules();
  return import("../server/paypal.js");
}

describe("PayPal sandbox API helpers", () => {
  it("creates a sandbox order for the requested test amount", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { body: { id: "ORDER-123", status: "CREATED" } },
    ]);
    const { createOrder } = await loadPayPal();

    await expect(
      createOrder({ amount: 1, description: "Sandbox test" }),
    ).resolves.toMatchObject({ id: "ORDER-123" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
    );
    expect(
      JSON.parse(fetch.mock.calls[1][1].body).purchase_units[0].amount,
    ).toEqual({ currency_code: "USD", value: "1.00" });
  });

  it("captures an order using the sandbox API", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { body: { id: "ORDER-123", status: "COMPLETED" } },
    ]);
    const { captureOrder } = await loadPayPal();

    await expect(captureOrder("ORDER-123")).resolves.toMatchObject({
      status: "COMPLETED",
    });
    expect(fetch.mock.calls[1][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-123/capture",
    );
  });

  it("creates and sends an invoice, returning the PayPal invoice ID", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { body: { id: "INV-123" } },
      { status: 204, body: {} },
    ]);
    const { createAndSendInvoice } = await loadPayPal();

    await expect(
      createAndSendInvoice({
        name: "Annual renewal",
        amount: 30,
        email: "billing@example.test",
        note: "Renewal estimate",
      }),
    ).resolves.toEqual({ id: "INV-123" });
    expect(fetch.mock.calls[2][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV-123/send",
    );
  });

  it("creates an annual subscription plan and returns the buyer approval URL", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { body: { id: "PROD-123" } },
      { body: { id: "PLAN-123" } },
      { body: { access_token: "test-token" } },
      {
        body: {
          id: "SUB-123",
          links: [{ rel: "approve", href: "https://sandbox.example/approve" }],
        },
      },
    ]);
    const { createSubscriptionPlan, createSubscription } = await loadPayPal();
    const plan = await createSubscriptionPlan({
      productName: "Annual renewal",
      amount: 30,
      description: "Annual licence renewal",
    });

    expect(plan.id).toBe("PLAN-123");
    const subscription = await createSubscription({
      planId: plan.id,
      customerEmail: "buyer@example.test",
      companyName: "Example Systems",
    });
    expect(subscription).toEqual({
      id: "SUB-123",
      approvalUrl: "https://sandbox.example/approve",
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls[2][0]).toBe(
      "https://api-m.sandbox.paypal.com/v1/billing/plans",
    );
    expect(fetch.mock.calls[4][0]).toBe(
      "https://api-m.sandbox.paypal.com/v1/billing/subscriptions",
    );
  });
});

describe("Webhook signature verification", () => {
  it("rejects a webhook when the signature headers are missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { verifyWebhookSignature } = await loadPayPal();
    await expect(
      verifyWebhookSignature({ headers: {}, rawBody: "{}" }),
    ).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a bad signature reported by PayPal's verification API", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { body: { verification_status: "FAILURE" } },
    ]);
    const { verifyWebhookSignature } = await loadPayPal();
    const headers = {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/cert",
      "paypal-transmission-id": "transmission-id",
      "paypal-transmission-sig": "invalid-signature",
      "paypal-transmission-time": new Date().toISOString(),
    };

    await expect(
      verifyWebhookSignature({ headers, rawBody: '{"id":"evt-test"}' }),
    ).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("propagates an unavailable verifier instead of treating it as a valid request", async () => {
    mockFetch([
      { body: { access_token: "test-token" } },
      { status: 503, body: { message: "temporarily unavailable" } },
    ]);
    const { verifyWebhookSignature } = await loadPayPal();
    const headers = {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/cert",
      "paypal-transmission-id": "transmission-id",
      "paypal-transmission-sig": "signature",
      "paypal-transmission-time": new Date().toISOString(),
    };

    await expect(
      verifyWebhookSignature({ headers, rawBody: '{"id":"evt-test"}' }),
    ).rejects.toThrow("PayPal webhook verification request failed");
  });
});
