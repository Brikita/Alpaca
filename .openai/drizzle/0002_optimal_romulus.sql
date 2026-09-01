CREATE TABLE `paper_order_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schema_version` integer NOT NULL,
	`event_key` text NOT NULL,
	`event_type` text NOT NULL,
	`recorded_at` text NOT NULL,
	`client_order_id` text NOT NULL,
	`symbol` text NOT NULL,
	`broker_status` text NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_order_events_event_key_unique` ON `paper_order_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_paper_order_events_recorded_at` ON `paper_order_events` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_paper_order_events_client_order_id` ON `paper_order_events` (`client_order_id`);