# Product Guide

## Product thesis

VolGuard is an AI-assisted trading operating system built around a simple principle: a model may propose a trade, but it may never override deterministic risk policy.

The durable product has three complementary modes:

### Copilot mode

The trader supplies an idea and VolGuard independently reviews it. It checks volatility, liquidity, maximum loss, portfolio overlap, event exposure, and the conditions that would invalidate the thesis.

**Strength:** Improves decision quality without removing the trader from the process.

**Use:** Learning, deliberate practice, and reviewing a trade before risking capital.

**Limitation:** A well-explained trade can still lose. Explanation quality is not evidence of predictive edge.

### Autonomous paper mode

VolGuard scans a constrained universe, selects a strategy, obtains independent agent votes, applies the risk governor, and manages approved paper positions.

**Strength:** Produces repeatable experiments without risking real money.

**Use:** Hackathon demonstration, strategy validation, and creation of a decision dataset.

**Limitation:** Paper fills, latency, spreads, and market impact can differ from live execution.

### Review mode

VolGuard links each outcome back to the original thesis, agent votes, risk gates, execution quality, and exit reason.

**Strength:** Separates process quality from the luck of a single profitable trade.

**Use:** Daily review, weekly statistics, identifying recurring mistakes, and testing whether a setup has positive expectancy.

**Limitation:** Conclusions are unreliable when the sample is small or market regimes are too similar.

## Current feature catalogue

### Strategy selector

**Purpose:** Convert measured market conditions into one of five actions: iron condor, long straddle, bull call spread, bear put spread, or abstain.

**Strengths:** Rules are explicit, testable, and easy to challenge. Abstention is treated as a valid decision.

**Uses:** Filters opportunities before expensive AI reasoning or order construction.

**Current limitation:** The first model uses historical close-to-close volatility and the at-the-money straddle. It does not yet include event forecasts, volatility surfaces, skew, or transaction-cost calibration.

### Real option intelligence scan

**Purpose:** Read SPY, QQQ, IWM, and GLD market data through the authenticated Alpaca CLI, estimate a model move to the target Friday, measure the option-implied move from the nearest quoted call/put pair, and select a defined-risk strategy or abstain.

**Strengths:** Uses broker-sourced evidence rather than demo numbers; requests the subscription-compatible IEX feed for stock history; keeps raw chains and credentials local; records all six signal checks; fails closed when the market, history, quote pair, liquidity, freshness, or edge is inadequate.

**Uses:** Pre-market watchlist preparation, intraday opportunity filtering, comparing realized and implied volatility, and building a dataset of both selected and rejected opportunities.

**Current limitation:** A selected strategy is still only a signal. Exact legs, limit prices, maximum loss, portfolio overlap, and deterministic risk approval must exist before any order preview.

### Six-check signal trace

**Purpose:** Explain whether market session, model history, ATM pairing, execution quality, quote freshness, and strategy edge passed for each scan.

**Strengths:** Makes abstention diagnosable and separates a data-quality failure from a lack of trading edge.

**Uses:** Decide whether to investigate a setup, diagnose stale feeds, and review which filter prevented low-quality trades.

**Current limitation:** These are signal checks, not the thirteen portfolio-risk gates. Passing them only creates a candidate for the next stage.

### Exact position constructor

**Purpose:** Turn an eligible strategy signal into explicit option symbols, quantity, quoted debit, and theoretical maximum loss before portfolio approval.

**Strengths:** Risk is calculated from real contract prices rather than a strategy label. Long straddles are fully defined; the wing optimizer can convert oversized two-sided volatility into a reverse iron butterfly; and directional signals become covered bull-call or bear-put verticals. Every optimized debit uses conservative buy-at-ask and sell-at-bid prices rather than optimistic midpoints.

**Uses:** Enforce the per-trade budget, create an auditable order preview, and explain why a market opportunity may still be unaffordable.

**Current limitation:** Short-volatility iron-condor construction still fails closed. The two-strategy ledger supports diversification, but it deliberately refuses two positions on the same underlying.

### Thirteen-gate risk governor

**Purpose:** Block any proposal that violates paper-only mode, defined-risk policy, exposure limits, liquidity requirements, quote freshness, or agent-consensus rules.

**Strengths:** Deterministic, auditable, and independent of model persuasion. One failed gate blocks execution.

**Uses:** Pre-trade approval, incident analysis, and judge-facing explanation.

**Current limitation:** The council is a transparent evidence-driven specialist layer, not a hosted language-model service. The catalyst specialist uses verified Alpaca news and fails closed when that feed is unavailable or a configured high-impact headline appears; this keyword policy is intentionally conservative and is not a full economic-calendar forecast.

### Atomic paper-order execution

**Purpose:** Convert a fresh 13/13-approved position into one Alpaca multi-leg limit order without manually entering individual legs.

**Strengths:** Always runs the broker dry-run first; uses one idempotent VolGuard client order ID; sends two to four legs atomically with explicit opening intents; uses the conservative net debit as the limit; refuses evidence older than 60 seconds; and requires a deliberate one-run paper unlock. Live routing remains prohibited.

**Uses:** Safe paper execution, reproducible demonstrations, and testing the complete signal-to-broker workflow.

**Current limitation:** Paper fills can differ from live execution. The runner permits at most two reconciled strategy lifecycles, $500 maximum loss per strategy, $1,000 combined maximum risk, and one strategy per underlying. Any unmatched broker leg or open order blocks another proposal. The scheduled entry branch scans every ten minutes during the configured weekday window, but the Alpaca market clock and fresh-candidate checks remain the final session authority.

### Governed paper-position exits

**Purpose:** Manage up to two filled debit spreads with independent precommitted profit, loss, and time rules rather than discretionary reactions to the account P&L.

**Strengths:** Reconstructs each exact entry from the durable journal; verifies the complete portfolio leg set against the broker; prices each closure conservatively at sell-bid and buy-ask; rejects quotes older than 60 seconds; dry-runs one atomic multi-leg close per triggered strategy; and uses a closing-only process lock that cannot authorize opening intents.

**Uses:** Intraday monitoring, expiration-risk control, complete trade demonstrations, and realized-P&L attribution.

**Current limitation:** Cloudflare dispatches the authenticated GitHub runner every five minutes during the broad US-session window. The Alpaca clock remains the session authority, and the Alpaca market calendar supplies holiday and early-close evidence. Calendar or quote failure blocks rather than guesses.

### Alpaca CLI safety boundary

**Purpose:** Provide structured access to Alpaca while forcing paper routing and blocking mutating commands unless execution is explicitly unlocked.

**Strengths:** Arguments are passed without a shell; live mode is rejected; dry runs remain available while execution is locked.

**Uses:** Account checks, market data, order previews, deliberate paper-order execution, and read-only reconciliation.

**Current limitation:** The CLI runs in the authenticated GitHub Actions job. Availability therefore depends on GitHub Actions, Cloudflare dispatch, Alpaca, and the configured secrets; infrastructure failures are surfaced as workflow failures and deduplicated GitHub Issues.

### Sanitized Alpaca snapshot

**Purpose:** Convert private broker responses into a small product-safe contract containing account health, balances, market clock, positions, and open orders.

**Strengths:** Forces paper mode, converts numeric strings into consistent numbers, removes account IDs and broker order IDs, and can be tested without contacting Alpaca.

**Uses:** Morning readiness checks, dashboard metrics, reconciliation, and later risk-budget calculations.

**Current limitation:** Collection occurs during the automated cycle, but a stale snapshot is evidence about the last successful sync, not proof of current broker state.

### Protected telemetry store

**Purpose:** Persist sanitized paper-account snapshots in a hosted D1 database and serve the newest verified snapshot to the dashboard.

**Strengths:** Alpaca credentials remain local; ingestion uses a separate secret; payload size and schema are validated; duplicate timestamps are ignored; historical snapshots remain available for later audit and analytics.

**Uses:** Durable equity and market-state display, freshness checks, reconciliation, performance history, and evidence for the hackathon demo.

**Current limitation:** Owner-only publishing requires both the site bypass credential and the VolGuard ingest token. When the site becomes public for judges, the bypass credential is no longer needed, but the ingest token remains required.

### Real account dashboard state

**Purpose:** Replace invented account numbers with equity, competition P&L, positions, market clock, block status, drawdown, and telemetry age from the latest sanitized snapshot.

**Strengths:** Honest empty and error states prevent stale or missing data from looking like a valid trading account. Broker identifiers never reach the interface.

**Uses:** Pre-market readiness, intraday situational awareness, and demo credibility.

**Current limitation:** The equity sparkline remains illustrative until the history endpoint is connected, and gross position value is not the same as options maximum loss.

### Decision trace

**Purpose:** Show why a proposed trade passed or failed each risk gate.

**Strengths:** Makes agent behavior inspectable and turns rejected trades into learning material.

**Uses:** Pre-trade review, demonstrations, post-trade analysis, and debugging.

**Current limitation:** The trace shows signal checks, exact legs, council rationales, and all thirteen portfolio-risk gates. Order and exit lifecycle evidence live in the Journal rather than the pre-trade dialog.

### Decision and trade history

**Purpose:** Turn the append-only scan database into a chronological review surface instead of showing only the newest market decision.

**Strengths:** Records candidates, abstentions, and unavailable scans; preserves the first failed gate as the stop reason; bounds the public payload; and labels every signal candidate as “not an order.” Rejected setups therefore become part of the evidence rather than disappearing.

**Uses:** End-of-day review, explaining VolGuard to judges, identifying frequently failed filters, and building a dataset for later expectancy analysis.

**Current limitation:** The journal records entry previews, submissions, fills, governed hold evaluations, closing events, and realized P&L when Alpaca reports a closing fill. Statistical expectancy remains unreliable until more completed paper trades exist.

### Responsive operator interface

**Purpose:** Keep the complete trading workflow usable on phones, tablets, laptops, and large desktop screens instead of treating mobile as a reduced read-only view.

**Strengths:** Phone navigation keeps all six sections available in a touch-friendly bottom bar; metrics stay compact; decision cards stack without horizontal scrolling; long option symbols wrap safely; the decision trace becomes a full-width mobile sheet; and safe-area padding protects controls on notched devices.

**Uses:** Check account readiness away from the desk, review a candidate or abstention on a phone, inspect risk gates on a tablet, and use the denser two-column desk layout for deeper review.

**Current limitation:** Responsive layout does not make broker data continuous. The phone shows the same snapshot age and execution lock as every other device, and the local Alpaca publisher must still run to refresh data.

### Agent pause and execution lock

**Purpose:** Separate analysis from authorization to act.

**Strengths:** A strongly consistent Durable Object state is checked before every scheduled dispatch. Only the token-authenticated GitHub control workflow can change it, and every change requires an audit reason.

**Uses:** Development, abnormal-market conditions, debugging, and end-of-session shutdown.

**Current limitation:** The dashboard exposes pause status read-only. Operators intentionally change it in GitHub Actions so a public browser session never receives the control token.

### Performance evidence and replay

**Purpose:** Separate actual reconciled paper outcomes from historical research evidence.

**Strengths:** Actual statistics count filled closing reconciliations only and report realized P&L, win rate, expectancy, profit factor, and path drawdown. A daily one-year replay compares a deterministic underlying signal with buy-and-hold for SPY, QQQ, IWM, and GLD.

**Uses:** Weekly process review, sample-size tracking, strategy calibration, and honest hackathon evidence.

**Current limitation:** The replay is not an options backtest. It excludes option prices, fills, fees, and slippage, so it must never be presented as expected live performance.

## Product success measures

VolGuard should be evaluated on more than P&L:

- Rule-adherence rate
- Percentage of trades with a written thesis and invalidation condition
- Expected value by setup
- Maximum drawdown
- Average slippage from quoted midpoint
- Profit factor
- Rejected-trade counterfactual performance
- Frequency and causes of risk-gate failures
- System uptime and recovery quality
