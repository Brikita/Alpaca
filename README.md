# VolGuard AI

VolGuard is an autonomous, risk-governed options agent for the Alpaca AI Trading Agents Hackathon. It is designed exclusively for Alpaca paper trading.

## Current milestone

- Judge-facing command-center dashboard
- Volatility-regime strategy selector
- Twelve deterministic risk gates
- Alpaca CLI boundary with a paper-only assertion and execution lock
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

## Connect Alpaca paper trading

1. Install the official Alpaca CLI and verify `alpaca version`.
2. Copy `.env.example` to `.env.local` and add paper-account credentials.
3. Keep `ALPACA_LIVE_TRADE=false`.
4. Use CLI `--dry-run` order previews while validating contracts and limits.
5. Set `VOLGUARD_EXECUTION_ENABLED=paper` only when the fresh competition account and every risk gate have been verified.

The adapter passes CLI arguments without a shell, forces paper routing in the child process, expects structured JSON, and blocks mutating commands unless the explicit paper execution lock is open.

## Safety

This project is an educational paper-trading system. It is not investment advice and must not be connected to real capital.
