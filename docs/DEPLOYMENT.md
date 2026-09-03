# Deployment and Portfolio Subdomain

## Current production shape

VolGuard currently builds with Vinext and runs publicly on OpenAI Sites. Its API imports `cloudflare:workers` and stores telemetry in a Cloudflare D1 binding. The browser never receives Alpaca credentials; an authenticated GitHub Actions runner reads the paper account and publishes sanitized snapshots, option scans, order events, and strategy replays through token-protected endpoints. A Cloudflare Worker schedules the job and a Durable Object stores the emergency pause state.

## Automation control and alerts

Use **Actions → Control VolGuard paper automation → Run workflow** and enter an audit reason. Select `pause` to stop only new-entry scans/submissions while the five-minute protective monitor continues. Select `halt_all` only when even scheduled exits must stop—for example, while broker state is known to be inconsistent. Select `resume` after the reason has been resolved. These controls do not close positions or cancel existing broker orders. The workflow records its reported GitHub actor and run ID; the public dashboard only reads `/status`. Both entry and exit runners recheck a fresh status immediately before submission, which covers jobs already queued when a control changes.

Failures, accepted paper entries/exits, and distinct safety holds create deduplicated GitHub Issues with a link to the exact run. A separate no-secret CI workflow verifies tests, TypeScript, lint, the Worker runtime, and the production build on pull requests and pushes to `master`.

Required server-side configuration includes `VOLGUARD_CONTROL_URL` and `VOLGUARD_CONTROL_TOKEN` in the GitHub `paper-trading` environment, `CONTROL_TOKEN` as a Worker secret, and the non-secret `VOLGUARD_CONTROL_URL` binding in the Sites runtime. Never expose either token to browser code.

## Recommended hackathon path

Keep the working Sites deployment as the data plane through submission. This avoids replacing a verified storage path while strategy work is still active. Make judge access a deliberate release step, then use the stable URL in the submission.

Your portfolio can link to or embed the product story immediately. If you want the app itself on a portfolio subdomain, choose one of these paths:

### Path A — Vercel frontend, existing Sites API

Deploy a standard Next.js frontend to Vercel and point its read-only data requests at the Sites API. Add an explicit allowed origin and a narrow read credential before making those APIs cross-origin.

**Strength:** Fastest way to get portfolio branding without moving the broker-data boundary.

**Cost:** Two deployments and cross-origin security configuration.

### Path B — Full Vercel migration

Replace `lib/telemetry-store.ts` with a provider-neutral repository interface and implement it using a Vercel-compatible hosted database. Keep the option-scan and telemetry contracts unchanged, and move both ingestion routes to the normal Next.js Node.js runtime.

**Strength:** One deployment and a conventional Vercel architecture.

**Cost:** More migration and verification work; the current D1 binding cannot simply follow the code to Vercel.

## Custom subdomain sequence

After the Vercel project is linked and production is verified:

1. Add the intended subdomain in Vercel project domain settings.
2. Inspect the required DNS record.
3. Add the CNAME through the DNS provider that owns your portfolio domain.
4. Re-inspect the domain until verification and TLS provisioning complete.
5. Test the production dashboard, `/api/telemetry`, and `/api/scans` through the custom hostname.
6. Update the local publisher URLs only after the new ingestion endpoints pass authentication and schema tests.

Vercel documents the current domain workflow at [Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain) and its server runtime behavior at [Vercel Functions runtimes](https://vercel.com/docs/functions/runtimes).

## Release safety checklist

- Keep `ALPACA_LIVE_TRADE=false` and `VOLGUARD_EXECUTION_ENABLED=false` during the migration.
- Never copy Alpaca credentials into browser-visible variables.
- Configure the ingest token only as a server secret.
- Test an unauthorized POST, malformed payload, duplicate timestamp, empty store, and stale scan.
- Run tests, lint, TypeScript, production build, and dependency audit.
- Preserve the old deployment until the custom hostname has passed end-to-end verification.
