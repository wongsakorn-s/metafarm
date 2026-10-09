CREATE TABLE `hive_holds` (
	`hive_id` integer PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hive_holds_order_idx` ON `hive_holds` (`order_id`);--> statement-breakpoint
-- ข้อมูลเดิม: รังในออเดอร์ที่ยังไม่ยกเลิก = ผูกกับออเดอร์นั้น (รังที่ถูกจองซ้ำสองออเดอร์ เก็บออเดอร์แรก)
INSERT OR IGNORE INTO `hive_holds` (`hive_id`, `order_id`)
SELECT i.`hive_id`, i.`order_id` FROM `order_items` i JOIN `orders` o ON o.`id` = i.`order_id`
WHERE i.`kind` = 'hive' AND i.`hive_id` IS NOT NULL AND o.`status` != 'cancelled'
ORDER BY o.`id`;
--> statement-breakpoint
-- ข้อมูลเดิม: รังที่ขายตามออเดอร์จริง (มีเหตุการณ์ "ขายตามออเดอร์ <รหัส>") → stock_taken = 1 · ยกเลิกออเดอร์จะคืนเฉพาะรังเหล่านี้
UPDATE `order_items` SET `stock_taken` = 1
WHERE `kind` = 'hive' AND `stock_taken` = 0 AND EXISTS (
  SELECT 1 FROM `orders` o JOIN `hives` h ON h.`id` = `order_items`.`hive_id`
  WHERE o.`id` = `order_items`.`order_id` AND o.`stock_applied` = 1 AND h.`status` = 'sold'
    AND EXISTS (SELECT 1 FROM `hive_events` e WHERE e.`hive_id` = h.`id` AND e.`type` = 'status_change' AND e.`to_status` = 'sold' AND e.`note` = 'ขายตามออเดอร์ ' || o.`code`)
);
