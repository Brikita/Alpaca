CREATE TABLE `telemetry_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schema_version` integer NOT NULL,
	`captured_at` text NOT NULL,
	`received_at` text NOT NULL,
	`equity` real NOT NULL,
	`market_open` integer NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_snapshots_captured_at_unique` ON `telemetry_snapshots` (`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_snapshots_captured_at` ON `telemetry_snapshots` (`captured_at`);