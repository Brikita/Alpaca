const equityBars = [30, 34, 31, 42, 39, 47, 53, 49, 58, 61, 67, 63, 74, 79, 82, 88];

const agents = [
  { name: 'Regime', verdict: 'Approve', note: 'Event-driven · 82%', tone: 'positive' },
  { name: 'Volatility', verdict: 'Approve', note: 'Implied move rich', tone: 'positive' },
  { name: 'Catalyst', verdict: 'Caution', note: 'Payrolls in 4 days', tone: 'warning' },
  { name: 'Red team', verdict: 'Cleared', note: 'Risk remains defined', tone: 'neutral' },
];

export default function Home() {
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
          <div className="connection"><i />Alpaca connected</div>
          <p>PAPER TRADING</p>
          <small>Account •••• 7F29</small>
        </div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">AUTONOMOUS OPTIONS DESK</p>
            <h1>Good evening, operator.</h1>
          </div>
          <div className="market-state">
            <span><i />MARKET OPEN</span>
            <strong>14:32:08 ET</strong>
          </div>
        </header>

        <div className="metrics">
          <article className="metric primary-metric">
            <p>Portfolio equity</p>
            <h2>$102,418<span>.60</span></h2>
            <div className="metric-foot"><b>+$2,418.60</b><small>since Aug 28</small></div>
          </article>
          <article className="metric">
            <p>Competition P&amp;L</p>
            <h2 className="gain">+2.42%</h2>
            <div className="spark-bars" aria-label="Equity trend rising">
              {equityBars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
          </article>
          <article className="metric">
            <p>Risk deployed</p>
            <h2>$1,340</h2>
            <div className="risk-track"><i /></div>
            <div className="metric-foot"><small>44% of $3,000 limit</small><b className="muted">Low</b></div>
          </article>
          <article className="metric">
            <p>Agent state</p>
            <h2 className="state"><i />Scanning</h2>
            <div className="metric-foot"><small>Next cycle</small><b className="muted">02:14</b></div>
          </article>
        </div>

        <div className="dashboard-grid">
          <article className="decision-card" id="decisions">
            <div className="card-heading">
              <div>
                <p className="eyebrow">LATEST DECISION · 14:30 ET</p>
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
              <span><i />Passed 12/12 deterministic gates</span>
              <button type="button">View decision trace <b>→</b></button>
            </div>
          </article>

          <aside className="risk-card" id="risk">
            <div className="card-heading"><div><p className="eyebrow">PORTFOLIO GOVERNOR</p><h2>Risk budget</h2></div><span className="shield">✓</span></div>
            <div className="risk-dial"><div><strong>44%</strong><span>DEPLOYED</span></div></div>
            <dl className="risk-list">
              <div><dt>Open risk</dt><dd>$1,340</dd></div>
              <div><dt>Daily drawdown</dt><dd><span>0.18%</span> / 1.50%</dd></div>
              <div><dt>Correlated positions</dt><dd>1 / 2</dd></div>
              <div><dt>Kill switch</dt><dd className="armed">ARMED</dd></div>
            </dl>
            <p className="risk-message"><span>✓</span> All systems within policy</p>
          </aside>
        </div>

        <footer className="statusbar">
          <span>VOLGUARD AI <b>v0.1.0</b></span>
          <span>Educational paper-trading system · No real capital</span>
          <span>Last sync <b>8s ago</b></span>
        </footer>
      </section>
    </main>
  );
}
