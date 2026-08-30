import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const telemetrySnapshots = sqliteTable(
  'telemetry_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    schemaVersion: integer('schema_version').notNull(),
    capturedAt: text('captured_at').notNull().unique(),
    receivedAt: text('received_at').notNull(),
    equity: real('equity').notNull(),
    marketOpen: integer('market_open', { mode: 'boolean' }).notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (table) => [index('idx_telemetry_snapshots_captured_at').on(table.capturedAt)],
);

export const optionScanBatches = sqliteTable(
  'option_scan_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    schemaVersion: integer('schema_version').notNull(),
    capturedAt: text('captured_at').notNull().unique(),
    receivedAt: text('received_at').notNull(),
    leaderSymbol: text('leader_symbol'),
    candidateCount: integer('candidate_count').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (table) => [index('idx_option_scan_batches_captured_at').on(table.capturedAt)],
);
