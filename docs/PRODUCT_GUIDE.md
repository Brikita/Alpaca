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

**Current limitation:** The inputs are not yet connected to live Alpaca option-chain data.

### Twelve-gate risk governor

**Purpose:** Block any proposal that violates paper-only mode, defined-risk policy, exposure limits, liquidity requirements, quote freshness, or agent-consensus rules.

**Strengths:** Deterministic, auditable, and independent of model persuasion. One failed gate blocks execution.

**Uses:** Pre-trade approval, incident analysis, and judge-facing explanation.

**Current limitation:** Portfolio and quote values on the dashboard are representative until the read-only data layer is connected.

### Alpaca CLI safety boundary

**Purpose:** Provide structured access to Alpaca while forcing paper routing and blocking mutating commands unless execution is explicitly unlocked.

**Strengths:** Arguments are passed without a shell; live mode is rejected; dry runs remain available while execution is locked.

**Uses:** Account checks, market data, order previews, and later paper-order execution.

**Current limitation:** The installed CLI is authenticated, but the hosted dashboard is not yet consuming its output.

### Sanitized Alpaca snapshot

**Purpose:** Convert private broker responses into a small product-safe contract containing account health, balances, market clock, positions, and open orders.

**Strengths:** Forces paper mode, converts numeric strings into consistent numbers, removes account IDs and broker order IDs, and can be tested without contacting Alpaca.

**Uses:** Morning readiness checks, dashboard metrics, reconciliation, and later risk-budget calculations.

**Current limitation:** The snapshot is collected on demand by the local runner. Durable publishing to the hosted dashboard is the next step.

### Decision trace

**Purpose:** Show why a proposed trade passed or failed each risk gate.

**Strengths:** Makes agent behavior inspectable and turns rejected trades into learning material.

**Uses:** Pre-trade review, demonstrations, post-trade analysis, and debugging.

**Current limitation:** The displayed proposal is representative rather than generated from a live scan.

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
