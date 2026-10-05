ALTER TABLE `hives` ADD `create_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `hives_create_key_uq` ON `hives` (`create_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `hive_media_r2_key_uq` ON `hive_media` (`r2_key`);