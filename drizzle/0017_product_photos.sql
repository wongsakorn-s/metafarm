CREATE TABLE `product_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_photos_key_uq` ON `product_photos` (`r2_key`);--> statement-breakpoint
CREATE INDEX `product_photos_product_idx` ON `product_photos` (`product_id`,`sort_order`);
--> statement-breakpoint
-- รูปเดี่ยวเดิม (products.image_key) ย้ายเข้าเป็นรูปแรกของสินค้า (ไฟล์ใน R2 ไม่ต้องย้าย)
INSERT INTO `product_photos` (`product_id`, `r2_key`, `sort_order`) SELECT `id`, `image_key`, 1 FROM `products` WHERE `image_key` IS NOT NULL;--> statement-breakpoint
-- ชื่อสินค้าตามที่เจ้าของขอ (2026-10-13) — เปลี่ยนเฉพาะที่ยังเป็นชื่อเดิม (ถ้าเจ้าของแก้เองไปแล้วจะไม่ทับ)
UPDATE `products` SET `name` = 'รัง MetaFarm (รังเปล่า)' WHERE `slug` = 'hive-box' AND `name` = 'รังเปล่า (รังไม้สัก 2 ห้อง)';--> statement-breakpoint
UPDATE `products` SET `name` = 'น้ำผึ้งชันโรงขนเงิน MetaFarm' WHERE `slug` = 'stingless-honey' AND `name` = 'น้ำผึ้งชันโรงขนเงิน ปี 2569';