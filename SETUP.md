# Local setup and sandbox credentials

Keep all keys in your local `.env`. Never paste them into chat, screenshots, issue trackers, or source control. The repository ignores `.env`; `.env.example` contains blank secret fields.

## Start without credentials

1. Install Node.js 20.19+.
2. From the project directory, run `npm ci`.
3. Copy `.env.example` to `.env`.
4. Run `npm run dev` and open <http://127.0.0.1:5173>.

Without PayPal credentials, checkout is a labelled demo simulation. Without an Anthropic key, agent responses use the rules-only fallback. Demo records are fictional.

## PayPal sandbox accounts and app

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Open **Sandbox → Accounts** and create a Business account for the receiving vendor and a Personal account for the test buyer. Use the dashboard's generated sandbox credentials; do not use real PayPal accounts.
3. Open **Apps & Credentials**, select **Sandbox**, create an app associated with the Business account, and copy its Client ID and Secret into the matching blank fields in `.env`.
4. The only checkout amount allowed by this prototype is **$1.00**. It is an integration test payment, not a licence price or quote. Approve with the sandbox Personal buyer account.

## Webhook configuration

PayPal needs a public HTTPS endpoint to deliver sandbox notifications. Before installing/starting any tunnel or sending traffic to PayPal, review the tunnel provider and get explicit authorization from the project operator.

After an approved tunnel is running and the local app is available:

1. Register `https://<approved-tunnel-host>/api/webhooks/paypal` as a webhook for the sandbox app.
2. Subscribe to the event types supported by the current server implementation. Check the PayPal Developer Dashboard's event list and the current `server/webhooks.js` handlers before selecting events.
3. Copy the webhook's ID into `PAYPAL_WEBHOOK_ID` in `.env`, then restart the app.
4. Confirm the app reports webhook verification as configured before testing. An unconfigured webhook ID is not treated as verified.

Never expose real credentials or use production PayPal accounts. A failed or missing signature must not be bypassed.

To set up automatic renewal, open a customer in the vendor dashboard, record that the customer requested it, then create the sandbox subscription approval link. The policy engine checks the renewal estimate and account eligibility first. The subscription does not charge until the buyer approves at PayPal.

## Anthropic

1. Create an API key in the [Anthropic Console](https://console.anthropic.com/).
2. Add it as `ANTHROPIC_API_KEY` in `.env`; optionally set `AI_MODEL` to a model available to that account.
3. Restart the app. If the key is absent, the rules-only fallback is used and shown in the UI.

The policy engine is the hard gate regardless of AI availability. Do not rely on AI reasoning as authorization to spend.

## Local database

The default `DATABASE_URL=file:./dev.db` uses SQLite. Startup applies the current Prisma schema and seeds demo records only when the database has no vendor. For PostgreSQL, set `DATABASE_URL` to a PostgreSQL connection URL; startup selects the PostgreSQL Prisma schema and applies checked-in migrations. Use `npm run db:seed` only when intentionally reseeding; it is not the normal startup path.

Free hosting may use ephemeral storage. Do not use this prototype as a durable record of real payments, licences, or customer data.
