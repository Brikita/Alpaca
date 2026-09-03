# VolGuard AI demo video script

Target length: **3 minutes 15 seconds**. Record at 1080p, keep browser zoom at 100%, close unrelated tabs and notifications, and never expose API keys, ingest tokens, or a full account identifier.

## 0:00–0:20 — Open on slide 1

**Narration:**

“Most trading bots are optimized to place trades. VolGuard AI is optimized to deserve them. It is an autonomous, risk-governed options desk built on Alpaca paper trading, and every trade—or decision not to trade—leaves an inspectable evidence trail.”

## 0:20–0:45 — Show the live Overview page

Point to the paper-trading label, fresh account sync, market state, open-strategy count, and timezone selector.

**Narration:**

“This is a fresh one-hundred-thousand-dollar Alpaca competition paper account. The browser receives sanitized account and market state, but never broker credentials. The dashboard is responsive across desktop and phone, and I can review it in East Africa Time, Eastern Time, or UTC.”

## 0:45–1:15 — Show slide 2, then the Decisions page

**Narration:**

“Every cycle scans SPY, QQQ, IWM, and GLD. The signal model compares recent realized movement with the live at-the-money options price, then checks the session, history, paired quotes, liquidity, freshness, and edge. If any check fails, VolGuard records an abstention. No synthetic market signal is substituted.”

Open one decision trace only if current telemetry is visible. Point to exact contracts, council votes, and gate results.

## 1:15–1:45 — Show slide 3

**Narration:**

“A candidate still cannot trade. The constructor chooses exact defined-risk legs and prices buys at the ask and sells at the bid. Five transparent specialists test regime, volatility, catalysts, recent decision memory, and failure modes. Memory requires two matching open-market scans in the last hour and can veto a first sighting or conflicting setup. Then fourteen deterministic gates enforce paper mode, covered shorts, expiry, payoff quality, quote quality, confidence, drawdown, capacity, and the loss budget. The agent can hold at most two strategies, five hundred dollars risk each, and one thousand dollars combined.”

## 1:45–2:15 — Show slide 4, then Positions or Journal

**Narration:**

“Here is the second real execution, which proved the complete memory-enabled path. On September third, GLD was confirmed in six of six scans over fifty minutes. All five specialists and all thirteen gates that existed at execution approved a 407–412–417 long iron butterfly. Alpaca filled the atomic paper order at four dollars fifty-five, and the next monitoring cycle matched all four legs and recorded HOLD.”

“The evidence also exposed a weakness: the proposed maximum reward was only twenty-four dollars against four hundred seventy-six dollars of maximum loss. We did not hide it. We added a fourteenth payoff-quality gate and a matching Red Team veto, so future capped positions must offer at least twenty-five cents of theoretical reward for every dollar at risk.”

Point to the submitted event, fill, exact broker-leg reconciliation, and most recent HOLD event. Do not describe an unrealized mark as realized profit.

## 2:15–2:40 — Show slide 5 and the Risk page

**Narration:**

“Entry is only half of the system. Every five minutes, a Cloudflare Worker dispatches one authenticated GitHub Actions paper cycle. Every run matches existing strategies to the broker and evaluates their exits. Every other run also refreshes the account and scans for a new position, so entry opportunities are checked every ten minutes. A new paper order still requires an open market, fresh evidence, memory confirmation, free capacity, council approval, and all fourteen gates.”

## 2:40–3:05 — Show slide 6 and Journal

**Narration:**

“The Journal keeps scans, abstentions, approvals, submissions, fills, holds, exits, and realized results in one append-only review trail. That makes VolGuard more than a hackathon demo: it is a deliberate-practice tool I can use to build a disciplined trading routine without hiding the system’s mistakes.”

## 3:05–3:15 — Return to closing slide

**Narration:**

“VolGuard is autonomous enough to act, constrained enough to abstain, and transparent enough to improve. That is risk-governed autonomy for options trading.”

## Recording checklist

- Confirm the live site shows current telemetry before recording every app segment.
- Use the working Sites URL unless a Vercel migration has passed all API and persistence checks.
- Show the Alpaca paper dashboard briefly only if useful; hide the account ID and all credentials.
- Keep the real order language precise: “paper order,” “filled at $4.55 average debit,” “realized loss” for closed outcomes, and “unrealized” for changing marks.
- Never replace actual performance with assumed profit. If an illustrative scenario is used, label it “illustrative — not actual performance” on screen.
- Avoid promising profitability. Emphasize decision quality, risk controls, reconciliation, and evidence.
- Export in MP4/H.264 at 1080p and listen once for clipped audio before uploading.
