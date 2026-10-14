ALTER TABLE `hive_media` ADD `show_in_sale` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- เจ้าของให้ยกเลิกรูปขายแยก (2026-10-14): ใช้รูปสมุดพกชุดเดียวและติ๊กเลือกรูปแสดงในหน้าขาย → ลบแถวรูปขายเดิม
-- (ไฟล์ใน R2 ไม่ถูกลบจาก migration — ยังอยู่ใน metafarm-media/backups กู้ได้ · ไฟล์ที่ไม่มีแถวอ้างถึงเปิดสาธารณะไม่ได้)
DELETE FROM `hive_media` WHERE `kind` = 'sale';
