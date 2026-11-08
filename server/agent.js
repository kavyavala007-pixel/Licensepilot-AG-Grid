// server/agent.js — Anthropic tool-calling agent for LicensePilot autopilot
import Anthropic from "@anthropic-ai/sdk";
import { runPolicyChecks, calcRenewalAmount } from "./policy.js";

const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

/** @type {Anthropic | null} */
let anthropic = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic)
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

// ─── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_customer",
    description:
      "Get a summary of a customer's licence status, seat usage, and renewal info.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number", description: "The customer database ID" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "get_usage",
    description:
      "Read the customer's detected developer usage and compare it with paid seats.",
    input_schema: {
      type: "object",
      properties: { customerId: { type: "number" } },
      required: ["customerId"],
    },
  },
  {
    name: "check_policy",
    description:
      "Run the hard-gate policy engine for a customer and amount. Returns whether the action is permitted.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        amount: { type: "number", description: "Renewal amount in USD" },
      },
      required: ["customerId", "amount"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Create and send a PayPal invoice for a customer renewal. Only call this if check_policy passes.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        amount: { type: "number" },
        note: { type: "string" },
      },
      required: ["customerId", "amount"],
    },
  },
  {
    name: "create_subscription_link",
    description:
      "Create a PayPal annual renewal subscription approval link. The customer must approve it before recurring payments start.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        amount: { type: "number" },
      },
      required: ["customerId", "amount"],
    },
  },
  {
    name: "hold_for_human",
    description:
      "Flag this renewal for human review without sending an invoice.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        reason: {
          type: "string",
          description: "Concise reason (max 20 words)",
        },
      },
      required: ["customerId", "reason"],
    },
  },
  {
    name: "escalate_to_sales",
    description:
      "Escalate a customer to the sales team (unpaid balance or seat gap).",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "number" },
        reason: { type: "string" },
      },
      required: ["customerId", "reason"],
    },
  },
];

/**
 * Run the AI agent for a single customer.
 * Returns decision details regardless of whether AI is available.
 *
 * @param {object} customer
 * @param {object} policyConfig
 * @param {function} makeInvoiceFn   - async (params) => { id, mock }
 * @param {boolean} dryRun
 * @returns {Promise<{ action, reason, invoiceId, mock, aiReasoning, policyVerdict }>}
 */
export async function runAgentForCustomer(
  customer,
  policyConfig,
  makeInvoiceFn,
  dryRun = false,
  createSubscriptionFn,
) {
  const amount = calcRenewalAmount(customer.value, policyConfig.renewalPct);
  const policyVerdict = runPolicyChecks(customer, amount, policyConfig);

  // If policy blocks it, the AI never gets a chance
  if (!policyVerdict.passed) {
    const failedCheck = policyVerdict.checks.find((c) => !c.pass);
    return {
      action: policyVerdict.action === "skip" ? "Skipped" : "Held",
      reason: failedCheck?.reason || "Policy blocked.",
      invoiceId: null,
      mock: false,
      aiReasoning: null,
      policyVerdict,
      amount,
    };
  }

  const client = getClient();

  // Fallback: rules-only mode
  if (!client) {
    const inv = dryRun ? null : await makeInvoiceFn({ customer, amount });
    return {
      action: dryRun ? "Dry run — Invoice would be sent" : "Invoice sent",
      reason: `Within auto limit ($${amount} ≤ $${policyConfig.autoInvoiceLimit}). Rules-only mode (no AI key).`,
      invoiceId: inv?.id ?? null,
      mock: inv?.mock ?? false,
      aiReasoning: null,
      policyVerdict,
      amount,
    };
  }

  // AI tool-calling loop
  const systemPrompt = `You are LicensePilot's renewal agent. You process software licence renewals for the AG Grid vendor platform.

Your job: given a customer record, decide whether to send a renewal invoice, hold for human review, or escalate to sales.

HARD RULES (enforced by the policy engine — you cannot bypass these):
1. Never invoice a customer with an unpaid balance.
2. Never invoice more than the auto limit.
3. Never invoice if detected devs exceed paid seats.
4. Always call check_policy before create_invoice.

PROCESS:
1. Call get_customer and get_usage to understand the customer.
2. Call check_policy to verify the action is permitted.
3. If policy passes AND the renewal looks normal: call create_invoice.
4. If anything looks risky (unusual region, very large jump in seats, payment history concerns): call hold_for_human.
5. If policy blocks due to unpaid balance or seat gap: call escalate_to_sales.
6. Only create a subscription link when autoRenewRequested is true in the customer record.

Be concise and factual. Do not invent data.`;

  const userMessage = `Process renewal for customer ID ${customer.id}: ${customer.company} (${customer.region}). Estimated renewal amount: $${amount} (${policyConfig.renewalPct}% of licence value — this is an estimate).`;

  let messages = [{ role: "user", content: userMessage }];
  let aiReasoning = "";
  let action = "Held";
  let reason = "Agent did not complete.";
  let invoiceId = null;
  let approvalUrl = null;
  let mock = false;

  // Tool implementations
  const toolHandlers = {
    get_customer: ({ customerId }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      return {
        id: customer.id,
        company: customer.company,
        region: customer.region,
        plan: customer.plan,
        seats: customer.seats,
        devsDetected: customer.devsDetected,
        renewalInDays: customer.renewalInDays,
        paid: customer.paid,
        autoRenewRequested: customer.autoRenewRequested,
        licenceValue: customer.value,
        estimatedRenewal: amount,
      };
    },
    get_usage: ({ customerId }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      return {
        paidSeats: customer.seats,
        detectedDevelopers: customer.devsDetected,
        overage: Math.max(0, customer.devsDetected - customer.seats),
      };
    },
    check_policy: ({ customerId, amount: amt }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      if (amt !== amount)
        return {
          error: "Use the estimated renewal amount from the customer record.",
        };
      const v = runPolicyChecks(customer, amt, policyConfig);
      return { passed: v.passed, action: v.action, checks: v.checks };
    },
    create_invoice: async ({ customerId, amount: amt, note }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      if (amt !== amount)
        return {
          error:
            "Invoice amount must match the policy-approved renewal estimate.",
        };
      // Policy is re-checked here as a hard gate — AI cannot skip this
      const v = runPolicyChecks(customer, amt, policyConfig);
      if (!v.passed) {
        return {
          error: "Policy check failed — invoice not created.",
          policyVerdict: v,
        };
      }
      if (dryRun) {
        return {
          dryRun: true,
          message: "Dry run — no invoice created.",
          invoiceId: null,
        };
      }
      const inv = await makeInvoiceFn({
        customer,
        amount: amt,
        note: note || `Renewal by LicensePilot agent for ${customer.company}`,
      });
      invoiceId = inv.id;
      mock = inv.mock ?? false;
      action = dryRun ? "Dry run — Invoice would be sent" : "Invoice sent";
      reason = `AI agent approved. Renewal due in ${customer.renewalInDays} days. Amount: $${amt}.`;
      return { success: true, invoiceId: inv.id, mock: inv.mock };
    },
    create_subscription_link: async ({ customerId, amount: amt }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      if (!customer.autoRenewRequested)
        return { error: "Customer has not opted into automatic renewal." };
      if (amt !== amount)
        return {
          error:
            "Subscription amount must match the policy-approved renewal estimate.",
        };
      const v = runPolicyChecks(customer, amt, policyConfig);
      if (!v.passed)
        return {
          error: "Policy check failed — subscription not created.",
          policyVerdict: v,
        };
      if (dryRun)
        return { dryRun: true, message: "Dry run — no subscription created." };
      if (!createSubscriptionFn)
        return { error: "Subscription creation is unavailable." };
      const subscription = await createSubscriptionFn({
        customer,
        amount: amt,
      });
      invoiceId = subscription.id;
      approvalUrl = subscription.approvalUrl ?? null;
      action = "Subscription approval link created";
      reason =
        "PayPal subscription created; recurring billing begins only after customer approval.";
      return {
        success: true,
        subscriptionId: subscription.id,
        approvalUrl: subscription.approvalUrl,
      };
    },
    hold_for_human: ({ customerId, reason: r }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      action = "Held";
      reason = "AI: " + r;
      return { success: true };
    },
    escalate_to_sales: ({ customerId, reason: r }) => {
      if (customerId !== customer.id)
        return { error: "Customer not found in this run scope." };
      action = "Escalated";
      reason = "AI: " + r;
      return { success: true };
    },
  };

  // Max 5 iterations to prevent infinite loops
  for (let i = 0; i < 5; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Collect any text reasoning
    for (const block of response.content) {
      if (block.type === "text") aiReasoning += block.text + "\n";
    }

    if (response.stop_reason === "end_turn") break;
    if (response.stop_reason !== "tool_use") break;

    // Process tool calls
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const tool of toolUseBlocks) {
      const handler = toolHandlers[tool.name];
      let result;
      if (!handler) {
        result = { error: `Unknown tool: ${tool.name}` };
      } else {
        try {
          result = await handler(tool.input);
        } catch (e) {
          result = { error: e.message };
        }
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(result),
      });
    }

    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];
  }

  return {
    action,
    reason,
    invoiceId,
    approvalUrl,
    mock,
    aiReasoning: aiReasoning.trim() || null,
    policyVerdict,
    amount,
  };
}
