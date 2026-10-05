CREATE INDEX `hive_events_occurred_idx` ON `hive_events` (`occurred_on`,`id`);--> statement-breakpoint
CREATE INDEX `hive_events_type_occurred_idx` ON `hive_events` (`type`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `hive_events_target_idx` ON `hive_events` (`target_hive_id`);--> statement-breakpoint
CREATE INDEX `hives_queen_src_idx` ON `hives` (`queen_source_hive_id`);--> statement-breakpoint
CREATE INDEX `hives_brood_src_idx` ON `hives` (`brood_source_hive_id`);--> statement-breakpoint
CREATE INDEX `products_image_key_idx` ON `products` (`image_key`);