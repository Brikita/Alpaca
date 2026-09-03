# VolGuard AI

VolGuard is an autonomous, risk-governed options agent for the Alpaca AI Trading Agents Hackathon. It is designed exclusively for Alpaca paper trading.

## Current milestone

- Judge-facing command-center dashboard
- Volatility-regime strategy selector
- Fourteen deterministic risk gates, including minimum payoff quality
- Alpaca CLI boundary with a paper-only assertion and execution lock
- Sanitized read-only Alpaca account snapshot
- Real SPY/QQQ/IWM/GLD option intelligence with explicit abstention
- Conservative four-leg wing optimization against a fixed maximum-loss budget
- Responsive phone, tablet, landscape, and desktop operator interface
- Protected append-only scan evidence for the hosted dashboard
- Governed hold, profit, loss, and pre-expiration exit decisions
- Atomic closing-order previews with a separate paper-only exit lock
- Entry, monitoring, exit, and realized-P&L lifecycle evidence
- Verified Alpaca news catalyst gate and exchange holiday/early-close calendar
- D1-backed Decision Memory agent requiring repeated open-market confirmation before new paper entries
- Strongly consistent Cloudflare Durable Object controls: pause entries while exits continue, or explicitly halt all automation
- GitHub Issue alerts for failures, safety holds, and accepted paper trades
- Reconciled-trade performance analytics and a daily one-year underlying-signal replay with buy-and-hold baselines
- Automated strategy, risk, and safety tests

## Run the dashboard

```powershell
npm install
npm run dev
```

## Run the tests

```powershell
npm test
```

Collect a sanitized read-only paper snapshot:

```powershell
npm run snapshot:alpaca
```

Collect a paper-only option scan and publish it when the local environment is configured:

```powershell
npm run scan:options
```

The scanner compares a recent realized-volatility model with the current at-the-money call-plus-put price, then enforces market-session, history, paired-quote, liquidity, freshness, and edge checks. A candidate is analysis only; it is not an order.

## Connect Alpaca paper trading

1. Install the official Alpaca CLI and verify `alpaca version`.
2. Copy `.env.example` to `.env.local` and add paper-account credentials.
3. Keep `ALPACA_LIVE_TRADE=false`.
4. Use CLI `--dry-run` order previews while validating contracts and limits.
5. Set `VOLGUARD_EXECUTION_ENABLED=paper` only when the fresh competition account and every risk gate have been verified.

The adapter passes CLI arguments without a shell, forces paper routing in the child process, expects structured JSON, and blocks mutating commands unless the explicit paper execution lock is open.

Monitor up to two matched open paper strategies:

```powershell
npm run monitor:position
```

The monitor uses fresh two-sided quotes, verifies that every recorded option leg across up to two strategies still matches the broker positions, and evaluates each lifecycle independently. It records a hold unless that strategy reaches its 50% profit-capture target, 50%-of-debit loss limit, or one-hour-before-close exit on the verified prior Alpaca trading session. Closing submission uses the separate one-process `VOLGUARD_EXIT_ENABLED=paper` lock and reverses only that strategy's legs in one multi-leg order.

A Cloudflare Worker dispatches one authenticated GitHub Actions paper cycle every five minutes only between 9:25 AM and 4:00 PM New York time on weekdays, with daylight-saving time handled at the Worker boundary. Every active run monitors exits and reconciles broker orders; every other run also refreshes the account, scans SPY/QQQ/IWM/GLD, and attempts one paper entry. The entry branch therefore runs every ten minutes and still requires an open Alpaca market, valid current timestamps, verified catalyst clearance, Decision Memory confirmation, available portfolio capacity, an atomic dry run, approval from all five specialists, and all fourteen risk gates. The payoff-quality gate requires at least $0.25 theoretical maximum profit for each $1.00 of defined maximum loss; the constructor rejects weaker capped structures before the council can authorize them. Memory examines up to six D1-stored observations from the last 60 minutes and requires at least two scans to agree on symbol, strategy, and direction with 60% or greater agreement; it can confirm a current candidate but can never turn an abstention into a trade. The authenticated control workflow can pause only new entries while protective monitoring continues, explicitly halt all automation, or resume it; queued runners recheck that state before submitting. Alpaca's clock and calendar remain authoritative for holidays and early closes; a scheduled wake-up is never itself permission to trade.

The daily replay uses one year of Alpaca underlying bars to compare a deterministic five-session signal with a passive baseline. It is deliberately separate from reconciled paper option results and explicitly excludes option pricing, fills, fees, and slippage.

## Hackathon submission kit

- [One-page write-up](docs/SUBMISSION_WRITEUP.md)
- [Submission form copy](docs/SUBMISSION_COPY.md)
- [Demo video script](docs/VIDEO_SCRIPT.md)
- [Judge presentation deck](docs/VolGuard_Hackathon_Deck.pptx)
- [Submission-day checklist](docs/SUBMISSION_CHECKLIST.md)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before moving the dashboard to Vercel or attaching a portfolio subdomain. The current hosted persistence adapter uses Cloudflare D1 and needs an explicit Vercel storage replacement.

## Safety

This project is an educational paper-trading system. It is not investment advice and must not be connected to real capital.
