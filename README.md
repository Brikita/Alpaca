# VolGuard AI

VolGuard is an autonomous, risk-governed options agent for the Alpaca AI Trading Agents Hackathon. It is designed exclusively for Alpaca paper trading.

## Current milestone

- Judge-facing command-center dashboard
- Volatility-regime strategy selector
- Twelve deterministic risk gates
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

Monitor the one matched open paper spread:

```powershell
npm run monitor:position
```

The monitor uses fresh two-sided quotes, verifies that every recorded option leg still matches the broker positions, and records a hold unless the 50% profit-capture target, 50%-of-debit loss limit, or 3:00 PM ET prior-weekday time exit is reached. Closing submission uses the separate one-process `VOLGUARD_EXIT_ENABLED=paper` lock and reverses all legs in one multi-leg order.

The active VolGuard heartbeat runs this monitor every 15 minutes on weekdays. The script still checks the broker market clock and every safety condition, so a scheduled wake-up is not itself permission to trade.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before moving the dashboard to Vercel or attaching a portfolio subdomain. The current hosted persistence adapter uses Cloudflare D1 and needs an explicit Vercel storage replacement.

## Safety

This project is an educational paper-trading system. It is not investment advice and must not be connected to real capital.
