# Product and Risk Decisions

## ADR-001 — Risk policy remains deterministic

**Status:** Accepted

**Decision:** AI agents may propose, explain, and critique trades, but only ordinary code may approve risk limits.

**Reasoning:** Language models are useful for context and competing hypotheses but should not reinterpret hard exposure limits at runtime.

**Impact:** Every trade is auditable. A persuasive explanation cannot override a failed gate.

**Trade-off:** Some valid trades may be rejected by conservative thresholds.

## ADR-002 — Paper trading is enforced at two layers

**Status:** Accepted

**Decision:** Force Alpaca paper routing and maintain a separate VolGuard execution lock.

**Reasoning:** Broker routing and application authorization solve different problems. Both must agree before a mutating command is permitted.

**Impact:** Credentials alone do not enable order submission.

**Trade-off:** Unlocking execution requires an explicit operational step.

## ADR-003 — Begin with liquid index ETFs

**Status:** Accepted

**Decision:** Start the scanner with SPY, QQQ, and IWM rather than a broad equity universe.

**Reasoning:** Liquidity, narrower spreads, and fewer idiosyncratic events make early results easier to interpret.

**Impact:** Faster debugging and cleaner strategy attribution.

**Trade-off:** Fewer opportunities and less exposure to single-stock volatility.

## ADR-004 — Abstention is a first-class strategy

**Status:** Accepted

**Decision:** The selector can return `abstain` whenever edge or execution quality is insufficient.

**Reasoning:** A system forced to trade will manufacture conviction and overfit noise.

**Impact:** Lower activity but higher decision quality.

**Trade-off:** Short competitions may reward more risk-taking, but tournament incentives do not override product safety.

## ADR-005 — Connect read-only data before execution

**Status:** Accepted

**Decision:** Replace all representative values with authenticated read-only data before constructing or submitting paper orders.

**Reasoning:** The data contract, timestamps, and reconciliation logic must be trustworthy before any execution layer depends on them.

**Impact:** Slower first trade, substantially lower operational risk.

**Trade-off:** Early milestones demonstrate observation and explanation rather than P&L.

## ADR-006 — Publish sanitized telemetry, not broker payloads

**Status:** Accepted

**Decision:** Transform Alpaca responses locally and publish only fields the product requires. Exclude credentials, account IDs, broker order IDs, and unneeded profile data.

**Reasoning:** The dashboard needs operational state, not brokerage identity. Data minimization reduces the impact of accidental exposure and gives the interface a stable schema when upstream responses change.

**Impact:** The same sanitized contract can support the dashboard, journal, tests, and later analytics.

**Trade-off:** New dashboard requirements must be deliberately added to the schema rather than reading arbitrary broker fields.

## ADR-007 — Store telemetry as append-only snapshots

**Status:** Accepted

**Decision:** Insert an immutable row for each unique capture timestamp and derive the dashboard's current state from the newest row.

**Reasoning:** Trading review needs historical evidence. Updating a single “current account” record would erase what the system knew before a failure, trade, or market transition.

**Impact:** The same store can later power equity curves, incident reconstruction, stale-data alerts, and session reports.

**Trade-off:** Storage grows over time and will need an explicit retention or archival policy after real usage volume is known.

## ADR-008 — Separate telemetry authorization from Alpaca authorization

**Status:** Accepted

**Decision:** Protect telemetry ingestion with a dedicated secret and never send Alpaca credentials to the hosted application. While the site is owner-only, use its separate hosting bypass credential only to cross the access gate.

**Reasoning:** The hosted dashboard needs permission to accept a narrow sanitized message, not permission to operate the brokerage account.

**Impact:** Exposure of either web credential cannot directly authorize a broker action, and each credential can be rotated independently.

**Trade-off:** The local runner and hosted environment require one additional secret to configure and rotate.

## ADR-009 — Missing data must look missing

**Status:** Accepted

**Decision:** Show dashes, waiting states, and telemetry age when no verified snapshot exists rather than falling back to representative balances.

**Reasoning:** A polished but invented number is more dangerous than an explicit unavailable state in a financial system.

**Impact:** Operators and judges can distinguish real broker telemetry from the labeled strategy demonstration.

**Trade-off:** A first visit looks less dramatic until the publisher has completed a sync.
