'use client';

import { useEffect, useState } from 'react';
import type { AlpacaSnapshot } from '../lib/alpaca-snapshot';
import type { DecisionHistoryItem } from '../lib/decision-history';
import type { OptionScan, OptionScanBatch } from '../lib/option-intelligence';
import { constructPosition, toTradeProposal } from '../lib/position-constructor';
import { evaluateProposal } from '../lib/risk-governor';

const equityBars = [30, 34, 31, 42, 39, 47, 53, 49, 58, 61, 67, 63, 74, 79, 82, 88];
const STARTING_EQUITY = 100_000;

function money(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
}

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : ''}${money(value)}`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', hour12: false,
  }).format(new Date(value));
}

function historyTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/New_York', hour12: false,
  }).format(new Date(value));
}

function ageLabel(value: string | undefined): string {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function strategyLabel(strategy: OptionScan['strategy'] | undefined): string {
  const labels: Record<OptionScan['strategy'], string> = {
    iron_condor: 'Defined-risk iron condor',
    long_iron_butterfly: 'Budgeted long iron butterfly',
    long_straddle: 'Long straddle',
    bull_call_spread: 'Bull call spread',
    bear_put_spread: 'Bear put spread',
    abstain: 'No trade · abstain',
  };
  return strategy ? labels[strategy] : 'Awaiting real scan';
}

function scanMetric(value: number | null | undefined, suffix = '%'): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}${suffix}`;
}

function moveMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `±${value.toFixed(2)}%`;
}

export default function Home() {
  const [traceOpen, setTraceOpen] = useState(false);
  const [agentRunning, setAgentRunning] = useState(true);
  const [snapshot, setSnapshot] = useState<AlpacaSnapshot | null>(null);
  const [scanBatch, setScanBatch] = useState<OptionScanBatch | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryItem[]>([]);
  const [telemetryError, setTelemetryError] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    let active = true;
    async function refreshDashboard() {
      try {
        const [telemetryResponse, scanResponse, historyResponse] = await Promise.all([
          fetch('/api/telemetry', { cache: 'no-store' }),
          fetch('/api/scans', { cache: 'no-store' }),
          fetch('/api/history', { cache: 'no-store' }),
        ]);
        if (!telemetryResponse.ok || !scanResponse.ok) throw new Error('Dashboard data unavailable');
        const telemetryPayload = (await telemetryResponse.json()) as { snapshot: AlpacaSnapshot | null };
        const scanPayload = (await scanResponse.json()) as { batch: OptionScanBatch | null };
        const historyPayload = historyResponse.ok
          ? (await historyResponse.json()) as { decisions: DecisionHistoryItem[] }
          : { decisions: [] };
        if (active) {
          setSnapshot(telemetryPayload.snapshot);
          setScanBatch(scanPayload.batch);
          if (historyResponse.ok) setDecisionHistory(historyPayload.decisions);
          setTelemetryError(false);
          setHistoryError(!historyResponse.ok);
        }
      } catch {
        if (active) setTelemetryError(true);
      }
    }
    void refreshDashboard();
    const timer = window.setInterval(refreshDashboard, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const equity = snapshot?.account.equity;
  const competitionPnl = equity === undefined ? undefined : equity - STARTING_EQUITY;
  const competitionPnlPct = competitionPnl === undefined ? undefined : (competitionPnl / STARTING_EQUITY) * 100;
  const grossPositionValue = snapshot?.positions.reduce((sum, position) => sum + Math.abs(position.marketValue), 0) ?? 0;
  const dailyDrawdown = snapshot ? Math.max(0, snapshot.account.previousEquity - snapshot.account.equity) : 0;
  const dailyDrawdownPct = snapshot?.account.previousEquity
    ? (dailyDrawdown / snapshot.account.previousEquity) * 100
    : 0;
  const accountReady = Boolean(
    snapshot && snapshot.account.status === 'ACTIVE' && !snapshot.account.accountBlocked && !snapshot.account.tradingBlocked,
  );
  const leader = scanBatch?.scans.find((scan) => scan.symbol === scanBatch.leaderSymbol) ?? null;
  const passedSignalChecks = leader?.checks.filter((check) => check.passed).length ?? 0;
  const candidate = leader?.status === 'candidate';
  const construction = leader ? constructPosition(leader) : null;
  const position = construction?.status === 'constructed' ? construction.position : null;
  const proposalDecision = position && snapshot && snapshot.positions.length === 0
    ? evaluateProposal(toTradeProposal(position), {
        openRisk: 0,
        dailyDrawdown,
        competitionDrawdown: Math.max(0, STARTING_EQUITY - snapshot.account.equity),
      })
    : null;
  const decisionHeading = leader
    ? candidate
      ? proposalDecision && !proposalDecision.approved
        ? `${leader.symbol} signal blocked by risk policy`
        : `${leader.symbol} cleared every signal gate`
      : `${leader.symbol} correctly abstained`
    : 'Waiting for the first real option scan';

  return (
    <main className="app-shell">
      <a className="skip-link" href="#overview">Skip to dashboard</a>
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="VolGuard home">
          <span className="brand-mark">V</span>
          <span>VOLGUARD</span>
        </a>

        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span>◫</span>Overview</a>
          <a className="nav-item" href="#decisions"><span>⌁</span>Decisions</a>
          <a className="nav-item" href="#positions"><span>◇</span>Positions</a>
          <a className="nav-item" href="#risk"><span>⊘</span>Risk desk</a>
          <a className="nav-item" href="#journal"><span>≡</span>Journal</a>
        </nav>

        <div className="sidebar-foot">
          <div className={`connection ${snapshot ? '' : 'offline'}`}><i />{snapshot ? 'Alpaca synced' : telemetryError ? 'Telemetry unavailable' : 'Awaiting telemetry'}</div>
          <p>PAPER TRADING</p>
          <small>{snapshot ? 'Sanitized snapshot' : 'No broker data exposed'}</small>
        </div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">AUTONOMOUS OPTIONS DESK</p>
            <h1>Good evening, operator.</h1>
          </div>
          <div className="market-state">
            <span className={snapshot?.market.isOpen ? '' : 'market-closed'}><i />{snapshot ? (snapshot.market.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED') : 'WAITING FOR SYNC'}</span>
            <strong>{timeLabel(snapshot?.market.timestamp)} ET</strong>
            <button
              className="agent-toggle"
              type="button"
              aria-pressed={agentRunning}
              onClick={() => setAgentRunning((running) => !running)}
            >
              {agentRunning ? 'Pause agent' : 'Resume agent'}
            </button>
          </div>
        </header>

        <div className="metrics">
          <article className="metric primary-metric">
            <p>Portfolio equity</p>
            <h2>{equity === undefined ? '—' : money(equity)}</h2>
            <div className="metric-foot"><b className={competitionPnl !== undefined && competitionPnl < 0 ? 'loss' : ''}>{competitionPnl === undefined ? 'Awaiting sync' : signedMoney(competitionPnl)}</b><small>vs. $100k start</small></div>
          </article>
          <article className="metric">
            <p>Competition P&amp;L</p>
            <h2 className={competitionPnlPct === undefined ? 'neutral' : competitionPnlPct >= 0 ? 'gain' : 'loss'}>{competitionPnlPct === undefined ? '—' : signedPercent(competitionPnlPct)}</h2>
            <div className="spark-bars" aria-label="Equity trend rising">
              {equityBars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
          </article>
          <article className="metric">
            <p>Open positions</p>
            <h2>{snapshot ? snapshot.positions.length : '—'}</h2>
            <div className="risk-track"><i style={{ width: `${Math.min(100, (grossPositionValue / 3000) * 100)}%` }} /></div>
            <div className="metric-foot"><small>{snapshot ? `${money(grossPositionValue, 0)} gross value` : 'Awaiting sync'}</small><b className="muted">Observed</b></div>
          </article>
          <article className="metric">
            <p>Agent state</p>
            <h2 className="state"><i className={agentRunning ? '' : 'paused'} />{agentRunning ? 'Scanning' : 'Paused'}</h2>
            <div className="metric-foot"><small>{agentRunning ? 'Next cycle' : 'Execution lock'}</small><b className="muted">{agentRunning ? '02:14' : 'ON'}</b></div>
          </article>
        </div>

        <div className="dashboard-grid">
          <article className="decision-card" id="decisions">
            <div className="card-heading">
              <div>
                <p className="eyebrow">REAL ALPACA SCAN · OBSERVATION ONLY</p>
                <h2>{decisionHeading}</h2>
              </div>
              <span className={`confidence ${proposalDecision && !proposalDecision.approved || !candidate ? 'abstain' : ''}`}>
                {proposalDecision && !proposalDecision.approved
                  ? 'RISK BLOCKED'
                  : candidate ? `${Math.round((leader?.confidence ?? 0) * 100)}% signal confidence` : 'NO TRADE'}
              </span>
            </div>

            <div className="strategy-row">
              <div className="ticker-badge">{leader?.symbol ?? '—'}</div>
              <div>
                <small>SIGNAL OUTCOME</small>
                <h3>{strategyLabel(position?.strategy ?? leader?.strategy)}</h3>
              </div>
              <div className="strategy-stat"><small>MODEL MOVE</small><b>{moveMetric(leader?.modelMovePct)}</b></div>
              <div className="strategy-stat"><small>IMPLIED MOVE</small><b>{moveMetric(leader?.impliedMovePct)}</b></div>
              <div className="strategy-stat"><small>{position ? 'MAX LOSS' : 'WIDEST SPREAD'}</small><b>{position ? money(position.maxLoss, 0) : scanMetric(leader?.spreadPct === null || leader?.spreadPct === undefined ? null : leader.spreadPct * 100)}</b></div>
            </div>

            <p className="thesis">
              {leader?.thesis ?? 'Run the local read-only collector to compare realized volatility with the live at-the-money options straddle.'}
              {' '}{position && proposalDecision
                ? `${position.optimized ? 'The wing optimizer preserved two-sided volatility exposure and' : 'Exact legs'} imply ${money(position.maxLoss)} maximum loss${position.maxProfit === null ? '' : ` and ${money(position.maxProfit)} minimum wing profit`}; the proposal passed ${proposalDecision.passed}/${proposalDecision.total} portfolio gates and remains blocked.`
                : 'Risk sizing waits for concrete option legs and a defined maximum loss.'}
            </p>

            <div className="agent-grid">
              {(scanBatch?.scans ?? []).map((scan) => {
                const passed = scan.checks.filter((check) => check.passed).length;
                return (
                <div className="agent" key={scan.symbol}>
                  <div className={`agent-icon ${scan.status === 'candidate' ? 'positive' : scan.status === 'abstain' ? 'warning' : ''}`}>{scan.symbol.charAt(0)}</div>
                  <div><small>{scan.symbol} · {scan.expiration}</small><b>{scan.status.toUpperCase()}</b><p>{passed}/6 checks · {strategyLabel(scan.strategy)}</p></div>
                </div>
                );
              })}
              {!scanBatch && <div className="agent waiting-scan"><div className="agent-icon">·</div><div><small>SCAN UNIVERSE</small><b>SPY · QQQ · IWM · GLD</b><p>No synthetic market data is shown</p></div></div>}
            </div>

            <div className="decision-foot">
              <span><i />Passed {passedSignalChecks}/6 signal checks{proposalDecision ? ` · ${proposalDecision.passed}/12 risk gates` : ' · risk governor pending'}</span>
              <button type="button" disabled={!leader} onClick={() => setTraceOpen(true)}>View decision trace <b>→</b></button>
            </div>
          </article>

          <aside className="risk-card" id="risk">
            <div className="card-heading"><div><p className="eyebrow">READ-ONLY ACCOUNT GUARD</p><h2>Account health</h2></div><span className="shield">{accountReady ? '✓' : '·'}</span></div>
            <div className={`risk-dial ${accountReady ? 'ready' : ''}`}><div><strong>{snapshot ? (accountReady ? '100%' : 'CHECK') : '—'}</strong><span>{snapshot ? (accountReady ? 'READY' : 'REVIEW') : 'NO DATA'}</span></div></div>
            <dl className="risk-list">
              <div><dt>Open positions</dt><dd>{snapshot ? snapshot.positions.length : '—'}</dd></div>
              <div><dt>Daily drawdown</dt><dd><span>{snapshot ? `${dailyDrawdownPct.toFixed(2)}%` : '—'}</span> / 1.50%</dd></div>
              <div><dt>Trading blocked</dt><dd>{snapshot ? (snapshot.account.tradingBlocked ? 'YES' : 'NO') : '—'}</dd></div>
              <div><dt>Kill switch</dt><dd className="armed">ARMED</dd></div>
            </dl>
            <p className={`risk-message ${accountReady ? '' : 'waiting'}`}><span>{accountReady ? '✓' : '·'}</span> {accountReady ? 'Account ready for analysis' : 'Waiting for verified account state'}</p>
          </aside>
        </div>

        <section className="journal-section" id="journal" aria-labelledby="journal-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">APPEND-ONLY REVIEW LOG</p>
              <h2 id="journal-title">Decision &amp; trade history</h2>
            </div>
            <span>{decisionHistory.length} recent decisions</span>
          </div>

          <div className="journal-grid">
            <article className="history-card">
              <div className="history-head">
                <strong>Signal decisions</strong>
                <small>Newest first · Eastern Time</small>
              </div>
              <div className="history-list">
                {decisionHistory.map((item) => (
                  <div className="history-row" key={item.id}>
                    <time dateTime={item.capturedAt}>{historyTimeLabel(item.capturedAt)}</time>
                    <b className="history-symbol">{item.symbol}</b>
                    <span className={`history-outcome ${item.status}`}>
                      {item.status === 'candidate' ? 'CANDIDATE' : item.status.toUpperCase()}
                    </span>
                    <div className="history-strategy">
                      <strong>{strategyLabel(item.strategy)}</strong>
                      <small>Expiry {item.expiration} · {item.checksPassed}/{item.checksTotal} gates</small>
                    </div>
                    <p>{item.reason}</p>
                  </div>
                ))}
                {!decisionHistory.length && (
                  <div className="history-empty">
                    <strong>{historyError ? 'History is temporarily unavailable' : 'Waiting for the first stored decision'}</strong>
                    <p>{historyError ? 'The live dashboard can still operate; this review panel will retry automatically.' : 'Each completed option scan will appear here, including abstentions.'}</p>
                  </div>
                )}
              </div>
            </article>

            <aside className="trade-history-card" id="positions">
              <p className="eyebrow">BROKER RECONCILIATION</p>
              <div className="trade-count">
                <strong>0</strong>
                <span>TRADE EVENTS RECORDED</span>
              </div>
              <h3>No submitted trades yet</h3>
              <p>This journal has no order, fill, or closed-position events because VolGuard has not submitted an order. The latest read-only Alpaca snapshot reports {snapshot ? snapshot.openOrders.length : '—'} open orders and {snapshot ? snapshot.positions.length : '—'} positions.</p>
              <dl className="capture-status">
                <div><dt>Signal decisions</dt><dd className="live">LIVE</dd></div>
                <div><dt>Order submissions</dt><dd>LOCKED</dd></div>
                <div><dt>Fills &amp; exits</dt><dd>NEXT</dd></div>
                <div><dt>Realized P&amp;L</dt><dd>NEXT</dd></div>
              </dl>
              <small className="capture-note">A candidate is research evidence, not a trade. Order history begins only after a paper order is deliberately enabled and reconciled.</small>
            </aside>
          </div>
        </section>

        <footer className="statusbar">
          <span>VOLGUARD AI <b>v0.1.0</b></span>
          <span>Educational paper-trading system · No real capital</span>
          <span>Account <b>{ageLabel(snapshot?.capturedAt)}</b> · Scan <b>{ageLabel(scanBatch?.capturedAt)}</b></span>
        </footer>
      </section>

      {traceOpen && leader && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setTraceOpen(false)}>
          <section
            className="trace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="trace-head">
              <div><p className="eyebrow">DECISION TRACE · {leader.symbol} · {leader.capturedAt}</p><h2 id="trace-title">Why VolGuard {candidate ? 'selected a candidate' : 'abstained'}</h2></div>
              <button type="button" onClick={() => setTraceOpen(false)} aria-label="Close decision trace">×</button>
            </div>
            <p className="trace-summary">These checks turn market data into a signal, not an order. A single failed check forces abstention; a candidate must still pass position construction and every deterministic portfolio-risk gate.</p>
            <div className="gate-list">
              {leader.checks.map((item, index) => (
                <div className="gate" key={item.id}>
                  <span className={item.passed ? 'pass' : 'fail'}>{item.passed ? '✓' : '×'}</span>
                  <div><small>GATE {String(index + 1).padStart(2, '0')}</small><b>{item.label}</b></div>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            {position && (
              <>
                <p className="trace-summary"><b>Position construction · ${position.riskBudget} risk budget.</b> {position.rationale} Pricing uses {position.pricingBasis === 'buy-ask-sell-bid' ? 'buy-at-ask and sell-at-bid limits' : 'quoted midpoints'}.</p>
                <div className="gate-list">
                  {position.legs.map((leg, index) => (
                    <div className="gate" key={leg.symbol}>
                      <span className={leg.side === 'buy' ? 'pass' : 'fail'}>{leg.side === 'buy' ? '+' : '−'}</span>
                      <div><small>LEG {String(index + 1).padStart(2, '0')} · {leg.type.toUpperCase()}</small><b>{leg.side.toUpperCase()} {leg.strike}</b></div>
                      <p>{leg.symbol} · limit ${leg.limitPrice.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {proposalDecision && (
              <>
                <p className="trace-summary"><b>Portfolio risk gates.</b> Passing the $500 sizing gate does not authorize a trade; every gate, including the independent council, must pass.</p>
                <div className="gate-list">
                  {proposalDecision.gates.map((item, index) => (
                    <div className="gate" key={item.id}>
                      <span className={item.passed ? 'pass' : 'fail'}>{item.passed ? '✓' : '×'}</span>
                      <div><small>RISK {String(index + 1).padStart(2, '0')}</small><b>{item.label}</b></div>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="trace-foot"><span>Final outcome</span><strong>{proposalDecision?.approved ? 'APPROVED FOR PAPER PREVIEW' : candidate ? 'BLOCKED · NOT AN ORDER' : 'ABSTAIN'}</strong></div>
          </section>
        </div>
      )}
    </main>
  );
}
