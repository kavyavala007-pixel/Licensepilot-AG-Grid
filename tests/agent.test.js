import { beforeEach, describe, expect, it, vi } from "vitest";

const createMessage = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: createMessage };
    }
  },
}));

import { runAgentForCustomer } from "../server/agent.js";

const customer = {
  id: 1,
  company: "Example Systems",
  region: "North America",
  plan: "Single app",
  seats: 10,
  devsDetected: 8,
  renewalInDays: 12,
  paid: true,
  autoRenewRequested: true,
  value: 1000,
};

const policy = {
  autoInvoiceLimit: 1000,
  renewalPct: 30,
  renewalWindowDays: 30,
  excludedRegions: [],
};

describe("AI agent policy boundary", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    createMessage.mockReset();
  });

  it("does not create an invoice when AI supplies a different amount", async () => {
    createMessage
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "create_invoice",
            input: { customerId: customer.id, amount: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [] });
    const makeInvoice = vi.fn();

    await runAgentForCustomer(customer, policy, makeInvoice);

    expect(makeInvoice).not.toHaveBeenCalled();
    expect(
      createMessage.mock.calls[1][0].messages.at(-1).content[0].content,
    ).toContain(
      "Invoice amount must match the policy-approved renewal estimate",
    );
  });

  it("blocks an amount above the code-enforced auto limit before the AI can act", async () => {
    const makeInvoice = vi.fn();

    const result = await runAgentForCustomer(
      { ...customer, value: 100_000 },
      { ...policy, autoInvoiceLimit: 100 },
      makeInvoice,
    );

    expect(result.action).toBe("Held");
    expect(makeInvoice).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns the customer approval link for a policy-approved subscription", async () => {
    createMessage
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-subscription",
            name: "create_subscription_link",
            input: { customerId: customer.id, amount: 300 },
          },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [] });
    const makeSubscription = vi.fn().mockResolvedValue({
      id: "SUB-123",
      approvalUrl: "https://sandbox.example/approve",
    });

    const result = await runAgentForCustomer(
      customer,
      policy,
      vi.fn(),
      false,
      makeSubscription,
    );

    expect(makeSubscription).toHaveBeenCalledOnce();
    expect(result.action).toBe("Subscription approval link created");
    expect(result.approvalUrl).toBe("https://sandbox.example/approve");
  });

  it("does not create a subscription without recorded customer opt-in", async () => {
    createMessage
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool-subscription",
            name: "create_subscription_link",
            input: { customerId: customer.id, amount: 300 },
          },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [] });
    const makeSubscription = vi.fn();

    await runAgentForCustomer(
      { ...customer, autoRenewRequested: false },
      policy,
      vi.fn(),
      false,
      makeSubscription,
    );

    expect(makeSubscription).not.toHaveBeenCalled();
  });
});
