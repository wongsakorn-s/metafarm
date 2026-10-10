-- แก้ข้อมูลสินค้าบนระบบจริงตามที่เจ้าของฟาร์มขอ (2026-10-10) — ทำเหมือนกดในหลังบ้าน /admin/products
--   น้ำผึ้ง: เพิ่มขนาด "ขวด" 175 มล. ราคา 350 บาท (ยืนยันราคาแล้ว) · ซ่อนขนาด 50 และ 120 มล. · ลบคำ "มีสองขนาด" ในคำอธิบาย
--   รังเปล่า: ราคา 750 บาท (ยืนยันราคาแล้ว)
--
-- ต้อง deploy ก่อน (migration 0015 เพิ่มคอลัมน์ product_variants.hidden) — ถ้ายังไม่มีคอลัมน์ คำสั่งแรกล้มทันที ยังไม่มีอะไรเปลี่ยน
-- รันซ้ำได้: ไม่เพิ่มขนาด 175 ซ้ำ · ซ่อน/ตั้งราคาซ้ำได้ผลเดิม · ไม่ลบข้อมูลใด ๆ (ขนาดเดิมแค่ซ่อน ออเดอร์/การบรรจุเก่ายังอ้างถึงได้)
-- รัน (ผู้ดูแล): npx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-10-honey-175-hive-box-750.sql

-- 1) ซ่อนขนาด 50 และ 120 มล. ของน้ำผึ้ง
UPDATE product_variants SET hidden = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE product_id = (SELECT id FROM products WHERE slug = 'stingless-honey') AND size_ml IN (50, 120) AND hidden = 0;

-- 2) เพิ่มขนาด 175 มล. 350 บาท (สต็อกเริ่ม 0 — เพิ่มจากการบรรจุขวดในหน้าล็อต · ปีเก็บเกี่ยวตามขนาดเดิมล่าสุด)
INSERT INTO product_variants (product_id, label, size_ml, price_thb, price_confirmed, stock_qty, harvest_year_be, sort_order, hidden)
SELECT p.id, 'ขวด', 175, 350, 1, 0,
       (SELECT v.harvest_year_be FROM product_variants v WHERE v.product_id = p.id AND v.harvest_year_be IS NOT NULL ORDER BY v.id DESC LIMIT 1),
       coalesce((SELECT max(v.sort_order) FROM product_variants v WHERE v.product_id = p.id), 0) + 1, 0
  FROM products p
 WHERE p.slug = 'stingless-honey'
   AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.size_ml = 175 AND v.hidden = 0);

-- 3) คำอธิบายน้ำผึ้ง: ตัดคำ "มีสองขนาด" (ส่วนอื่นของข้อความคงเดิม เผื่อเจ้าของแก้ไว้แล้ว)
UPDATE products SET description = trim(replace(replace(description, ' มีสองขนาด', ''), 'มีสองขนาด', '')), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE slug = 'stingless-honey' AND description LIKE '%มีสองขนาด%';

-- 4) รังเปล่า 750 บาท (ทุกขนาดที่แสดงอยู่ของสินค้ารังเปล่า — ปัจจุบันมีขนาดเดียว)
UPDATE product_variants SET price_thb = 750, price_confirmed = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE product_id = (SELECT id FROM products WHERE slug = 'hive-box') AND hidden = 0 AND (price_thb != 750 OR price_confirmed = 0);

-- 5) บันทึกประวัติ (audit) ว่าแก้ผ่านไฟล์นี้
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'product.data_fix', 'product', id, '{"file":"scripts/prod-data/2026-10-10-honey-175-hive-box-750.sql","by":"ผู้ดูแลระบบตามที่เจ้าของฟาร์มขอ"}'
  FROM products WHERE slug IN ('stingless-honey', 'hive-box');

-- ผลที่ควรเห็น (ตรวจหลังรัน)
SELECT p.slug, v.label, v.size_ml, v.price_thb, v.price_confirmed, v.hidden
  FROM product_variants v JOIN products p ON p.id = v.product_id
 WHERE p.slug IN ('stingless-honey', 'hive-box') ORDER BY p.slug, v.sort_order, v.id;
