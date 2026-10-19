-- แก้ของตกหล่นจาก 2026-10-18-excel-status.sql: ตอนนั้นเปลี่ยนสถานะ A37 เป็น "ยังอยู่" แล้ว
-- แต่ลืมล้างบรรทัด "??? สถานะรัง" ในหมายเหตุ ทำให้ A37 ยังค้างอยู่ในหน้า "รังข้อมูลไม่ครบ" ทั้งที่กรอกสถานะแล้ว (พบ 2026-10-19)
-- ทำเหมือน fillMissing/resolveUnknownNotes ทำให้ตอนกรอกฟอร์มปกติ: ลบบรรทัด "???" ของหัวข้อที่รู้แล้ว
--
-- รันซ้ำได้: แก้เฉพาะรังที่สถานะรู้แล้ว (ไม่ใช่ unknown) แต่ยังมีบรรทัด "??? สถานะรัง" ค้างอยู่
-- ลองในเครื่องก่อน:   bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/2026-10-19-a37-note-cleanup.sql
-- รันจริง (ผู้ดูแล):  bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/2026-10-19-a37-note-cleanup.sql

UPDATE hives SET notes = NULLIF(TRIM(REPLACE(notes, '??? สถานะรัง', '')), ''), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE code = 'A37' AND status != 'unknown' AND notes LIKE '%??? สถานะรัง%';

SELECT code, status, notes FROM hives WHERE code = 'A37';
