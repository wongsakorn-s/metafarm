-- เปลี่ยนที่มาของรัง "เพาะนางพญาเอง" ที่เหลือ 9 รัง เป็น "ขยายรังโดย MetaFarm" (origin = split) ตามที่เจ้าของฟาร์มยืนยัน (2026-10-18)
--   รัง: A100, A103, A104, A105, A106, A107, A108, A109, A110 (รายชื่อจากหน้าสมุดพกบนระบบจริง 2026-10-18)
--   ทำเหมือนเลือก "ขยายรังโดย MetaFarm" ในฟอร์มแก้ไขรัง — วันเกิดนางพญา รังแม่ สถานะ และประวัติของรังไม่เปลี่ยน
--   (ตั้งแต่รอบ 1 ของคอมเมนต์ 2026-10-18 หน้าสมุดพกแสดงวันเกิดนางพญาของรังขยายรังด้วย จึงไม่มีข้อมูลหายจากหน้าเว็บ)
--
-- รันซ้ำได้: แก้เฉพาะรังในรายชื่อที่ยังเป็น queen_bred · รังที่ถูกแก้ไปแล้วไม่ถูกแตะ และไม่บันทึกประวัติซ้ำ
-- ลองในเครื่องก่อน:      bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/2026-10-18-queen-bred-to-split.sql
-- รันจริง (ผู้ดูแล):     bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-18-queen-bred-to-split.sql

-- 1) บันทึกประวัติ (audit) ก่อนแก้ — เฉพาะรังที่จะถูกเปลี่ยนจริง
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.data_fix', 'hive', id,
       '{"file":"scripts/prod-data/2026-10-18-queen-bred-to-split.sql","by":"ผู้ดูแลระบบตามที่เจ้าของฟาร์มยืนยัน","origin":["queen_bred","split"]}'
  FROM hives
 WHERE code IN ('A100', 'A103', 'A104', 'A105', 'A106', 'A107', 'A108', 'A109', 'A110') AND origin = 'queen_bred';

-- 2) เปลี่ยนที่มา (updated_at ใหม่ = ฟอร์มที่เปิดค้างไว้ก่อนหน้าจะแจ้งว่าข้อมูลเปลี่ยน ไม่เขียนทับ)
UPDATE hives SET origin = 'split', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code IN ('A100', 'A103', 'A104', 'A105', 'A106', 'A107', 'A108', 'A109', 'A110') AND origin = 'queen_bred';

-- ผลที่ควรเห็น: ทั้ง 9 รัง origin = split · queen_bred_left = 0 (ถ้าไม่ใช่ 0 แปลว่ามีรังเพาะนางพญาอื่นนอกรายชื่อ — แจ้งเจ้าของ)
SELECT code, origin, status, queen_born_on FROM hives
 WHERE code IN ('A100', 'A103', 'A104', 'A105', 'A106', 'A107', 'A108', 'A109', 'A110') ORDER BY id;
SELECT count(*) AS queen_bred_left FROM hives WHERE origin = 'queen_bred';
