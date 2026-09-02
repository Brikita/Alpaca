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

## 2026-08-30 — Real option intelligence

### What changed

- Added a read-only SPY, QQQ, and IWM collector using Alpaca snapshots, daily bars, and option chains.
- Added a realized-versus-implied move model, deterministic strategy selection, and six signal-quality checks.
- Added a strict sanitized scan contract, protected append-only ingestion, D1 migration, and local publisher.
- Replaced the simulated dashboard proposal with the latest real scan and inspectable abstention trace.

### Why

The hackathon requires options and Alpaca tooling, but a useful product also needs to distinguish a measurable opportunity from a plausible story. The scanner creates that evidence while keeping execution locked.

### Strength and use

The same feature supports the hackathon demonstration, a pre-trade watchlist, and a growing dataset of candidates and rejected setups. Recording abstentions makes it possible to test whether the filters help rather than judging only selected trades.

### Verification

- Nineteen automated tests pass.
- Lint, TypeScript, and the production build pass.
- The database migration was generated and inspected.
- The scanner enforces paper mode and never calls an order command.
- The first real scan exposed a SIP subscription error; the collector was corrected to request Alpaca's available IEX stock feed and structured CLI errors are now readable.
- A corrected batch was published and read back from the private production endpoint: zero candidates, SPY and QQQ passed four of six checks, and IWM passed three of six.
- The market-closed batch correctly abstained because Friday's option quotes were roughly 154,000 seconds old. SPY measured a 1.46% model move versus 1.09% implied, QQQ 2.56% versus 1.61%, and IWM 2.05% versus 1.60%.

### Remaining limitation

Exact contract-leg construction, risk sizing, order preview, scheduling, and session analytics remain. A future Vercel deployment also needs a storage adapter because the current persistence implementation uses Cloudflare D1.

## 2026-08-30 — Dependency security refresh

### What changed

- Updated React and React Server Components to patched releases.
- Evaluated a newer Vinext, Vite, and Cloudflare build toolchain, then rolled it back after production D1 requests timed out. The known-compatible hosting stack remains pinned while that regression is isolated.

### Why

The final audit found high-severity advisories in both runtime and build dependencies. A public hackathon repository should not knowingly ship fixable high-severity findings.

### Verification

- Tests, lint, TypeScript, and the production Vinext build pass after the retained React update.
- `npm audit --omit=dev` reports zero production vulnerabilities.
- The full audit still reports development-tool findings. Automated forced fixes would introduce breaking changes, so the working production stack is retained until a compatible upgrade is verified end to end.

## 2026-08-31 — First open-market decision

### What changed

- Published fresh live-session account telemetry and an option scan at 10:12 AM ET.
- Added GLD to the regular universe after confirming it is Alpaca-tradable and options-enabled.
- Added exact long-straddle construction and a read-only command that evaluates the newest hosted candidate through all twelve portfolio gates.
- Updated the dashboard to distinguish a signal candidate from a risk-approved proposal.

### Evidence

- The paper account was active with $100,000 equity, no positions, no orders, and no trading block.
- SPY and IWM abstained because their implied/model ratios did not clear the edge threshold.
- QQQ passed all six signal checks at the 714 strike: 2.18% modeled move versus 1.53% implied, fresh quotes, 2.9% widest spread, and 718 combined volume.
- The exact Sep 4 long straddle cost about $10.89 per share, or $1,089 theoretical maximum loss for one contract pair. It passed 10/12 portfolio gates but failed the $500 per-trade cap and the not-yet-run agent council.
- An observational GLD scan found an apparent volatility edge but abstained because combined ATM volume was only 36.
- No order preview or submission was performed.

### Operational incident

The newest hosting build returned D1 timeouts. VolGuard was rolled back to the last known-good private release, endpoint health returned to 200, and telemetry publishing succeeded. The source build stack is being kept compatible until the newer D1 regression is resolved.

## 2026-08-31 — Risk-budget wing optimizer

### What changed

- Added a four-leg reverse-iron-butterfly constructor for oversized long-volatility candidates.
- Added conservative buy-at-ask and sell-at-bid limit pricing, exact maximum loss, the smaller capped wing profit, and model-move-aware wing selection.
- Added bounded, schema-validated candidate contract evidence while keeping abstention payloads compact.
- Expanded the dashboard trace to show the exact legs, limits, construction rationale, and all twelve risk gates.

### Reasoning and trading-routine impact

The first QQQ and GLD candidates showed that a valid signal can be too expensive at the minimum contract quantity. The optimizer now tests whether covered wings can preserve the two-sided volatility thesis within the precommitted $500 budget. A cheaper structure still does not become an order: it must pass every remaining portfolio gate and the independent council.

### Verification

- Twenty-five automated tests pass, including conservative four-leg economics, the $500 sizing boundary, council blocking, payload limits, and malformed quote rejection.
- Lint and TypeScript pass.
- A post-close real scan published successfully and correctly abstained because the market was closed and quotes were stale.
- The first live-market optimizer validation is deferred to the next open session; no stale quote was promoted into a candidate and no order command was invoked.

### Remaining limitation

Directional verticals and iron-condor construction still fail closed. The next milestone is the independent agent council, followed by a non-submitting Alpaca complex-order preview. This constraint was later resolved with a lifecycle-based two-strategy portfolio ledger and combined maximum-risk accounting.

## 2026-08-31 — All-device dashboard

### What changed

- Replaced the phone's hidden navigation with a five-destination bottom bar and 48-pixel touch targets.
- Reflowed metrics, strategy evidence, candidate cards, risk controls, and status information across phone, tablet, landscape, and desktop breakpoints.
- Added safe-area support for notched devices, explicit mobile viewport metadata, a keyboard skip link, visible focus treatment, and overflow-safe contract text.
- Converted the decision trace into a full-width mobile sheet with larger controls and readable gate evidence.

### Why and routine impact

VolGuard is intended to support a real routine, so readiness checks and rejected-trade review must remain usable when the operator is away from a laptop. Mobile access does not weaken a gate or unlock execution; it exposes the same evidence and controls in a form that can be read and operated safely by touch.

### Verification

- Browser checks passed at 320×568, 390×844, 768×1024, 1024×768, and 1440×900.
- No tested viewport produced horizontal overflow, and all five navigation destinations remained available.
- Primary phone controls measured at least 44 pixels high; section navigation landed above the fixed bar; and the browser reported no console errors.
- Twenty-five automated tests, TypeScript, lint, and the production build pass.

## 2026-09-01 — Decision-history journal

### What changed

- Exposed recent append-only option-scan batches through a bounded history endpoint.
- Added a chronological dashboard journal for candidates, abstentions, unavailable scans, strategies, gate counts, and the first stop reason.
- Added a separate broker reconciliation panel that explicitly reports zero captured trade events and distinguishes signals from orders.

### Why and routine impact

The existing database preserved each scan, but the interface exposed only the newest one. The journal converts those rejected and accepted signal decisions into reviewable evidence for deliberate practice and the hackathon demonstration. After the session, the operator can now identify which gate repeatedly prevented a trade without confusing research candidates with executed positions.

### Verification

- Twenty-seven automated tests pass, including newest-first ordering, failed-gate reasoning, and bounded history payloads.
- TypeScript and the local application render pass.
- The feature reads existing D1 records and requires no database migration.
- No order command was invoked; order, fill, exit, and realized-P&amp;L history remain the next reconciliation milestone.

## 2026-09-01 — First governed paper execution

### What changed

- Added conservative bear-put and bull-call vertical construction.
- Added a four-role transparent council with inspectable approvals, abstention, and red-team veto logic.
- Added mandatory atomic Alpaca multi-leg dry runs, an idempotent client order ID, a one-process paper execution unlock, and a strict 60-second evidence limit.
- Added protected append-only preview, submission, rejection, and broker-reconciliation events to the dashboard journal.

### Live paper evidence

- At 10:24 AM ET, the fresh paper account was active with $100,000 equity, options level 3, no positions, no orders, and no trading block.
- SPY and QQQ abstained at the edge gate. IWM and GLD produced bearish directional candidates; GLD ranked first.
- VolGuard selected the Sep 4 GLD 398/391 bear-put spread: buy one 398 put and sell one 391 put.
- Conservative entry evidence produced a $1.82 debit limit, $182 maximum loss, and $518 theoretical maximum expiration profit. Effective quote age was 42 seconds and the widest leg spread was 11.32%, below the 12% ceiling.
- Regime and Volatility approved, Catalyst explicitly abstained because no verified event feed exists, and Red Team issued no veto. The deterministic governor passed 12/12 gates.
- Alpaca's dry run validated the same atomic request. The paper API then accepted it and filled one strategy unit at a $1.79 average debit, three cents better than the limit.
- The post-fill snapshot showed the long 398 put and short covered 391 put, no open orders, $99,984.95 marked equity, and $99,820.95 cash. The immediate $15 marked decline is unrealized spread/mark variation, not a closed-trade result.

### Safety impact and remaining work

Live routing remained prohibited, and the execution unlock applied only to the single local process. VolGuard now refuses another proposal while these legs are open. Exit rules, scheduled monitoring, verified event data, strategy-level position grouping, and portfolio-wide maximum-risk aggregation remain required before scaling beyond one paper position.

## 2026-09-01 — Governed position lifecycle

### What changed

- Added deterministic profit, loss, and prior-weekday time exits for filled debit spreads.
- Added exact broker-position matching and fresh two-sided closing quotes.
- Added atomic Alpaca multi-leg closing dry runs with reversed closing intents and a separate closing-only process lock.
- Added durable monitoring, exit, reconciliation, and realized-P&L evidence to the journal.
- Activated a 15-minute weekday heartbeat that runs the same closing-only monitor and reconciliation workflow.

### Policy reasoning

The position should not be managed by emotion or a single fluctuating account mark. VolGuard therefore targets 50% of actual maximum profit, treats a 50%-of-debit loss as thesis invalidation, and exits at 3:00 PM ET on the prior weekday to avoid expiration-day pin and assignment risk. It prices closure conservatively by selling long legs at bid and buying short legs at ask.

### First live monitoring evidence

- The open GLD 398/391 bear-put spread exactly matched both recorded broker legs.
- Quotes were 2.63 seconds old.
- The conservative closing credit was $2.10 versus the $1.79 entry debit.
- Marked spread P&L was +$31.
- The profit target was $260.50, the loss limit was $89.50, and the time exit was September 3 at 3:00 PM ET.
- No threshold was reached, so VolGuard recorded HOLD and submitted no closing order.

### Verification and remaining work

Forty-four automated tests, TypeScript, lint, and the production build pass. Live routing remains prohibited. The scheduled task still requires the authenticated local host to be available. Exchange-holiday-aware time exits, verified catalyst data, strategy-level grouping, and portfolio-wide maximum-risk aggregation remain.
