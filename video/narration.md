# LicensePilot demo narration

Target runtime: **03:00 exactly**. This is a voiceover guide for a single, conversational narrator. The demo video has no burned-in captions.

## 00:00–00:15 — Open: the opportunity

What if software licensing operations connected project usage, customer accounts, and renewal decisions in one clear workflow? LicensePilot is an independent hackathon prototype exploring that idea through an AG Grid example for vendor teams.

## 00:15–00:35 — Overview

The overview brings together a seeded sample customer base, upcoming renewals, seat mismatches, and unpaid balances. The dashboard helps an operations team see where attention may be needed, while the chart summarizes fictional account data by region. These metrics are examples, not customer activity.

## 00:35–01:08 — Licence Advisor

The Licence Advisor starts with a project manifest and detects paid AG Grid or AG Charts packages. Team size and internal versus customer-facing use shape this prototype’s illustrative route. These routes are examples, not AG Grid policy; confirm real terms with AG Grid. A spending-policy check separates a recommendation from approval. The displayed one-dollar amount is only a simulated sandbox integration test, never a licence price. Project Check compares detected packages with fictional sample licence records.

## 01:08–01:34 — AG Grid customer operations

For vendor operations, the Customers page puts account records into an interactive AG Grid table. Teams can search and filter accounts, compare paid seats with detected developers, inspect renewal timing, open a customer record, and export a CSV. Selected renewal bills are a deliberate user action, not an invisible background change. These are fictional demo accounts.

## 01:34–02:06 — Policy-gated renewals

Renewals is the operational control point. A practice run previews decisions without sending bills. Before any action, code-enforced checks look for unpaid balances, amounts over the approval limit, seat overages, excluded regions, and invalid amounts. Blocked cases are held, skipped, or escalated rather than passed through by AI. The app also includes a daily scheduled run, but human-readable policy gates—not an AI suggestion—remain central to the workflow.

## 02:06–02:22 — Assistant

The optional assistant answers questions about customer data. It is read-only and cannot send bills or change rules. When runtime AI is off, the interface identifies its limited rules-based fallback. That result is not Claude output.

## 02:22–02:40 — Payments and audit

Payments brings checkouts, invoices, and subscriptions into one view, distinguishing simulated records from PayPal sandbox activity. Activity History shows decisions and payment updates with reasons, filters, and CSV export. No production transactions were made.

## 02:40–02:55 — How it fits together

React and Vite host AG Grid and AG Charts. Express and Prisma serve the app’s data. Code-enforced policy gates renewals. Anthropic is optional; PayPal uses sandbox or demo simulation. Live events refresh the screens.

## 02:55–03:00 — Close

LicensePilot: an independent prototype, not affiliated with AG Grid or PayPal.
