// server/policy.js — Hard-gate policy engine
// The AI agent can NEVER bypass these checks. All decisions are tested.

/**
 * @typedef {Object} PolicyConfig
 * @property {number} autoInvoiceLimit  - Max $ the agent can invoice without approval
 * @property {number} renewalWindowDays - Renewals due within this many days
 * @property {string[]} excludedRegions - Regions the autopilot skips
 */

/**
 * @typedef {Object} PolicyCheck
 * @property {string} rule   - machine name
 * @property {boolean} pass  - true = OK to continue
 * @property {string} reason - human-readable explanation
 */

/**
 * @typedef {Object} PolicyVerdict
 * @property {boolean} passed    - all checks passed
 * @property {PolicyCheck[]} checks
 * @property {string} action     - "proceed" | "hold" | "skip" | "escalate"
 */

/**
 * Run all hard-gate policy checks. Returns a verdict.
 * @param {object} customer
 * @param {number} amount
 * @param {PolicyConfig} config
 * @returns {PolicyVerdict}
 */
export function runPolicyChecks(customer, amount, config) {
  const checks = [];

  // Rule 1: Never invoice a customer with an unpaid balance
  checks.push({
    rule: "no_unpaid_balance",
    pass: Boolean(customer.paid),
    reason: customer.paid
      ? "Customer account is current."
      : "Customer has an open unpaid balance — skipped, escalated to sales.",
  });

  // Rule 2: Amount must be within the auto-invoice limit
  checks.push({
    rule: "within_auto_limit",
    pass: amount <= config.autoInvoiceLimit,
    reason:
      amount <= config.autoInvoiceLimit
        ? `Amount $${amount} is within the auto limit of $${config.autoInvoiceLimit}.`
        : `Amount $${amount} exceeds the auto limit of $${config.autoInvoiceLimit} — held for human review.`,
  });

  // Rule 3: Hold if detected devs exceed paid seats (needs sales top-up quote)
  checks.push({
    rule: "seats_not_exceeded",
    pass: customer.devsDetected <= customer.seats,
    reason:
      customer.devsDetected <= customer.seats
        ? "Developer count matches paid seats."
        : `Detected ${customer.devsDetected} devs but only ${customer.seats} seats paid — sales should offer a top-up, not a plain renewal.`,
  });

  // Rule 4: Region not excluded
  const excluded = config.excludedRegions || [];
  checks.push({
    rule: "region_not_excluded",
    pass: !excluded.includes(customer.region),
    reason: excluded.includes(customer.region)
      ? `Region "${customer.region}" is excluded from autopilot.`
      : "Region is not excluded.",
  });

  // Rule 5: Amount must be positive
  checks.push({
    rule: "positive_amount",
    pass: amount > 0,
    reason:
      amount > 0
        ? "Amount is positive."
        : "Renewal amount is zero or negative — skipped.",
  });

  const passed = checks.every((c) => c.pass);

  // Determine action
  let action = "proceed";
  if (!checks[0].pass)
    action = "skip"; // unpaid → skip
  else if (!checks[1].pass)
    action = "hold"; // over limit → hold
  else if (!checks[2].pass)
    action = "hold"; // seat gap → hold (sales)
  else if (!checks[3].pass)
    action = "skip"; // excluded region
  else if (!checks[4].pass)
    action = "skip"; // zero amount
  else action = "proceed";

  return { passed, checks, action };
}

/**
 * Calculate renewal amount from customer value.
 * Uses the renewal_pct policy (default 30 %).
 * Labelled as an estimate in all UI.
 * @param {number} licenceValue
 * @param {number} renewalPct  - default 30
 * @returns {number}
 */
export function calcRenewalAmount(licenceValue, renewalPct = 30) {
  return Math.round((licenceValue * renewalPct) / 100);
}
