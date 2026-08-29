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
