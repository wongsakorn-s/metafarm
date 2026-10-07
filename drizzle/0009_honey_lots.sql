CREATE TABLE `bottlings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`bottled_on` text NOT NULL,
	`unit_cost` integer,
	`create_key` text,
	`created_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `honey_lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bottlings_qty_pos" CHECK("bottlings"."qty" > 0 and coalesce("bottlings"."unit_cost", 0) >= 0)
);
--> statement-breakpoint
CREATE INDEX `bottlings_lot_idx` ON `bottlings` (`lot_id`,`variant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bottlings_create_key_uq` ON `bottlings` (`create_key`);--> statement-breakpoint
CREATE TABLE `honey_lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`harvested_from` text NOT NULL,
	`harvested_to` text NOT NULL,
	`total_ml` integer NOT NULL,
	`note` text,
	`create_key` text,
	`created_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "honey_lots_ml_pos" CHECK("honey_lots"."total_ml" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `honey_lots_code_uq` ON `honey_lots` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `honey_lots_create_key_uq` ON `honey_lots` (`create_key`);--> statement-breakpoint
CREATE TABLE `lot_sources` (
	`lot_id` integer NOT NULL,
	`event_id` integer NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `honey_lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `hive_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lot_sources_event_uq` ON `lot_sources` (`event_id`);--> statement-breakpoint
CREATE INDEX `lot_sources_lot_idx` ON `lot_sources` (`lot_id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `lot_id` integer REFERENCES honey_lots(id);