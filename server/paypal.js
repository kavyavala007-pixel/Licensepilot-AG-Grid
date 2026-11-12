// server/paypal.js — PayPal Sandbox API helpers with real signature verification
const PP = "https://api-m.sandbox.paypal.com";
const {
  PAYPAL_CLIENT_ID: CID,
  PAYPAL_CLIENT_SECRET: SEC,
  PAYPAL_WEBHOOK_ID,
} = process.env;

export const paypalOn = Boolean(CID && SEC);
export const paypalWebhookConfigured = Boolean(PAYPAL_WEBHOOK_ID);

/** Get a fresh PayPal access token */
export async function ppToken() {
  const r = await fetch(PP + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${CID}:${SEC}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok)
    throw new Error(
      "PayPal auth failed. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  return (await r.json()).access_token;
}

/** Create a PayPal order (Checkout) */
export async function createOrder({ amount, description }) {
  const r = await fetch(PP + "/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (await ppToken()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          description,
          amount: { currency_code: "USD", value: Number(amount).toFixed(2) },
        },
      ],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || "Could not create PayPal order");
  return d;
}

/** Capture a PayPal order */
export async function captureOrder(orderId) {
  const r = await fetch(`${PP}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (await ppToken()),
      "Content-Type": "application/json",
    },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || "Capture failed");
  return d;
}

/** Create and send a PayPal invoice */
export async function createAndSendInvoice({ name, amount, email, note }) {
  const h = {
    Authorization: "Bearer " + (await ppToken()),
    "Content-Type": "application/json",
  };

  // Create invoice
  const c = await fetch(PP + "/v2/invoicing/invoices", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      detail: {
        currency_code: "USD",
        note,
        invoice_date: new Date().toISOString().split("T")[0],
      },
      primary_recipients: [{ billing_info: { email_address: email } }],
      items: [
        {
          name,
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: Number(amount).toFixed(2),
          },
        },
      ],
    }),
  });
  const cd = await c.json();
  if (!c.ok) throw new Error(cd.message || "Could not create PayPal invoice");

  // Extract invoice ID from href
  const invoiceId = cd.id || cd.href?.split("/").pop();
  if (!invoiceId) throw new Error("PayPal did not return an invoice ID");

  // Send invoice
  const send = await fetch(`${PP}/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ send_to_recipient: true }),
  });
  if (!send.ok) {
    const error = await send.json().catch(() => ({}));
    throw new Error(error.message || "Could not send PayPal invoice");
  }

  return { id: invoiceId };
}

/** Get invoice details */
export async function getInvoice(invoiceId) {
  const r = await fetch(`${PP}/v2/invoicing/invoices/${invoiceId}`, {
    headers: { Authorization: "Bearer " + (await ppToken()) },
  });
  if (!r.ok) return null;
  return r.json();
}

/** Create a Subscription Plan */
export async function createSubscriptionPlan({
  productName,
  amount,
  description,
}) {
  const token = await ppToken();
  const h = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  // 1. Create a PayPal product
  const pr = await fetch(PP + "/v1/catalogs/products", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      name: productName,
      description,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });
  const pd = await pr.json();
  if (!pr.ok) throw new Error(pd.message || "Could not create PayPal product");

  // 2. Create a billing plan (annual)
  const planR = await fetch(PP + "/v1/billing/plans", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      product_id: pd.id,
      name: `${productName} Annual Renewal`,
      description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "YEAR", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: Number(amount).toFixed(2),
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: "0", currency_code: "USD" },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });
  const planD = await planR.json();
  if (!planR.ok)
    throw new Error(planD.message || "Could not create subscription plan");

  return planD;
}

/** Create a subscription (returns approval URL) */
export async function createSubscription({
  planId,
  customerEmail,
  companyName,
}) {
  const token = await ppToken();
  const r = await fetch(PP + "/v1/billing/subscriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      subscriber: {
        email_address: customerEmail,
        name: { given_name: companyName },
      },
      application_context: {
        brand_name: "LicensePilot",
        return_url: `${process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://127.0.0.1:5173"}/subscription-success`,
        cancel_url: `${process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://127.0.0.1:5173"}/subscription-cancel`,
      },
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || "Could not create subscription");
  const approvalUrl = d.links?.find((l) => l.rel === "approve")?.href;
  return { id: d.id, approvalUrl };
}

/**
 * Verify a PayPal webhook signature using PayPal's verify-webhook-signature API.
 * Returns true if signature is valid.
 * @see https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
 */
export async function verifyWebhookSignature({ headers, rawBody }) {
  if (!paypalOn || !PAYPAL_WEBHOOK_ID) return false;

  const signatureHeaders = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
  };
  if (Object.values(signatureHeaders).some((value) => !value)) return false;

  const token = await ppToken();
  const r = await fetch(PP + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...signatureHeaders,
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!r.ok) throw new Error("PayPal webhook verification request failed");
  const d = await r.json();
  if (
    d.verification_status !== "SUCCESS" &&
    d.verification_status !== "FAILURE"
  ) {
    throw new Error(
      "PayPal returned an unrecognized webhook verification status",
    );
  }
  return d.verification_status === "SUCCESS";
}
