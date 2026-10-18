// เตรียมไฟล์สำรองจาก `wrangler d1 export` ให้นำกลับเข้า D1 ได้
//
//   bun run backup:prepare -- private/restore-test.sql        → private/restore-test.restore.sql
//
// ปัญหา: d1 export เรียงตารางตามตัวอักษร (audit_logs มาก่อน users) และ D1 ตรวจ foreign key ทันที
// → "no such table: main.users" และ D1 ไม่ยอมให้ปิด foreign_keys
// ทางแก้: ย้าย CREATE TABLE ทั้งหมดขึ้นก่อน แล้วตามด้วย INSERT/INDEX ตามลำดับเดิม (ไม่แก้ข้อมูล)
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('ต้องระบุไฟล์ เช่น bun run backup:prepare -- private/restore-test.sql');
const lines = readFileSync(src, 'utf8').split('\n');

const head = []; // PRAGMA บรรทัดแรก ๆ
const creates = [];
const rest = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^PRAGMA /.test(line) && rest.length === 0 && creates.length === 0) head.push(line);
  else if (/^CREATE TABLE /.test(line)) {
    // บล็อก CREATE TABLE จบที่บรรทัดที่ลงท้ายด้วย ");"
    const block = [line];
    while (!/\);\s*$/.test(lines[i]) && i + 1 < lines.length) block.push(lines[++i]);
    creates.push(...block);
  } else rest.push(line);
}

const out = src.replace(/\.sql$/, '') + '.restore.sql';
writeFileSync(out, [...head, ...creates, ...rest].join('\n'));
const tables = creates.filter((l) => /^CREATE TABLE /.test(l)).length;
console.log(`ย้าย CREATE TABLE ${tables} ตารางขึ้นก่อนข้อมูลแล้ว → ${out}`);
