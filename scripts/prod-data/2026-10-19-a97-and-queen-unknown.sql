-- ตามคำตอบของเจ้าของฟาร์มต่อ Excel 18 ต.ค. 2569 (ตอบกลับทางรูปภาพ 2026-10-19)
--
-- 1) A97: เจ้าของยืนยันว่ารัง "ขยายเองตามธรรมชาติ: ขนเงินเข้ายึดรังถ้วยดำ C6" (แถวที่ซ้ำโค้ด A96 ใน Excel)
--    คือรังเดียวกับ A97 ที่มีอยู่แล้วในระบบ (origin = natural, ซื้อ/ได้มา 2023-04-01 ตรงกันอยู่แล้ว)
--    เหลือแค่สถานะที่ Excel ไม่เคยกรอก — แถวนั้น Exist = 1 → ยังเลี้ยงอยู่ (ไม่ใช่ A150 ซึ่งเป็นรังถ้วยดำที่ขนเงินยึดคนละรัง)
--    ทำเหมือนกดเปลี่ยนสถานะในหลังบ้าน (statusStatements): เหตุการณ์ "เปลี่ยนสถานะ" + แก้สถานะ + audit · ล้างบรรทัด "??? สถานะรัง"
-- 2) วันเกิดนางพญาที่เจ้าของยืนยันว่า "ไม่ทราบจริง ๆ ไม่ได้บันทึกไว้" (A129, A136, A138, A139, A150)
--    ทำเหมือนกดปุ่ม "ไม่ทราบจริง ๆ" ที่หน้า /admin/todo (markUnknown): เปลี่ยนบรรทัด "??? วันเกิดนางพญา" เป็น "ไม่ทราบ: วันเกิดนางพญา" + audit
--    (A44, A63, A70 เจ้าของบอกไม่รีบ จะกลับไปเช็กที่บ้านเอง — ไฟล์นี้ไม่แตะ)
--
-- รันซ้ำได้: แก้เฉพาะรังที่ยังเป็นค่าเดิม (A97 ยัง unknown และไม่ผูกออเดอร์ · แต่ละรังยังมีบรรทัด "???" อยู่จริง)
-- ลองในเครื่องก่อน:   bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/2026-10-19-a97-and-queen-unknown.sql
-- รันจริง (ผู้ดูแล):  bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-19-a97-and-queen-unknown.sql

-- ---------- 1) A97: ไม่ทราบสถานะ → ยังอยู่ ----------
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.status', 'hive', h.id,
       '{"from":"unknown","to":"active","file":"scripts/prod-data/2026-10-19-a97-and-queen-unknown.sql","by":"ผู้ดูแลระบบตามที่เจ้าของฟาร์มยืนยัน (A97 = รังขนเงินยึดถ้วยดำ C6 ตามธรรมชาติ, Exist=1 ใน Excel)"}'
  FROM hives h
 WHERE h.code = 'A97' AND h.status = 'unknown'
   AND NOT EXISTS (SELECT 1 FROM hive_holds x WHERE x.hive_id = h.id)
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-19-a97-status');

INSERT INTO hive_events (hive_id, type, occurred_on, occurred_on_precision, from_status, to_status, note, idempotency_key)
SELECT h.id, 'status_change', '2026-10-19', 'day', 'unknown', 'active',
       'ยืนยันว่ายังเลี้ยงอยู่ — รังขนเงินเข้ายึดรังถ้วยดำ C6 ตามธรรมชาติ (ตาม Excel 18 ต.ค. 2569 และคำยืนยันของเจ้าของฟาร์ม)',
       'prod-data:2026-10-19-a97-status'
  FROM hives h
 WHERE h.code = 'A97' AND h.status = 'unknown'
   AND NOT EXISTS (SELECT 1 FROM hive_holds x WHERE x.hive_id = h.id)
   AND NOT EXISTS (SELECT 1 FROM hive_events e WHERE e.idempotency_key = 'prod-data:2026-10-19-a97-status');

UPDATE hives SET status = 'active', status_changed_on = '2026-10-19',
       notes = NULLIF(TRIM(REPLACE(COALESCE(notes, ''), '??? สถานะรัง', '')), ''),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'A97' AND status = 'unknown'
   AND EXISTS (SELECT 1 FROM hive_events e WHERE e.hive_id = hives.id AND e.idempotency_key = 'prod-data:2026-10-19-a97-status');

-- ---------- 2) วันเกิดนางพญา "ไม่ทราบจริง ๆ" (เหมือนปุ่มในหน้า /admin/todo) ----------
INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.confirm_unknown', 'hive', h.id,
       '{"topic":"วันเกิดนางพญา","file":"scripts/prod-data/2026-10-19-a97-and-queen-unknown.sql","by":"ผู้ดูแลระบบตามที่เจ้าของฟาร์มยืนยัน"}'
  FROM hives h
 WHERE h.code IN ('A129', 'A136', 'A138', 'A139', 'A150')
   AND instr(h.notes, '??? วันเกิดนางพญา') > 0;

UPDATE hives SET notes = REPLACE(notes, '??? วันเกิดนางพญา', 'ไม่ทราบ: วันเกิดนางพญา'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code IN ('A129', 'A136', 'A138', 'A139', 'A150')
   AND instr(notes, '??? วันเกิดนางพญา') > 0;

-- ผลที่ควรเห็น: A97 = active, ไม่มี "???" ในหมายเหตุ · อีก 5 รังมีบรรทัด "ไม่ทราบ: วันเกิดนางพญา" แทน "???"
SELECT code, status, notes FROM hives WHERE code IN ('A97', 'A129', 'A136', 'A138', 'A139', 'A150') ORDER BY id;
