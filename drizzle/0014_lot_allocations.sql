CREATE TABLE `order_item_lots` (
	`order_item_id` integer NOT NULL,
	`lot_id` integer NOT NULL,
	`qty` integer NOT NULL,
	PRIMARY KEY(`order_item_id`, `lot_id`),
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `honey_lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_item_lots_qty_pos" CHECK("order_item_lots"."qty" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_item_lots_lot_idx` ON `order_item_lots` (`lot_id`);--> statement-breakpoint
-- ข้อมูลเดิม: บรรทัดที่ชำระแล้วผูกล็อตเดียวทั้งบรรทัด (order_items.lot_id) → ย้ายมาเป็นแถวในตารางใหม่ตามเดิม (ไม่เดาแยกล็อตย้อนหลัง)
INSERT OR IGNORE INTO `order_item_lots` (`order_item_id`, `lot_id`, `qty`)
SELECT i.`id`, i.`lot_id`, i.`qty` FROM `order_items` i JOIN `orders` o ON o.`id` = i.`order_id`
WHERE i.`lot_id` IS NOT NULL AND i.`kind` = 'variant' AND o.`status` IN ('paid', 'fulfilled');
