ALTER TABLE `gallery_photos` ADD `media_type` text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE `gallery_photos` ADD `poster_key` text;--> statement-breakpoint
CREATE INDEX `gallery_photos_media_type_idx` ON `gallery_photos` (`media_type`);--> statement-breakpoint
ALTER TABLE `products` ADD `video_key` text;--> statement-breakpoint
ALTER TABLE `products` ADD `video_youtube_id` text;--> statement-breakpoint
CREATE INDEX `products_video_key_idx` ON `products` (`video_key`);