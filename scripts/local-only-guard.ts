// ตัวกันไฟล์ SQL ที่ "ล้างข้อมูลแล้วนำเข้าใหม่" (seed.sql / snapshot.sql) ไม่ให้รันกับระบบจริง
// ระบบจริงเปิดใช้แล้ว (2026-10-05) และเป็นที่เก็บข้อมูลหลัก — รันไฟล์พวกนี้ด้วย --remote = ข้อมูลรัง ออเดอร์ ลูกค้าหายหมด
//
// วิธีแยก: บัญชีในเครื่องใช้อีเมล @metafarm.local ทั้งหมด (user:create, check:forms) ส่วนระบบจริงมีบัญชีอีเมลจริง
// ถ้าพบบัญชีอีเมลอื่น คำสั่ง INSERT ติด CHECK แล้ว SQL หยุดตรงนั้น ก่อนถึง DELETE ใด ๆ
// ข้อความที่เห็น: "CHECK constraint failed: refuse_production_db_has_real_users"
export const GUARD_TABLE = '_local_only_guard';

export const localOnlyGuard = (): string[] => [
  '-- ตัวกัน: หยุดทันทีถ้าฐานข้อมูลนี้มีบัญชีอีเมลจริง (= ระบบจริง) — ดู scripts/local-only-guard.ts',
  `DROP TABLE IF EXISTS ${GUARD_TABLE};`,
  `CREATE TABLE ${GUARD_TABLE} (real_users INTEGER CONSTRAINT refuse_production_db_has_real_users CHECK (real_users = 0));`,
  `INSERT INTO ${GUARD_TABLE} SELECT count(*) FROM users WHERE email NOT LIKE '%@metafarm.local';`,
  `DROP TABLE ${GUARD_TABLE};`,
];
