'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext hosted navigation requires document-level route changes. */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { AlpacaSnapshot } from '../lib/alpaca-snapshot';
import { runAgentCouncil } from '../lib/agent-council';
import type { DecisionHistoryItem } from '../lib/decision-history';
import type { OptionScan, OptionScanBatch } from '../lib/option-intelligence';
import type { PaperOrderEvent } from '../lib/paper-order';
import { constructPosition, toTradeProposal } from '../lib/position-constructor';
import { evaluateProposal } from '../lib/risk-governor';
import { DEFAULT_RISK_POLICY } from '../lib/domain';
import { MAX_OPEN_STRATEGIES, openPortfolio } from '../lib/portfolio-positions';
import type { TradePerformance } from '../lib/performance-analytics';
import type { StrategyReplay } from '../lib/replay';
import type { DecisionMemory } from '../lib/decision-memory';
import { automationLabel, parseAutomationStatus, type AutomationStatus } from '../lib/automation-control';
import { evidenceAgeSeconds } from '../lib/evidence-time';
import { readDashboardJson } from '../lib/dashboard-data';

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

const TIME_ZONES = {
  EAT: 'Africa/Nairobi',
  ET: 'America/New_York',
  UTC: 'UTC',
} as const;

type TimeZoneLabel = keyof typeof TIME_ZONES;

function timeLabel(value: string | null | undefined, timeZone: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone, hour12: false,
  }).format(new Date(value));
}

function historyTimeLabel(value: string, timeZone: string): string {
  if (!Number.isFinite(Date.parse(value))) return 'Unverified time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone, hour12: false,
  }).format(new Date(value));
}

function ageLabel(value: string | undefined): string {
  if (!value) return 'never';
  const seconds = Math.ceil(evidenceAgeSeconds(value));
  if (!Number.isFinite(seconds)) return 'unverified time';
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

function exitReasonLabel(reason: NonNullable<PaperOrderEvent['exit']>['reason']): string {
  const labels = {
    profit_target: 'Profit target',
    loss_limit: 'Loss limit',
    time_exit: 'Time exit',
    hold: 'Hold',
  } as const;
  return labels[reason];
}

function eventStatusLabel(event: PaperOrderEvent): string {
  if (event.eventType === 'reconciled') return event.brokerStatus.toUpperCase();
  if (event.eventType === 'exit_reconciled') {
    return event.brokerStatus === 'filled' ? 'CLOSED' : event.brokerStatus.toUpperCase();
  }
  if (event.eventType === 'monitored') return event.exit?.reason === 'hold' ? 'HOLD' : 'EXIT READY';
  return event.eventType.replaceAll('_', ' ').toUpperCase();
}

export default function Home() {
  const pathname = usePathname();
  const view = pathname.split('/')[1] || 'overview';
  const [traceOpen, setTraceOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AlpacaSnapshot | null>(null);
  const [scanBatch, setScanBatch] = useState<OptionScanBatch | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryItem[]>([]);
  const [tradeHistory, setTradeHistory] = useState<PaperOrderEvent[]>([]);
  const [telemetryError, setTelemetryError] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);
  const [performance, setPerformance] = useState<TradePerformance | null>(null);
  const [replay, setReplay] = useState<StrategyReplay | null>(null);
  const [memories, setMemories] = useState<DecisionMemory[]>([]);
  const [timeZoneLabel, setTimeZoneLabel] = useState<TimeZoneLabel>('EAT');
  const [refreshedAt, setRefreshedAt] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem('volguard-time-zone');
    if (saved && saved in TIME_ZONES) {
      window.queueMicrotask(() => setTimeZoneLabel(saved as TimeZoneLabel));
    }
  }, []);

  function selectTimeZone(next: TimeZoneLabel) {
    setTimeZoneLabel(next);
    window.localStorage.setItem('volguard-time-zone', next);
  }

  useEffect(() => {
    let active = true;
    async function refreshDashboard() {
        const [telemetryPayload, scanPayload, historyPayload, automationPayload, performancePayload, memoryPayload] = await Promise.all([
          readDashboardJson<{ snapshot: AlpacaSnapshot | null }>('/api/telemetry'),
          readDashboardJson<{ batch: OptionScanBatch | null }>('/api/scans'),
          readDashboardJson<{ decisions: DecisionHistoryItem[]; trades: PaperOrderEvent[] }>('/api/history'),
          readDashboardJson<unknown>('/api/automation'),
          readDashboardJson<{ actual: TradePerformance; replay: StrategyReplay | null }>('/api/performance'),
          readDashboardJson<{ memories: DecisionMemory[] }>('/api/memory'),
        ]);
        if (active) {
          setRefreshedAt(Date.now());
          setSnapshot(telemetryPayload?.snapshot ?? null);
          setScanBatch(scanPayload?.batch ?? null);
          if (historyPayload) {
            setDecisionHistory(historyPayload.decisions);
            setTradeHistory(historyPayload.trades);
          }
          setTelemetryError(!telemetryPayload || !scanPayload);
          setHistoryError(!historyPayload);
          setAutomation(parseAutomationStatus(automationPayload));
          setPerformance(performancePayload?.actual ?? null);
          setReplay(performancePayload?.replay ?? null);
          setMemories(memoryPayload?.memories ?? []);
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
  const dailyDrawdown = snapshot ? Math.max(0, snapshot.account.previousEquity - snapshot.account.equity) : 0;
  const dailyDrawdownPct = snapshot?.account.previousEquity
    ? (dailyDrawdown / snapshot.account.previousEquity) * 100
    : 0;
  const accountFresh = Boolean(snapshot && evidenceAgeSeconds(snapshot.capturedAt, refreshedAt) <= 60);
  const scanFresh = Boolean(scanBatch && evidenceAgeSeconds(scanBatch.capturedAt, refreshedAt) <= 60);
  const controlLabel = automationLabel(automation, refreshedAt);
  const controlClass = controlLabel === 'All halted' || controlLabel === 'Entries paused' ? 'paused' : controlLabel === 'Scheduled' ? '' : 'off-hours';
  const accountReady = Boolean(
    accountFresh && snapshot && snapshot.account.status === 'ACTIVE'
      && !snapshot.account.accountBlocked && !snapshot.account.tradingBlocked && !snapshot.account.suspendedByUser,
  );
  const leader = scanBatch?.scans.find((scan) => scan.symbol === scanBatch.leaderSymbol) ?? null;
  const passedSignalChecks = leader?.checks.filter((check) => check.passed).length ?? 0;
  const candidate = leader?.status === 'candidate';
  const portfolio = openPortfolio(tradeHistory);
  const portfolioFull = portfolio.entries.length >= MAX_OPEN_STRATEGIES;
  const underlyingOccupied = Boolean(leader && portfolio.underlyings.has(leader.symbol));
  const construction = leader ? constructPosition(leader) : null;
  const position = construction?.status === 'constructed' && leader
    ? { ...construction.position, quoteAgeSeconds: Math.ceil(Math.max(construction.position.quoteAgeSeconds, leader.quoteAgeSeconds ?? Infinity) + evidenceAgeSeconds(leader.capturedAt, refreshedAt)) }
    : null;
  const leaderMemory = leader
    ? memories.find((memory) => memory.symbol === leader.symbol && memory.generatedAt === scanBatch?.capturedAt)
    : undefined;
  const councilVotes = position && leader ? runAgentCouncil(leader, position, scanBatch?.catalyst, leaderMemory) : [];
  const proposalDecision = position && snapshot && accountReady && scanFresh && !historyError && !portfolioFull && !underlyingOccupied
    ? evaluateProposal({ ...toTradeProposal(position, councilVotes), correlationSlotsAfter: portfolio.entries.length + 1 }, {
        openRisk: portfolio.openRisk,
        openPositions: portfolio.entries.length,
        dailyDrawdown,
        competitionDrawdown: Math.max(0, STARTING_EQUITY - snapshot.account.equity),
      })
    : null;
  const decisionHeading = leader
    ? candidate
      ? portfolioFull
        ? `${leader.symbol} scan held because the two-strategy portfolio is full`
        : !accountFresh || !scanFresh
        ? `${leader.symbol} analysis needs fresh evidence before execution`
        : construction?.status === 'blocked'
        ? `${leader.symbol} research signal has no executable position`
        : underlyingOccupied
        ? `${leader.symbol} scan held because that underlying is already open`
        : proposalDecision && !proposalDecision.approved
        ? `${leader.symbol} signal blocked by risk policy`
        : `${leader.symbol} cleared every signal gate`
      : `${leader.symbol} correctly abstained`
    : 'Waiting for the first real option scan';
  const submittedTrades = tradeHistory.filter((event) => event.eventType === 'submitted');
  const latestTradeEvent = tradeHistory[0] ?? null;
  const entryFill = tradeHistory.find((event) => event.eventType === 'reconciled'
    && !event.exit
    && event.brokerStatus === 'filled'
    && event.filledQuantity > 0) ?? null;
  const latestExitEvent = tradeHistory.find((event) => Boolean(event.exit)) ?? null;
  const closedExit = tradeHistory.find((event) => event.eventType === 'exit_reconciled'
    && event.brokerStatus === 'filled'
    && event.filledQuantity > 0) ?? null;

  return (
    <main className={`app-shell view-${view}`}>
      <a className="skip-link" href="#main-content">Skip to dashboard</a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="VolGuard home">
          <span className="brand-mark">V</span>
          <span>VOLGUARD</span>
        </a>

        <nav className="nav-list" aria-label="Main navigation">
          <a className={`nav-item ${view === 'overview' ? 'active' : ''}`} href="/"><span>◫</span>Overview</a>
          <a className={`nav-item ${view === 'decisions' ? 'active' : ''}`} href="/decisions"><span>⌁</span>Decisions</a>
          <a className={`nav-item ${view === 'positions' ? 'active' : ''}`} href="/positions"><span>◇</span>Positions</a>
          <a className={`nav-item ${view === 'risk' ? 'active' : ''}`} href="/risk"><span>⊘</span>Risk desk</a>
          <a className={`nav-item ${view === 'journal' ? 'active' : ''}`} href="/journal"><span>≡</span>Journal</a>
          <a className={`nav-item ${view === 'performance' ? 'active' : ''}`} href="/performance"><span>↗</span>Performance</a>
        </nav>

        <div className="sidebar-foot">
          <div className={`connection ${accountFresh ? '' : 'offline'}`}><i />{accountFresh ? 'Alpaca synced' : snapshot ? 'Last account snapshot' : telemetryError ? 'Telemetry unavailable' : 'Awaiting telemetry'}</div>
          <p>PAPER TRADING</p>
          <small>{snapshot ? 'Sanitized snapshot' : 'No broker data exposed'}</small>
        </div>
      </aside>

      <section className="workspace" id="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AUTONOMOUS OPTIONS DESK</p>
            <h1>{view === 'overview' ? 'Trading command center' : view === 'risk' ? 'Risk desk' : `${view.charAt(0).toUpperCase()}${view.slice(1)}`}</h1>
          </div>
          <div className="market-state">
            <span className={accountFresh && snapshot?.market.isOpen ? '' : 'market-closed'}><i />{accountFresh && snapshot ? (snapshot.market.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED') : snapshot ? 'SESSION UNVERIFIED' : 'WAITING FOR SYNC'}</span>
            <label className="time-zone-control">
              <span className="sr-only">Display timezone</span>
              <strong>{timeLabel(snapshot?.market.timestamp, TIME_ZONES[timeZoneLabel])}</strong>
              <select value={timeZoneLabel} onChange={(event) => selectTimeZone(event.target.value as TimeZoneLabel)} aria-label="Display timezone">
                <option value="EAT">EAT</option>
                <option value="ET">ET</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <span className={`agent-toggle ${controlClass}`} aria-label="Cloudflare automation state">
              {controlLabel}
            </span>
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
            <div className="metric-foot"><small>Latest account snapshot</small></div>
          </article>
          <article className="metric">
            <p>Open strategies</p>
            <h2>{snapshot ? `${portfolio.entries.length} / ${MAX_OPEN_STRATEGIES}` : '—'}</h2>
            <div className="risk-track"><i style={{ width: `${Math.min(100, (portfolio.openRisk / DEFAULT_RISK_POLICY.maxOpenRisk) * 100)}%` }} /></div>
            <div className="metric-foot"><small>{snapshot ? `${money(portfolio.openRisk, 0)} max risk` : 'Awaiting sync'}</small><b className="muted">{money(DEFAULT_RISK_POLICY.maxOpenRisk, 0)} cap</b></div>
          </article>
          <article className="metric">
            <p>Agent state</p>
            <h2 className="state"><i className={controlClass} />{controlLabel}</h2>
            <div className="metric-foot"><small>{controlLabel === 'Status unknown' ? 'Control status unavailable' : automation?.haltAll ? 'Exits and entries halted' : automation?.entriesPaused ? 'Exit monitoring remains scheduled' : 'Exit / entry cadence'}</small><b className="muted">{automation ? `${automation.exitCadenceMinutes}m / ${automation.entryCadenceMinutes}m` : '—'}</b></div>
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
                {portfolioFull
                  ? 'PORTFOLIO FULL'
                  : !accountFresh || !scanFresh ? 'FRESH EVIDENCE REQUIRED'
                  : underlyingOccupied
                  ? `${leader?.symbol} OPEN`
                  : proposalDecision && !proposalDecision.approved
                  ? 'RISK BLOCKED'
                  : candidate ? `${Math.round((leader?.confidence ?? 0) * 100)}% signal score` : 'NO TRADE'}
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
                ? `${position.optimized ? 'The optimizer selected covered legs whose' : 'Exact legs'} conservative prices imply ${money(position.maxLoss)} maximum loss${position.maxProfit === null ? '' : ` and ${money(position.maxProfit)} maximum expiration profit`}; the proposal passed ${proposalDecision.passed}/${proposalDecision.total} portfolio gates.`
                : portfolioFull
                  ? 'Two paper strategies are already open, so VolGuard blocks new entries while continuing to monitor each lifecycle independently.'
                  : underlyingOccupied
                    ? `VolGuard allows a second strategy, but not another ${leader?.symbol} position; this prevents stacking exposure on one underlying.`
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
              <span><i />Passed {passedSignalChecks}/6 signal checks{proposalDecision ? ` · ${proposalDecision.passed}/${proposalDecision.total} risk gates` : ' · risk governor pending'}</span>
              <button type="button" disabled={!leader} onClick={() => setTraceOpen(true)}>View decision trace <b>→</b></button>
            </div>
          </article>

          <aside className="risk-card" id="risk">
            <div className="card-heading"><div><p className="eyebrow">READ-ONLY ACCOUNT GUARD</p><h2>Account health</h2></div><span className="shield">{accountReady ? '✓' : '·'}</span></div>
            <div className={`risk-dial ${accountReady ? 'ready' : ''}`}><div><strong>{snapshot ? (accountReady ? 'OK' : 'CHECK') : '—'}</strong><span>{snapshot ? (accountReady ? 'ACCOUNT CHECKS' : 'REVIEW / REFRESH') : 'NO DATA'}</span></div></div>
            <dl className="risk-list">
              <div><dt>Open strategies</dt><dd>{snapshot ? `${portfolio.entries.length} / ${MAX_OPEN_STRATEGIES}` : '—'}</dd></div>
              <div><dt>Combined max risk</dt><dd><span>{money(portfolio.openRisk, 0)}</span> / {money(DEFAULT_RISK_POLICY.maxOpenRisk, 0)}</dd></div>
              <div><dt>Daily drawdown</dt><dd><span>{snapshot ? `${dailyDrawdownPct.toFixed(2)}%` : '—'}</span> / 1.50%</dd></div>
              <div><dt>Trading blocked</dt><dd>{snapshot ? (snapshot.account.tradingBlocked ? 'YES' : 'NO') : '—'}</dd></div>
              <div><dt>Automation control</dt><dd>{controlLabel.toUpperCase()}</dd></div>
              <div><dt>Protective monitoring</dt><dd>{controlLabel === 'Status unknown' ? 'UNVERIFIED' : automation?.haltAll ? 'HALTED' : automation?.dispatchEligibleNow ? 'SCHEDULED' : 'OFF HOURS'}</dd></div>
            </dl>
            <p className={`risk-message ${accountReady ? '' : 'waiting'}`}><span>{accountReady ? '✓' : '·'}</span> {accountReady ? 'Account ready for analysis' : 'Waiting for verified account state'}</p>
            <p className="control-explanation">Pause stops new entries. Halt all also stops scheduled exit monitoring. Neither action closes positions or cancels existing broker orders.</p>
            <a className="control-link" href="https://github.com/Brikita/Alpaca/actions/workflows/control-paper-automation.yml" target="_blank" rel="noreferrer">Manage paper automation in GitHub ↗</a>
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
                <small>Newest first · {timeZoneLabel}</small>
              </div>
              <div className="history-list">
                {decisionHistory.map((item) => (
                  <div className="history-row" key={item.id}>
                    <time dateTime={item.capturedAt}>{historyTimeLabel(item.capturedAt, TIME_ZONES[timeZoneLabel])}</time>
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
                <strong>{submittedTrades.length}</strong>
                <span>PAPER ENTRIES SUBMITTED</span>
              </div>
              <h3>{latestTradeEvent
                ? latestTradeEvent.eventType === 'exit_reconciled' && latestTradeEvent.brokerStatus === 'filled'
                  ? `${latestTradeEvent.symbol} lifecycle closed`
                  : latestTradeEvent.eventType === 'monitored'
                    ? `${latestTradeEvent.symbol} position: ${latestTradeEvent.exit?.reason === 'hold' ? 'HOLD' : 'EXIT READY'}`
                : latestTradeEvent.eventType === 'reconciled'
                  ? `${latestTradeEvent.symbol} broker status: ${latestTradeEvent.brokerStatus}`
                  : latestTradeEvent.eventType === 'submitted'
                  ? `${latestTradeEvent.symbol} paper order accepted`
                  : latestTradeEvent.eventType === 'rejected'
                    ? `${latestTradeEvent.symbol} submission rejected`
                    : `${latestTradeEvent.symbol} order preview validated`
                : 'No submitted trades yet'}</h3>
              <p>{latestTradeEvent
                ? latestTradeEvent.message
                : 'The execution journal is ready, but no order event has been recorded.'} The latest read-only Alpaca snapshot reports {snapshot ? snapshot.openOrders.length : '—'} open orders and {snapshot ? snapshot.positions.length : '—'} positions.</p>
              {latestExitEvent?.exit && (
                <dl className="exit-policy">
                  <div><dt>Conservative close</dt><dd>{money(latestExitEvent.exit.closeCredit)} credit</dd></div>
                  <div><dt>Marked spread P&amp;L</dt><dd className={latestExitEvent.exit.unrealizedPnl >= 0 ? 'gain' : 'loss'}>{signedMoney(latestExitEvent.exit.unrealizedPnl)}</dd></div>
                  <div><dt>Profit target</dt><dd>{money(latestExitEvent.exit.profitTarget)}</dd></div>
                  <div><dt>Loss limit</dt><dd>−{money(latestExitEvent.exit.lossLimit)}</dd></div>
                  <div><dt>Time exit</dt><dd>{historyTimeLabel(latestExitEvent.exit.timeExitAt, TIME_ZONES[timeZoneLabel])} {timeZoneLabel}</dd></div>
                  <div><dt>Current decision</dt><dd>{exitReasonLabel(latestExitEvent.exit.reason)}</dd></div>
                  {latestExitEvent.exit.realizedPnl !== null && (
                    <div><dt>Realized P&amp;L</dt><dd className={latestExitEvent.exit.realizedPnl >= 0 ? 'gain' : 'loss'}>{signedMoney(latestExitEvent.exit.realizedPnl)}</dd></div>
                  )}
                </dl>
              )}
              {!!tradeHistory.length && (
                <div className="trade-event-list">
                  {tradeHistory.slice(0, 6).map((event) => (
                    <div key={event.eventKey}>
                      <span className={`trade-event-status ${event.eventType}`}>{eventStatusLabel(event)}</span>
                      <strong>{event.symbol} · {strategyLabel(event.strategy)}</strong>
                      <small>{historyTimeLabel(event.recordedAt, TIME_ZONES[timeZoneLabel])} {timeZoneLabel} · {event.exit
                        ? `${signedMoney(event.exit.unrealizedPnl)} marked · ${money(event.exit.closeCredit)} close credit · ${exitReasonLabel(event.exit.reason)}`
                        : `${money(event.maxLoss, 0)} max loss · ${event.filledAveragePrice === null ? `${money(event.limitDebit)} limit` : `${money(event.filledAveragePrice)} fill`}`}</small>
                    </div>
                  ))}
                </div>
              )}
              <dl className="capture-status">
                <div><dt>Signal decisions</dt><dd className="live">LIVE</dd></div>
                <div><dt>Order previews</dt><dd className="live">LIVE</dd></div>
                <div><dt>Submitted orders</dt><dd className={submittedTrades.length ? 'live' : ''}>{submittedTrades.length || 'NONE'}</dd></div>
                <div><dt>Entry fills</dt><dd className={entryFill ? 'live' : ''}>{entryFill ? 'MATCHED' : 'NONE'}</dd></div>
                <div><dt>Exit monitoring</dt><dd className={latestExitEvent ? 'live' : ''}>{latestExitEvent ? 'LIVE' : 'WAITING'}</dd></div>
                <div><dt>Closed trades</dt><dd className={closedExit ? 'live' : ''}>{closedExit ? 'MATCHED' : 'NONE'}</dd></div>
              </dl>
              <small className="capture-note">Entry and exit submission use separate one-process paper locks. VolGuard holds unless a fresh, exactly matched spread reaches its profit, loss, or pre-expiration time rule.</small>
            </aside>
          </div>
        </section>

        <section className="performance-section" id="performance" aria-labelledby="performance-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EVIDENCE BEFORE SCALE</p>
              <h2 id="performance-title">Performance &amp; replay</h2>
            </div>
            <span>{performance?.closedTrades ?? 0} closed paper trades</span>
          </div>
          <div className="performance-grid">
            <article className="performance-card">
              <p className="eyebrow">REALIZED PAPER RESULTS</p>
              <div className="performance-metrics">
                <div><small>REALIZED P&amp;L</small><strong className={(performance?.realizedPnl ?? 0) < 0 ? 'loss' : 'gain'}>{performance ? signedMoney(performance.realizedPnl) : '—'}</strong></div>
                <div><small>WIN RATE</small><strong>{performance?.winRate === null || performance?.winRate === undefined ? '—' : `${performance.winRate.toFixed(1)}%`}</strong></div>
                <div><small>EXPECTANCY</small><strong>{performance?.expectancy === null || performance?.expectancy === undefined ? '—' : signedMoney(performance.expectancy)}</strong></div>
                <div><small>MAX DRAWDOWN</small><strong className="loss">{performance ? money(performance.maxDrawdown) : '—'}</strong></div>
              </div>
              <p>These figures use reconciled, filled paper exits only. Open positions and order previews do not count as realized results.</p>
            </article>
            <article className="performance-card replay-card">
              <div className="history-head">
                <strong>One-year signal replay</strong>
                <small>{replay ? `${replay.start} → ${replay.end}` : 'Awaiting first daily replay'}</small>
              </div>
              <div className="replay-table">
                <div className="replay-row replay-head"><span>Symbol</span><span>Trades</span><span>Win rate</span><span>Signal</span><span>Baseline</span></div>
                {replay?.results.map((result) => (
                  <div className="replay-row" key={result.symbol}>
                    <strong>{result.symbol}</strong>
                    <span>{result.trades}</span>
                    <span>{result.winRate === null ? '—' : `${result.winRate.toFixed(1)}%`}</span>
                    <span className={result.cumulativeSignalReturnPct >= 0 ? 'gain' : 'loss'}>{signedPercent(result.cumulativeSignalReturnPct)}</span>
                    <span className={result.baselineReturnPct >= 0 ? 'gain' : 'loss'}>{signedPercent(result.baselineReturnPct)}</span>
                  </div>
                ))}
                {!replay && <div className="history-empty"><strong>No replay stored yet</strong><p>The scheduler refreshes this evidence once each trading day.</p></div>}
              </div>
              <small className="capture-note">{replay?.disclosure ?? 'Underlying signal replay is intentionally separated from actual option-trade results.'}</small>
            </article>
          </div>
          <article className="catalyst-card">
            <div>
              <p className="eyebrow">VERIFIED ALPACA NEWS</p>
              <h3>Catalyst agent: {scanBatch?.catalyst?.status?.toUpperCase() ?? 'WAITING'}</h3>
              <p>{scanBatch?.catalyst?.rationale ?? 'The next option scan will attach a verified catalyst snapshot.'}</p>
            </div>
            <div className="catalyst-list">
              {scanBatch?.catalyst?.articles.slice(0, 4).map((article) => (
                <a href={article.url} target="_blank" rel="noreferrer" key={article.id}>
                  <span className={article.highImpact ? 'risk' : ''}>{article.highImpact ? 'HIGH IMPACT' : article.source.toUpperCase()}</span>
                  <strong>{article.headline}</strong>
                  <small>{historyTimeLabel(article.createdAt, TIME_ZONES[timeZoneLabel])} {timeZoneLabel}</small>
                </a>
              ))}
            </div>
          </article>
          <article className="catalyst-card memory-card">
            <div>
              <p className="eyebrow">D1-BACKED DECISION MEMORY</p>
              <h3>Memory agent: {leaderMemory?.status.replace('_', ' ').toUpperCase() ?? 'WAITING'}</h3>
              <p>{leaderMemory?.rationale ?? 'Two matching open-market scans are required before memory can approve a paper proposal.'}</p>
            </div>
            <dl className="memory-metrics">
              <div><dt>Confirmations</dt><dd>{leaderMemory ? `${leaderMemory.confirmations} / ${leaderMemory.observations}` : '—'}</dd></div>
              <div><dt>Agreement</dt><dd>{leaderMemory?.agreementRatio === null || leaderMemory?.agreementRatio === undefined ? '—' : `${Math.round(leaderMemory.agreementRatio * 100)}%`}</dd></div>
              <div><dt>Lookback</dt><dd>{leaderMemory ? `${leaderMemory.lookbackMinutes} min` : '—'}</dd></div>
              <div><dt>Median spread</dt><dd>{leaderMemory?.medianSpreadPct === null || leaderMemory?.medianSpreadPct === undefined ? '—' : `${(leaderMemory.medianSpreadPct * 100).toFixed(2)}%`}</dd></div>
            </dl>
          </article>
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
                <p className="trace-summary"><b>Five-specialist council.</b> Regime and volatility assess the setup, verified Alpaca news must be catalyst-clear, recent D1 history must confirm the pattern, and the red team retains veto authority.</p>
                <div className="gate-list">
                  {councilVotes.map((vote, index) => {
                    const abstained = !vote.approved && vote.agent !== 'red_team';
                    return (
                      <div className="gate" key={vote.agent}>
                        <span className={vote.approved ? 'pass' : abstained ? 'abstain' : 'fail'}>
                          {vote.approved ? '✓' : abstained ? '·' : '×'}
                        </span>
                        <div><small>AGENT {String(index + 1).padStart(2, '0')}</small><b>{vote.agent.replace('_', ' ').toUpperCase()}</b></div>
                        <p>{vote.approved ? 'APPROVE' : abstained ? 'ABSTAIN' : 'VETO'} · {vote.rationale}</p>
                      </div>
                    );
                  })}
                </div>
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
