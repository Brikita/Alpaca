# VolGuard AI

VolGuard is an autonomous, risk-governed options agent for the Alpaca AI Trading Agents Hackathon. It is designed exclusively for Alpaca paper trading.

## Current milestone

- Judge-facing command-center dashboard
- Volatility-regime strategy selector
- Thirteen deterministic risk gates
- Alpaca CLI boundary with a paper-only assertion and execution lock
- Sanitized read-only Alpaca account snapshot
- Real SPY/QQQ/IWM/GLD option intelligence with explicit abstention
- Conservative four-leg wing optimization against a fixed maximum-loss budget
- Responsive phone, tablet, landscape, and desktop operator interface
- Protected append-only scan evidence for the hosted dashboard
- Governed hold, profit, loss, and pre-expiration exit decisions
- Atomic closing-order previews with a separate paper-only exit lock
- Entry, monitoring, exit, and realized-P&L lifecycle evidence
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

The monitor uses fresh two-sided quotes, verifies that every recorded option leg across up to two strategies still matches the broker positions, and evaluates each lifecycle independently. It records a hold unless that strategy reaches its 50% profit-capture target, 50%-of-debit loss limit, or 3:00 PM ET prior-weekday time exit. Closing submission uses the separate one-process `VOLGUARD_EXIT_ENABLED=paper` lock and reverses only that strategy's legs in one multi-leg order.

A Cloudflare Worker dispatches one authenticated GitHub Actions paper cycle every five minutes on trading weekdays. Every run monitors exits and reconciles broker orders; every other run also refreshes the account, scans SPY/QQQ/IWM/GLD, and attempts one paper entry. The entry branch therefore runs every ten minutes and still requires an open Alpaca market, fresh evidence, available portfolio capacity, an atomic dry run, council approval, and all thirteen risk gates. A scheduled wake-up is never itself permission to trade.

## Hackathon submission kit

- [One-page write-up](docs/SUBMISSION_WRITEUP.md)
- [Submission form copy](docs/SUBMISSION_COPY.md)
- [Demo video script](docs/VIDEO_SCRIPT.md)
- [Judge presentation deck](docs/VolGuard_Hackathon_Deck.pptx)
- [Submission-day checklist](docs/SUBMISSION_CHECKLIST.md)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before moving the dashboard to Vercel or attaching a portfolio subdomain. The current hosted persistence adapter uses Cloudflare D1 and needs an explicit Vercel storage replacement.

## Safety

This project is an educational paper-trading system. It is not investment advice and must not be connected to real capital.
