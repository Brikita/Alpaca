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

**Purpose:** Read SPY, QQQ, and IWM market data through the authenticated Alpaca CLI, estimate a model move to the target Friday, measure the option-implied move from the nearest quoted call/put pair, and select a defined-risk strategy or abstain.

**Strengths:** Uses broker-sourced evidence rather than demo numbers; requests the subscription-compatible IEX feed for stock history; keeps raw chains and credentials local; records all six signal checks; fails closed when the market, history, quote pair, liquidity, freshness, or edge is inadequate.

**Uses:** Pre-market watchlist preparation, intraday opportunity filtering, comparing realized and implied volatility, and building a dataset of both selected and rejected opportunities.

**Current limitation:** A selected strategy is not yet a fully specified trade. Contract legs, limit price, maximum loss, portfolio overlap, and deterministic risk approval must exist before any order preview.

### Six-check signal trace

**Purpose:** Explain whether market session, model history, ATM pairing, execution quality, quote freshness, and strategy edge passed for each scan.

**Strengths:** Makes abstention diagnosable and separates a data-quality failure from a lack of trading edge.

**Uses:** Decide whether to investigate a setup, diagnose stale feeds, and review which filter prevented low-quality trades.

**Current limitation:** These are signal checks, not the twelve portfolio-risk gates. Passing them only creates a candidate for the next stage.

### Twelve-gate risk governor

**Purpose:** Block any proposal that violates paper-only mode, defined-risk policy, exposure limits, liquidity requirements, quote freshness, or agent-consensus rules.

**Strengths:** Deterministic, auditable, and independent of model persuasion. One failed gate blocks execution.

**Uses:** Pre-trade approval, incident analysis, and judge-facing explanation.

**Current limitation:** The governor is intentionally not invoked by a scan alone. It requires concrete option legs and a calculated maximum loss, which are part of the next milestone.

### Alpaca CLI safety boundary

**Purpose:** Provide structured access to Alpaca while forcing paper routing and blocking mutating commands unless execution is explicitly unlocked.

**Strengths:** Arguments are passed without a shell; live mode is rejected; dry runs remain available while execution is locked.

**Uses:** Account checks, market data, order previews, and later paper-order execution.

**Current limitation:** The CLI runs on the local Windows runner, so continuous updates require that runner or a scheduled local task to be online.

### Sanitized Alpaca snapshot

**Purpose:** Convert private broker responses into a small product-safe contract containing account health, balances, market clock, positions, and open orders.

**Strengths:** Forces paper mode, converts numeric strings into consistent numbers, removes account IDs and broker order IDs, and can be tested without contacting Alpaca.

**Uses:** Morning readiness checks, dashboard metrics, reconciliation, and later risk-budget calculations.

**Current limitation:** Collection is on demand until a scheduler is added. A stale snapshot is evidence about the last sync, not proof of current broker state.

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

**Current limitation:** The current trace explains signal eligibility. A second trace will show the twelve portfolio-risk gates once position construction exists.

### Agent pause and execution lock

**Purpose:** Separate analysis from authorization to act.

**Strengths:** The system can continue to collect information while execution remains blocked.

**Uses:** Development, abnormal-market conditions, debugging, and end-of-session shutdown.

**Current limitation:** The interface state is not yet connected to a persistent runner process.

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
