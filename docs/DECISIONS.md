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

## ADR-010 — Model move and implied move remain separate measurements

**Status:** Accepted

**Decision:** Estimate the target-expiry model move from recent close-to-close realized volatility and estimate the market-implied move from the nearest same-strike call and put midpoints.

**Reasoning:** The comparison is transparent, reproducible, and available from the Alpaca data required by the hackathon. A language model does not invent either number.

**Impact:** VolGuard can identify relatively rich or cheap volatility and explain the evidence behind the classification.

**Trade-off:** This baseline omits event-specific forecasts, volatility skew, term structure, and calibrated transaction costs. Those should be added only with measurable validation.

## ADR-011 — A signal is not a trade proposal

**Status:** Accepted

**Decision:** Do not run the twelve-gate portfolio governor until a position constructor has selected exact contracts, quantity, limit price, and theoretical maximum loss.

**Reasoning:** A strategy label such as “iron condor” does not define risk. Treating it as executable would create false precision.

**Impact:** The dashboard clearly labels candidates as observation-only and shows signal checks separately from portfolio-risk checks.

**Trade-off:** The product reaches autonomous execution later, but every approval stage has the evidence it actually needs.

## ADR-012 — Keep raw option chains local

**Status:** Accepted

**Decision:** Publish a compact sanitized scan batch rather than raw Alpaca option-chain payloads. Persist bounded contract-level quotes only for fully eligible candidates that require exact wing construction.

**Reasoning:** The hosted dashboard needs decision evidence, not the full broker response. Data minimization reduces exposure and keeps storage portable.

**Impact:** The position constructor can reproduce exact candidate sizing without exposing brokerage identity or persisting irrelevant chains. Candidate quote arrays are capped at 200 validated records per symbol.

**Trade-off:** Abstentions retain decision evidence but no contract surface. Detailed surface research must be performed locally or added through a deliberately versioned analytics schema.

## ADR-013 — Position risk is calculated before agent persuasion

**Status:** Accepted

**Decision:** Construct exact contracts and calculate theoretical maximum loss before requesting agent votes or generating an order preview.

**Reasoning:** A signal can identify an apparent volatility edge while the minimum tradable contract is still too expensive for policy. Option contracts are not fractionally resizable.

**Impact:** The first live QQQ long-straddle signal was correctly blocked at $1,089 maximum loss against a $500 limit, even though all six signal checks passed.

**Trade-off:** Some valid forecasts cannot be traded until a lower-cost defined-risk structure is available.

## ADR-014 — Preserve the thesis when optimizing price

**Status:** Accepted

**Decision:** When a neutral long-volatility signal exceeds the $500 risk budget, preserve its two-sided exposure with a reverse iron butterfly instead of silently converting it into a bullish or bearish vertical. Select covered wings near the modeled move and calculate the debit using buy-at-ask and sell-at-bid limits.

**Reasoning:** Affordability is not permission to change the forecast. A one-direction spread would make a cheaper trade by introducing a different thesis. Conservative executable-side prices also reduce the chance that a midpoint-only structure appears affordable but cannot be filled within policy.

**Impact:** VolGuard can search for a four-leg, defined-risk structure with a worst-case debit no greater than $500 while keeping the original volatility hypothesis auditable.

**Trade-off:** The wings cap profit and add complex-order execution and expiration pin risk. The optimizer therefore cannot authorize an order; freshness, portfolio gates, council approval, and a single complex-order preview still remain mandatory.
