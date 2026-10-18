-- อัปเดตสถานะรังตามไฟล์ Excel ของเจ้าของฟาร์ม "รายละเอียดชันโรงแต่ละรัง_18 ตค. 2569" (เจ้าของ/ผู้ดูแลเลือกทางเลือก ก. 2026-10-18)
--   1) 11 รังที่ Excel บอกว่าล่ม แต่ระบบยังเป็น "ยังอยู่": A5 A16 A49 A52 A80 A95 A99 A101 A112 A133 A140
--      Excel ไม่มีวันที่ล่ม → บันทึกเป็น "ต.ค. 2569" แบบระบุแค่เดือน (occurred_on = 2026-10-01, precision = month) พร้อมหมายเหตุว่าไม่ทราบวันที่จริง
--   2) A37: Excel บอกว่ายังเลี้ยงอยู่ ระบบเป็น "ไม่ทราบสถานะ" → "ยังอยู่" (ยืนยันตาม Excel วันที่ 18 ต.ค. 2569)
--   ทำเหมือนกดเปลี่ยนสถานะในหลังบ้าน (statusStatements ใน src/server/hives.ts): เหตุการณ์ status_change ในประวัติรัง + แก้สถานะ + เอาออกจากการขาย (ล่ม) + audit
--
-- ปลอดภัยเมื่อรันซ้ำ / เจ้าของแก้ในแอปไปก่อนแล้ว:
--   แก้เฉพาะรังที่ยังเป็นสถานะเดิม (active / unknown) และไม่ได้ผูกกับออเดอร์ (hive_holds) · เหตุการณ์มี idempotency_key ต่อรัง จึงไม่เกิดซ้ำ
-- ลองในเครื่องก่อน:   bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/2026-10-18-excel-status.sql
-- รันจริง (ผู้ดูแล):  bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-18-excel-status.sql

-- ---------- 1) 11 รังที่ล่ม ----------
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.status', 'hive', h.id,
       '{"from":"active","to":"collapsed","file":"scripts/prod-data/2026-10-18-excel-status.sql","by":"ผู้ดูแลระบบตาม Excel ของเจ้าของฟาร์ม 18 ต.ค. 2569"}'
  FROM hives h
 WHERE h.code IN ('A5', 'A16', 'A49', 'A52', 'A80', 'A95', 'A99', 'A101', 'A112', 'A133', 'A140')
   AND h.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM hive_holds x WHERE x.hive_id = h.id)
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-18-excel:' || h.code);

INSERT INTO hive_events (hive_id, type, occurred_on, occurred_on_precision, from_status, to_status, note, idempotency_key)
SELECT h.id, 'status_change', '2026-10-01', 'month', 'active', 'collapsed',
       'บันทึกตาม Excel ของเจ้าของฟาร์ม 18 ต.ค. 2569 — ไม่ทราบวันที่ล่มจริง',
       'prod-data:2026-10-18-excel:' || h.code
  FROM hives h
 WHERE h.code IN ('A5', 'A16', 'A49', 'A52', 'A80', 'A95', 'A99', 'A101', 'A112', 'A133', 'A140')
   AND h.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM hive_holds x WHERE x.hive_id = h.id)
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-18-excel:' || h.code);

-- เปลี่ยนเฉพาะรังที่เพิ่งได้เหตุการณ์จากไฟล์นี้ (รังที่ข้ามไปด้านบนไม่ถูกแตะ)
UPDATE hives SET status = 'collapsed', status_changed_on = '2026-10-01', collapse_reason = NULL, sold_on = NULL, sold_price = NULL,
       for_sale = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code IN ('A5', 'A16', 'A49', 'A52', 'A80', 'A95', 'A99', 'A101', 'A112', 'A133', 'A140')
   AND status = 'active'
   AND EXISTS (SELECT 1 FROM hive_events e WHERE e.hive_id = hives.id AND e.idempotency_key = 'prod-data:2026-10-18-excel:' || hives.code);

-- ---------- 2) A37 ไม่ทราบสถานะ → ยังอยู่ ----------
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.status', 'hive', h.id,
       '{"from":"unknown","to":"active","file":"scripts/prod-data/2026-10-18-excel-status.sql","by":"ผู้ดูแลระบบตาม Excel ของเจ้าของฟาร์ม 18 ต.ค. 2569"}'
  FROM hives h
 WHERE h.code = 'A37' AND h.status = 'unknown'
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-18-excel:A37');

INSERT INTO hive_events (hive_id, type, occurred_on, occurred_on_precision, from_status, to_status, note, idempotency_key)
SELECT h.id, 'status_change', '2026-10-18', 'day', 'unknown', 'active',
       'ยืนยันว่ายังเลี้ยงอยู่ ตาม Excel ของเจ้าของฟาร์ม 18 ต.ค. 2569',
       'prod-data:2026-10-18-excel:A37'
  FROM hives h
 WHERE h.code = 'A37' AND h.status = 'unknown'
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-18-excel:A37');

UPDATE hives SET status = 'active', status_changed_on = '2026-10-18', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'A37' AND status = 'unknown'
   AND EXISTS (SELECT 1 FROM hive_events e WHERE e.hive_id = hives.id AND e.idempotency_key = 'prod-data:2026-10-18-excel:A37');

-- ผลที่ควรเห็น: 11 รัง = collapsed, A37 = active · skipped_held = รังที่ข้ามเพราะผูกกับออเดอร์ (ควรเป็น 0 — ถ้าไม่ใช่ แจ้งเจ้าของ)
SELECT code, status, status_changed_on, for_sale FROM hives
 WHERE code IN ('A5', 'A16', 'A49', 'A52', 'A80', 'A95', 'A99', 'A101', 'A112', 'A133', 'A140', 'A37') ORDER BY id;
SELECT count(*) AS skipped_held FROM hives h JOIN hive_holds x ON x.hive_id = h.id
 WHERE h.code IN ('A5', 'A16', 'A49', 'A52', 'A80', 'A95', 'A99', 'A101', 'A112', 'A133', 'A140');
