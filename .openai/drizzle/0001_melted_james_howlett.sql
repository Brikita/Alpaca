CREATE TABLE `option_scan_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schema_version` integer NOT NULL,
	`captured_at` text NOT NULL,
	`received_at` text NOT NULL,
	`leader_symbol` text,
	`candidate_count` integer NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `option_scan_batches_captured_at_unique` ON `option_scan_batches` (`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_option_scan_batches_captured_at` ON `option_scan_batches` (`captured_at`);