# Submission form copy

## Project title

VolGuard AI

## Tagline

An autonomous, risk-governed options desk that knows when not to trade.

## Short description

VolGuard scans live Alpaca options, abstains when evidence is weak, and governs atomic paper trades through thirteen risk gates and automated lifecycle monitoring.

## Long description

VolGuard AI is an autonomous options desk built on Alpaca paper trading. It scans SPY, QQQ, IWM, and GLD; compares realized and implied movement; and records both candidates and abstentions. Exact defined-risk legs are priced conservatively before a four-role specialist council and a thirteen-gate deterministic governor decide whether the proposal may proceed.

Approved entries are validated through the Alpaca CLI as atomic multi-leg dry runs before an explicitly unlocked paper submission. Broker legs are reconciled to an append-only strategy ledger, and an automated five-minute monitor independently applies profit, loss, and pre-expiration time exits to as many as two open strategies. Live routing is prohibited.

The deployed dashboard makes the full reasoning chain inspectable across Decisions, Positions, Risk, and Journal views. Sanitized telemetry is stored in Cloudflare D1, while brokerage credentials remain confined to the paper-only runner. VolGuard demonstrates that a useful trading agent is not merely able to place orders—it can explain its evidence, cap its loss before entry, refuse poor setups, and preserve a reviewable history for deliberate practice.

## Suggested technology tags

AI Agents, Algorithmic Trading, Options, Fintech, Risk Management, Alpaca, TypeScript, Next.js, Cloudflare Workers, Cloudflare D1, GitHub Actions

## Links and identifiers

- Public repository: https://github.com/Brikita/Alpaca
- Working demo: https://volguard-ai.briankinyua0101.chatgpt.site
- Video: **ADD FINAL VIDEO URL**
- Slide deck: **ADD PUBLIC SLIDE URL OR UPLOAD**
- Alpaca paper account ID: **ENTER ONLY IN THE PRIVATE SUBMISSION FIELD**
- Cover image candidate: `public/og.png`

## Judging alignment

- **P&L:** A fresh $100,000 competition paper account with a real atomic GLD options fill and continuing lifecycle evidence.
- **Technology:** Alpaca CLI and Trading API, real options data, atomic multi-leg orders, protected ingestion, Cloudflare D1, a Cloudflare scheduler, and GitHub Actions.
- **Creativity:** Transparent specialist agents plus a deterministic governor that treats abstention as a first-class decision.
- **Execution:** A responsive, deployed dashboard with append-only evidence, broker reconciliation, and automated position monitoring.
- **Social engagement:** Add up to five launch, demo, build-thread, or result posts if time permits; this is useful but optional.
