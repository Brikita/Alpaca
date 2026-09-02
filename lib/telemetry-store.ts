import { env } from 'cloudflare:workers';
import type { AlpacaSnapshot } from './alpaca-snapshot.ts';
import type { OptionScanBatch } from './option-intelligence.ts';
import type { PaperOrderEvent } from './paper-order.ts';
import type { StrategyReplay } from './replay.ts';

interface VolGuardEnvironment {
  DB: D1Database;
  TELEMETRY_INGEST_TOKEN?: string;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS telemetry_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    schema_version INTEGER NOT NULL,
    captured_at TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL,
    equity REAL NOT NULL,
    market_open INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )
`;

const CREATE_CAPTURED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_telemetry_snapshots_captured_at
  ON telemetry_snapshots(captured_at)
`;

const CREATE_OPTION_SCAN_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS option_scan_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    schema_version INTEGER NOT NULL,
    captured_at TEXT NOT NULL UNIQUE,
    received_at TEXT NOT NULL,
    leader_symbol TEXT,
    candidate_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  )
`;

const CREATE_OPTION_SCAN_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_option_scan_batches_captured_at
  ON option_scan_batches(captured_at)
`;

const CREATE_PAPER_ORDER_EVENT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS paper_order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    schema_version INTEGER NOT NULL,
    event_key TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    client_order_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    broker_status TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )
`;

const CREATE_PAPER_ORDER_EVENT_RECORDED_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_paper_order_events_recorded_at
  ON paper_order_events(recorded_at)
`;

const CREATE_PAPER_ORDER_EVENT_CLIENT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_paper_order_events_client_order_id
  ON paper_order_events(client_order_id)
`;

const CREATE_STRATEGY_REPLAY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS strategy_replays (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    schema_version INTEGER NOT NULL,
    captured_at TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL
  )
`;

function bindings(): VolGuardEnvironment {
  return env as unknown as VolGuardEnvironment;
}

async function ensureTelemetrySchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(CREATE_TABLE_SQL),
    database.prepare(CREATE_CAPTURED_AT_INDEX_SQL),
    database.prepare(CREATE_OPTION_SCAN_TABLE_SQL),
    database.prepare(CREATE_OPTION_SCAN_INDEX_SQL),
    database.prepare(CREATE_PAPER_ORDER_EVENT_TABLE_SQL),
    database.prepare(CREATE_PAPER_ORDER_EVENT_RECORDED_INDEX_SQL),
    database.prepare(CREATE_PAPER_ORDER_EVENT_CLIENT_INDEX_SQL),
    database.prepare(CREATE_STRATEGY_REPLAY_TABLE_SQL),
  ]);
}

export async function saveStrategyReplay(replay: StrategyReplay): Promise<void> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  await database.prepare(`
    INSERT INTO strategy_replays (schema_version, captured_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(captured_at) DO NOTHING
  `).bind(replay.schemaVersion, replay.capturedAt, JSON.stringify(replay)).run();
}

export async function latestStrategyReplay(): Promise<StrategyReplay | null> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const row = await database.prepare(`
    SELECT payload_json FROM strategy_replays ORDER BY captured_at DESC LIMIT 1
  `).first<{ payload_json: string }>();
  return row ? JSON.parse(row.payload_json) as StrategyReplay : null;
}

export function telemetryIngestToken(): string | undefined {
  return bindings().TELEMETRY_INGEST_TOKEN ?? process.env.TELEMETRY_INGEST_TOKEN;
}

export async function saveTelemetrySnapshot(snapshot: AlpacaSnapshot): Promise<void> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  await database
    .prepare(`
      INSERT INTO telemetry_snapshots (
        schema_version, captured_at, received_at, equity, market_open, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(captured_at) DO NOTHING
    `)
    .bind(
      snapshot.schemaVersion,
      snapshot.capturedAt,
      new Date().toISOString(),
      snapshot.account.equity,
      snapshot.market.isOpen ? 1 : 0,
      JSON.stringify(snapshot),
    )
    .run();
}

export async function latestTelemetrySnapshot(): Promise<AlpacaSnapshot | null> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const row = await database
    .prepare(`
      SELECT payload_json
      FROM telemetry_snapshots
      ORDER BY captured_at DESC
      LIMIT 1
    `)
    .first<{ payload_json: string }>();
  return row ? (JSON.parse(row.payload_json) as AlpacaSnapshot) : null;
}

export async function saveOptionScanBatch(batch: OptionScanBatch): Promise<void> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  await database
    .prepare(`
      INSERT INTO option_scan_batches (
        schema_version, captured_at, received_at, leader_symbol, candidate_count, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(captured_at) DO NOTHING
    `)
    .bind(
      batch.schemaVersion,
      batch.capturedAt,
      new Date().toISOString(),
      batch.leaderSymbol,
      batch.candidateCount,
      JSON.stringify(batch),
    )
    .run();
}

export async function latestOptionScanBatch(): Promise<OptionScanBatch | null> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const row = await database
    .prepare(`
      SELECT payload_json
      FROM option_scan_batches
      ORDER BY captured_at DESC
      LIMIT 1
    `)
    .first<{ payload_json: string }>();
  return row ? (JSON.parse(row.payload_json) as OptionScanBatch) : null;
}

export async function recentOptionScanBatches(limit = 12): Promise<OptionScanBatch[]> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const result = await database
    .prepare(`
      SELECT payload_json
      FROM option_scan_batches
      ORDER BY captured_at DESC
      LIMIT ?
    `)
    .bind(safeLimit)
    .all<{ payload_json: string }>();
  return result.results.map((row) => JSON.parse(row.payload_json) as OptionScanBatch);
}

export async function savePaperOrderEvent(event: PaperOrderEvent): Promise<void> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  await database
    .prepare(`
      INSERT INTO paper_order_events (
        schema_version, event_key, event_type, recorded_at, client_order_id,
        symbol, broker_status, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_key) DO NOTHING
    `)
    .bind(
      event.schemaVersion,
      event.eventKey,
      event.eventType,
      event.recordedAt,
      event.clientOrderId,
      event.symbol,
      event.brokerStatus,
      JSON.stringify(event),
    )
    .run();
}

export async function recentPaperOrderEvents(limit = 20): Promise<PaperOrderEvent[]> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const result = await database
    .prepare(`
      SELECT payload_json
      FROM paper_order_events
      ORDER BY recorded_at DESC
      LIMIT ?
    `)
    .bind(safeLimit)
    .all<{ payload_json: string }>();
  return result.results.map((row) => JSON.parse(row.payload_json) as PaperOrderEvent);
}

export async function paperOrderLifecycleEvents(limit = 200): Promise<PaperOrderEvent[]> {
  const database = bindings().DB;
  await ensureTelemetrySchema(database);
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await database
    .prepare(`
      SELECT payload_json
      FROM paper_order_events
      WHERE event_type != 'monitored'
      ORDER BY recorded_at DESC
      LIMIT ?
    `)
    .bind(safeLimit)
    .all<{ payload_json: string }>();
  return result.results.map((row) => JSON.parse(row.payload_json) as PaperOrderEvent);
}
