import { env } from 'cloudflare:workers';
import type { AlpacaSnapshot } from './alpaca-snapshot.ts';

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

function bindings(): VolGuardEnvironment {
  return env as unknown as VolGuardEnvironment;
}

async function ensureTelemetrySchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(CREATE_TABLE_SQL),
    database.prepare(CREATE_CAPTURED_AT_INDEX_SQL),
  ]);
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
