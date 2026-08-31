# Trading Routine

This is the routine VolGuard is being designed to support. It is a paper-trading routine until a sufficiently large, realistic sample demonstrates stable execution and risk control.

## Before the market

### 1. Readiness check

- Confirm paper profile and account status.
- Confirm execution lock state.
- Confirm telemetry is recent enough for the intended decision; treat a stale or missing sync as a no-trade condition.
- Check market hours and scheduled economic events.
- Verify that option quotes and feeds are available.
- Review current positions, overnight gaps, and total risk.

**Reasoning:** Operational mistakes can look like strategy failures. Readiness checks isolate the two.

The dashboard's “last sync” label tells you the age of the evidence, not that Alpaca is continuously connected. Refresh the local snapshot before relying on account, position, or market-state values.

### 2. Define the session risk budget

- Maximum theoretical loss per new trade: $500 in the $100,000 competition account.
- Maximum total open risk: $3,000.
- Daily drawdown stop: $1,500.
- Competition drawdown kill switch: $4,000.
- Maximum two correlated positions.

**Reasoning:** The risk budget is decided before opportunity and emotion arrive.

### 3. Mark the event regime

Classify the session as ordinary, earnings-driven, macro-event, or abnormal-liquidity. Identify periods when no new position should be opened.

## During the market

### 4. Scan a constrained universe

Begin with SPY, QQQ, IWM, and GLD. GLD is the liquid, Alpaca-supported gold proxy; it is not the same instrument as spot XAUUSD.

**Reasoning:** A small liquid universe makes execution and attribution easier to evaluate.

Run `npm run scan:options` only as an observation step. For each symbol, read the six-check trace in order:

1. Market session: closed markets are observation-only.
2. Historical model: insufficient clean bars invalidate the comparison.
3. ATM pair: both a call and put must have usable quotes at the same strike.
4. Execution quality: wide spreads or low combined volume make the apparent edge unreliable.
5. Freshness: stale quotes cannot support an entry decision.
6. Strategy edge: the implied/model relationship must clear an explicit threshold.

An abstention is a completed decision, not a failed run. Record why it abstained; do not weaken a gate merely to create activity.

When a signal passes, construct the exact position before discussing execution. For a long straddle, maximum loss is the call premium plus put premium, multiplied by 100 shares and quantity. If the smallest valid contract unit exceeds the session's per-trade budget, the trade is blocked; confidence cannot resize an indivisible option contract.

For an oversized two-sided volatility signal, run the wing optimizer before giving up on the thesis. It buys the ATM call and put, then searches for a liquid lower put wing and upper call wing near the modeled move. Risk is calculated conservatively by buying at each ask and selling at each bid. The resulting reverse iron butterfly is eligible only when:

- Every leg is fresh, quoted, and within the 12% spread policy.
- Each wing has at least 10 contracts of observed daily volume.
- Worst-case net debit is $500 or less.
- The narrower wing still produces a positive expiration profit beyond its strike.

This structure preserves two-sided volatility exposure while capping both loss and profit. It introduces four-leg fill and pin risk, so never leg into it manually; the future execution step must preview one complex paper order. If no valid wing combination exists, retain the original straddle only as evidence for a deterministic risk block.

### 5. Form a falsifiable thesis

Every proposal must state:

- What the market appears to misprice
- Expected holding period
- Maximum loss
- Conditions required for entry
- A specific invalidation condition
- Planned profit, loss, and time exits

The option scan supplies a market hypothesis, expiration, ATM evidence, and suggested strategy family. Candidate scans also carry a bounded set of sanitized contract quotes for sizing. Constructing the final legs and maximum loss remains a separate step so signal excitement cannot bypass sizing.

### 6. Run the agent council

The Regime, Volatility, Catalyst, and Red-Team roles provide independent structured assessments. Disagreement is preserved rather than averaged away.

### 7. Apply deterministic gates

The proposal must pass every gate. Confidence cannot compensate for a failed risk or liquidity condition.

### 8. Preview execution

Use a dry run first. Check contract symbols, leg intentions, quantity, limit price, maximum loss, and client order ID.

### 9. Monitor the thesis

Monitor fills, spread quality, Greeks, total exposure, event changes, and the invalidation condition. Do not manage a trade solely by watching unrealized P&L.

## After the market

### 10. Reconcile

Match proposals, orders, fills, positions, and account activity. An unexplained mismatch is an operational incident.

Preserve the final telemetry snapshot for the session. The append-only history makes it possible to reconstruct what the dashboard knew at a particular time instead of silently replacing earlier evidence.

### 11. Review process before outcome

Grade rule adherence before looking at whether the trade won or lost. A compliant loss may be a good trade; a profitable rule violation remains a process failure.

### 12. Write the daily report

Record:

- Session P&L and drawdown
- Exposure by underlying and strategy
- Best and worst decision
- Rejected opportunities
- Execution problems
- One improvement for the next session

## Weekly review

- Calculate expectancy by setup.
- Compare actual versus modeled moves.
- Review maximum adverse and favorable excursion.
- Identify which agent warnings were useful.
- Review all rule violations and manual overrides.
- Change a strategy rule only when the evidence and sample justify it.

## Graduation criteria for considering minimal live capital

There is no automatic graduation date. At minimum, require a meaningful sample of realistic paper trades, positive expectancy after estimated costs, acceptable drawdown, high rule adherence, and reliable operational recovery. Hackathon performance alone is not sufficient evidence.
