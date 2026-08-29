# Build Journal

## 2026-08-28 — Foundation

### What changed

- Created the VolGuard command-center dashboard.
- Added a strategy selector and twelve-gate risk governor.
- Added paper-only Alpaca CLI protections.
- Added an interactive decision trace and agent pause control.
- Deployed an owner-only demonstration site.

### Why

The first milestone needed to make the product thesis visible while placing safety controls underneath the interface before connecting an account.

### Verification

- Production build completed.
- Eight automated strategy, risk, and execution-safety tests passed.
- Paper account was later verified with $100,000 equity and options level 3.

### Remaining limitation

Dashboard values and the displayed SPY proposal are representative data.

## 2026-08-29 — Documentation system

### What changed

- Added the product guide, trading routine, architectural decisions, and this build journal.

### Why

VolGuard is intended to become both a product and a deliberate-practice system. Decisions therefore need to remain understandable after the hackathon rather than living only in code or conversation.

### Impact on the trading routine

Every new feature must identify where it changes preparation, scanning, approval, execution, monitoring, or review.

### Next milestone

Build a read-only data layer around the authenticated Alpaca CLI and replace representative account and market-state values.

## 2026-08-29 — Read-only Alpaca snapshot

### What changed

- Added a local collector for account state, market clock, positions, and open orders.
- Added an explicit `ALPACA_CLI_PATH` override for reproducible runner configuration.
- Added a sanitizer that omits account IDs and broker order IDs.
- Added a unit test for numeric conversion, paper mode, and identifier removal.

### Why

The dashboard should depend on a small VolGuard-owned schema instead of rendering raw broker responses. This separates private integration details from product telemetry and makes later persistence safer.

### Strength and use

The snapshot is sufficient for the pre-market readiness check and basic reconciliation. It will also provide real equity and exposure inputs to the risk governor.

### Verification

- Nine automated tests passed.
- A real read-only collection returned an active $100,000 paper account with options level 3.
- The collector reported the market closed, no positions, and no open orders.
- No order command was invoked.

### Limitation

The hosted dashboard still shows representative data because a web worker cannot launch a Windows CLI. The next step is to persist sanitized telemetry for the dashboard without deploying Alpaca credentials.

## 2026-08-29 — Durable protected telemetry

### What changed

- Added a D1 schema and migration for append-only telemetry snapshots.
- Added a size-limited, schema-validated ingestion endpoint protected by a dedicated bearer token.
- Extended the local Alpaca collector so it can publish its sanitized result when telemetry configuration is present.
- Replaced representative account values with verified equity, P&L, positions, account-health, market-state, drawdown, and sync-age states.
- Labeled the remaining SPY proposal as a simulated training example.
- Upgraded Next.js from 16.2.6 to 16.3.3 after the production audit identified security advisories.

### Why

A hosted worker cannot execute the local Alpaca CLI, and the dashboard must never receive brokerage credentials. The resulting boundary is: Alpaca paper account → local read-only runner → sanitized snapshot → protected hosted store → dashboard.

### Strength and use

This creates a durable evidence trail without broadening broker authority. It supports the readiness check before trading, truthful account monitoring during the session, and later reconstruction during review.

### Verification

- Twelve automated tests passed, including paper-mode enforcement, identifier removal, risk gates, strategy selection, telemetry-contract rejection, and separate private-site/ingest authorization.
- Lint and production build passed.
- The production dependency audit reports zero vulnerabilities.
- Local API returned a valid empty state and the dashboard rendered the waiting state without console errors or horizontal overflow at desktop and mobile widths.
- The first private hosted sync returned an active $100,000 paper account, market closed, no positions, no open orders, and no trading block; the deployed dashboard rendered those values without console errors.

### Remaining limitation

Publishing is still manual until a scheduled local runner is added. The site remains owner-only, which is appropriate during development but must be deliberately changed for judge access. The option proposal is still a labeled training example, and order execution remains locked.
