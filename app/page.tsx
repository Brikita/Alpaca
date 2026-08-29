'use client';

import { useEffect, useState } from 'react';
import type { AlpacaSnapshot } from '../lib/alpaca-snapshot';
import type { TradeProposal } from '../lib/domain';
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

function ageLabel(value: string | undefined): string {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const agents = [
  { name: 'Regime', verdict: 'Approve', note: 'Event-driven · 82%', tone: 'positive' },
  { name: 'Volatility', verdict: 'Approve', note: 'Implied move rich', tone: 'positive' },
  { name: 'Catalyst', verdict: 'Caution', note: 'Payrolls in 4 days', tone: 'warning' },
  { name: 'Red team', verdict: 'Cleared', note: 'Risk remains defined', tone: 'neutral' },
];

const demoProposal: TradeProposal = {
  id: 'spy-iron-condor-20260828-1430',
  symbol: 'SPY',
  strategy: 'iron_condor',
  maxLoss: 420,
  definedRisk: true,
  nakedShort: false,
  expiresToday: false,
  paperAccount: true,
  spreadPct: 0.06,
  quoteAgeSeconds: 8,
  correlationSlotsAfter: 1,
  confidence: 0.76,
  votes: [
    { agent: 'regime', approved: true, confidence: 0.82, rationale: 'Event-driven regime' },
    { agent: 'volatility', approved: true, confidence: 0.78, rationale: 'Implied move is rich' },
    { agent: 'catalyst', approved: false, confidence: 0.62, rationale: 'Payroll event ahead' },
    { agent: 'red_team', approved: true, confidence: 0.71, rationale: 'Every loss boundary is defined' },
  ],
};

const riskDecision = evaluateProposal(demoProposal, {
  openRisk: 920,
  dailyDrawdown: 180,
  competitionDrawdown: 0,
});

export default function Home() {
  const [traceOpen, setTraceOpen] = useState(false);
  const [agentRunning, setAgentRunning] = useState(true);
  const [snapshot, setSnapshot] = useState<AlpacaSnapshot | null>(null);
  const [telemetryError, setTelemetryError] = useState(false);

  useEffect(() => {
    let active = true;
    async function refreshTelemetry() {
      try {
        const response = await fetch('/api/telemetry', { cache: 'no-store' });
        if (!response.ok) throw new Error('Telemetry unavailable');
        const payload = (await response.json()) as { snapshot: AlpacaSnapshot | null };
        if (active) {
          setSnapshot(payload.snapshot);
          setTelemetryError(false);
        }
      } catch {
        if (active) setTelemetryError(true);
      }
    }
    void refreshTelemetry();
    const timer = window.setInterval(refreshTelemetry, 30_000);
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

  return (
    <main className="app-shell">
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
                <p className="eyebrow">SIMULATED DECISION · TRAINING EXAMPLE</p>
                <h2>SPY volatility is overpriced</h2>
              </div>
              <span className="confidence">76% confidence</span>
            </div>

            <div className="strategy-row">
              <div className="ticker-badge">SPY</div>
              <div>
                <small>PROPOSED STRATEGY</small>
                <h3>Defined-risk iron condor</h3>
              </div>
              <div className="strategy-stat"><small>MODEL MOVE</small><b>±0.74%</b></div>
              <div className="strategy-stat"><small>IMPLIED MOVE</small><b>±1.18%</b></div>
              <div className="strategy-stat"><small>MAX LOSS</small><b>$420</b></div>
            </div>

            <p className="thesis">Options imply a move 59% wider than VolGuard’s event-adjusted range. Momentum is neutral, liquidity is healthy, and every loss boundary is known before entry.</p>

            <div className="agent-grid">
              {agents.map((agent) => (
                <div className="agent" key={agent.name}>
                  <div className={`agent-icon ${agent.tone}`}>{agent.name.charAt(0)}</div>
                  <div><small>{agent.name}</small><b>{agent.verdict}</b><p>{agent.note}</p></div>
                </div>
              ))}
            </div>

            <div className="decision-foot">
              <span><i />Passed {riskDecision.passed}/{riskDecision.total} deterministic gates</span>
              <button type="button" onClick={() => setTraceOpen(true)}>View decision trace <b>→</b></button>
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

        <footer className="statusbar">
          <span>VOLGUARD AI <b>v0.1.0</b></span>
          <span>Educational paper-trading system · No real capital</span>
          <span>Last sync <b>{ageLabel(snapshot?.capturedAt)}</b></span>
        </footer>
      </section>

      {traceOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setTraceOpen(false)}>
          <section
            className="trace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="trace-head">
              <div><p className="eyebrow">DECISION TRACE · {demoProposal.id}</p><h2 id="trace-title">Why this trade passed</h2></div>
              <button type="button" onClick={() => setTraceOpen(false)} aria-label="Close decision trace">×</button>
            </div>
            <p className="trace-summary">The AI council can propose a trade, but it cannot override these rules. A single failed gate blocks execution.</p>
            <div className="gate-list">
              {riskDecision.gates.map((item, index) => (
                <div className="gate" key={item.id}>
                  <span className={item.passed ? 'pass' : 'fail'}>{item.passed ? '✓' : '×'}</span>
                  <div><small>GATE {String(index + 1).padStart(2, '0')}</small><b>{item.label}</b></div>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="trace-foot"><span>Outcome</span><strong>{riskDecision.approved ? 'APPROVED FOR PAPER' : 'BLOCKED'}</strong></div>
          </section>
        </div>
      )}
    </main>
  );
}
