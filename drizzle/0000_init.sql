CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`diff` text,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`line_name` text,
	`address` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hive_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hive_id` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_on` text NOT NULL,
	`occurred_on_precision` text DEFAULT 'day' NOT NULL,
	`honey_ml` integer,
	`propolis_g` integer,
	`pollen_g` integer,
	`queen_cells` integer,
	`target_hive_id` integer,
	`from_status` text,
	`to_status` text,
	`note` text,
	`is_public` integer DEFAULT true NOT NULL,
	`created_by` integer,
	`idempotency_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hive_events_amounts_nonneg" CHECK(coalesce("hive_events"."honey_ml",0) >= 0 and coalesce("hive_events"."propolis_g",0) >= 0 and coalesce("hive_events"."pollen_g",0) >= 0 and coalesce("hive_events"."queen_cells",0) >= 0)
);
--> statement-breakpoint
CREATE INDEX `hive_events_hive_idx` ON `hive_events` (`hive_id`,`occurred_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `hive_events_idem_uq` ON `hive_events` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `hive_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hive_id` integer NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text,
	`youtube_id` text,
	`width` integer,
	`height` integer,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hive_media_hive_idx` ON `hive_media` (`hive_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `hives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`species_id` integer NOT NULL,
	`origin` text DEFAULT 'unknown' NOT NULL,
	`origin_place` text,
	`acquired_on` text,
	`acquired_on_precision` text,
	`queen_born_on` text,
	`queen_source_hive_id` integer,
	`brood_source_hive_id` integer,
	`box_type` text DEFAULT 'unknown' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`status_changed_on` text,
	`collapse_reason` text,
	`public_note` text,
	`purchase_price` integer,
	`supplier_id` integer,
	`for_sale` integer DEFAULT false NOT NULL,
	`sale_price` integer,
	`sold_price` integer,
	`sold_on` text,
	`customer_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`queen_source_hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brood_source_hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hives_code_uq` ON `hives` (`code`);--> statement-breakpoint
CREATE INDEX `hives_status_idx` ON `hives` (`status`);--> statement-breakpoint
CREATE INDEX `hives_for_sale_idx` ON `hives` (`for_sale`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`label` text NOT NULL,
	`size_ml` integer,
	`price_thb` integer NOT NULL,
	`stock_qty` integer DEFAULT 0 NOT NULL,
	`harvest_year_be` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`published` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_uq` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `species` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_th` text NOT NULL,
	`name_sci` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`area` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);