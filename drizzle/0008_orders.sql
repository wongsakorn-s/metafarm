CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`kind` text NOT NULL,
	`variant_id` integer,
	`hive_id` integer,
	`label` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price` integer NOT NULL,
	`prev_for_sale` integer,
	`stock_taken` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_qty_pos" CHECK("order_items"."qty" > 0 and "order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_hive_idx` ON `order_items` (`hive_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`customer_id` integer,
	`channel` text DEFAULT 'line' NOT NULL,
	`ordered_on` text NOT NULL,
	`status` text DEFAULT 'awaiting_payment' NOT NULL,
	`paid_on` text,
	`pay_method` text,
	`ship_method` text DEFAULT 'pickup' NOT NULL,
	`ship_fee` integer DEFAULT 0 NOT NULL,
	`tracking_no` text,
	`fulfilled_on` text,
	`note` text,
	`stock_applied` integer DEFAULT false NOT NULL,
	`create_key` text,
	`created_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_ship_fee_nonneg" CHECK("orders"."ship_fee" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_uq` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_create_key_uq` ON `orders` (`create_key`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`,`ordered_on`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);