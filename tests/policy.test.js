// tests/policy.test.js — Unit tests for the policy engine
// Run: npm test

import { describe, it, expect } from "vitest";
import { runPolicyChecks, calcRenewalAmount } from "../server/policy.js";

const BASE_CONFIG = {
  autoInvoiceLimit: 12000,
  renewalPct: 30,
  renewalWindowDays: 30,
  excludedRegions: [],
};

const GOOD_CUSTOMER = {
  id: 1,
  company: "Acme Corp",
  region: "North America",
  plan: "Single app",
  seats: 10,
  devsDetected: 8,
  renewalInDays: 15,
  paid: true,
  value: 9990,
};

describe("calcRenewalAmount", () => {
  it("returns 30% of value by default", () => {
    expect(calcRenewalAmount(10000)).toBe(3000);
  });
  it("accepts a custom percentage", () => {
    expect(calcRenewalAmount(10000, 25)).toBe(2500);
  });
  it("rounds to nearest integer", () => {
    expect(calcRenewalAmount(999, 30)).toBe(300);
  });
});

describe("runPolicyChecks", () => {
  describe("no_unpaid_balance rule", () => {
    it("passes when customer is paid", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 2997, BASE_CONFIG);
      const check = verdict.checks.find((c) => c.rule === "no_unpaid_balance");
      expect(check.pass).toBe(true);
    });

    it("fails when customer has unpaid balance", () => {
      const customer = { ...GOOD_CUSTOMER, paid: false };
      const verdict = runPolicyChecks(customer, 2997, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe("skip");
      const check = verdict.checks.find((c) => c.rule === "no_unpaid_balance");
      expect(check.pass).toBe(false);
    });
  });

  describe("within_auto_limit rule", () => {
    it("passes when amount is within limit", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 5000, BASE_CONFIG);
      const check = verdict.checks.find((c) => c.rule === "within_auto_limit");
      expect(check.pass).toBe(true);
    });

    it("fails when amount equals the limit (edge: exactly at limit passes)", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 12000, BASE_CONFIG);
      const check = verdict.checks.find((c) => c.rule === "within_auto_limit");
      expect(check.pass).toBe(true); // ≤ passes
    });

    it("fails when amount exceeds limit", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 12001, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe("hold");
      const check = verdict.checks.find((c) => c.rule === "within_auto_limit");
      expect(check.pass).toBe(false);
    });

    it("cannot be bypassed even if other checks pass", () => {
      // This is the key AI-bypass test: even a "good" customer with high amount is held
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 999999, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe("hold");
    });
  });

  describe("seats_not_exceeded rule", () => {
    it("passes when devs <= seats", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 2997, BASE_CONFIG);
      const check = verdict.checks.find((c) => c.rule === "seats_not_exceeded");
      expect(check.pass).toBe(true);
    });

    it("fails when devs exceed seats", () => {
      const customer = { ...GOOD_CUSTOMER, devsDetected: 15, seats: 10 };
      const verdict = runPolicyChecks(customer, 2997, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe("hold");
    });
  });

  describe("region_not_excluded rule", () => {
    it("passes for a non-excluded region", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 2997, BASE_CONFIG);
      const check = verdict.checks.find(
        (c) => c.rule === "region_not_excluded",
      );
      expect(check.pass).toBe(true);
    });

    it("fails for an excluded region", () => {
      const config = { ...BASE_CONFIG, excludedRegions: ["North America"] };
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 2997, config);
      expect(verdict.passed).toBe(false);
      expect(verdict.action).toBe("skip");
    });
  });

  describe("positive_amount rule", () => {
    it("fails for zero amount", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 0, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
    });

    it("fails for negative amount", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, -100, BASE_CONFIG);
      expect(verdict.passed).toBe(false);
    });
  });

  describe("combined checks — unpaid takes priority", () => {
    it("action is skip (not hold) when unpaid even if amount is also over limit", () => {
      const customer = { ...GOOD_CUSTOMER, paid: false };
      const verdict = runPolicyChecks(customer, 99999, BASE_CONFIG);
      expect(verdict.action).toBe("skip");
    });
  });

  describe("happy path", () => {
    it("passes all checks for a normal customer", () => {
      const verdict = runPolicyChecks(GOOD_CUSTOMER, 2997, BASE_CONFIG);
      expect(verdict.passed).toBe(true);
      expect(verdict.action).toBe("proceed");
      expect(verdict.checks.every((c) => c.pass)).toBe(true);
    });
  });
});
