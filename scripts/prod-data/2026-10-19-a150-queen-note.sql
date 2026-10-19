-- A150 (origin = natural, ขนเงินเข้ายึดรังถ้วยดำ) ไม่เคยมีบรรทัด "??? วันเกิดนางพญา" ในหมายเหตุ
-- (รังนี้เพิ่มตรงจากฟอร์ม /admin/hives/new ไม่ผ่านตัวนำเข้า Excel ที่ใส่เครื่องหมาย ??? ให้อัตโนมัติ
--  และ origin=natural ไม่ถูกถามวันเกิดนางพญาอยู่แล้ว เพราะไม่ใช่รังที่เพาะ/แยกเอง)
-- เจ้าของฟาร์มยืนยันชัดเจนว่าไม่ทราบวันเกิดนางพญาของรังนี้ และขอให้ใช้คำว่า "ไม่ทราบ" (2026-10-19)
-- → เติมบรรทัด "ไม่ทราบ: วันเกิดนางพญา" ต่อท้ายหมายเหตุเดิม (ไม่ลบข้อความเดิม)
--
-- รันซ้ำได้: เติมเฉพาะเมื่อยังไม่มีบรรทัดนี้อยู่แล้ว
-- ลองในเครื่องก่อน:   bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/2026-10-19-a150-queen-note.sql
-- รันจริง (ผู้ดูแล):  bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-19-a150-queen-note.sql

INSERT INTO audit_logs (user_id, action, entity, entity_id, diff)
SELECT NULL, 'hive.confirm_unknown', 'hive', h.id,
       '{"topic":"วันเกิดนางพญา","file":"scripts/prod-data/2026-10-19-a150-queen-note.sql","by":"ผู้ดูแลระบบตามที่เจ้าของฟาร์มยืนยัน (A150 ไม่มี ??? อัตโนมัติ เพราะเพิ่มตรงและ origin=natural)"}'
  FROM hives h
 WHERE h.code = 'A150' AND instr(coalesce(h.notes, ''), 'ไม่ทราบ: วันเกิดนางพญา') = 0;

UPDATE hives SET notes = TRIM(coalesce(notes || char(10), '') || 'ไม่ทราบ: วันเกิดนางพญา'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'A150' AND instr(coalesce(notes, ''), 'ไม่ทราบ: วันเกิดนางพญา') = 0;

SELECT code, notes FROM hives WHERE code = 'A150';
