// ส่งออก "ข้อมูลปัจจุบัน" ในเครื่อง (ฐานข้อมูล + รูป) เพื่อนำขึ้นระบบจริง โดยไม่เสียสิ่งที่เจ้าของกรอกไว้แล้ว
//   npm run snapshot:export
//   → private/export/snapshot.sql   (SQL ข้อมูลเนื้อหา: รัง ประวัติ รูป สินค้า การตั้งค่า ฯลฯ)
//   → private/export/media/…        (รูปทั้งหมดที่ฐานข้อมูลอ้างถึง ชื่อไฟล์ตรงกับ key ใน R2)
//
// ไม่ส่งออก: users / sessions / login_attempts / audit_logs (ระบบจริงต้องมีผู้ใช้และรหัสผ่านของตัวเอง — ดู user:create --print-sql)
// ⚠️ snapshot.sql "ล้างข้อมูลเนื้อหาทั้งหมดในฐานข้อมูลปลายทางก่อน" แล้วนำเข้าใหม่
//    ระบบจริงเปิดใช้แล้ว (2026-10-05) และเป็นที่เก็บข้อมูลหลัก → ไฟล์นี้ใช้ได้เฉพาะฐานข้อมูลในเครื่อง/ฐานข้อมูลเปล่า
//    มีตัวกันในไฟล์ (scripts/local-only-guard.ts): ถ้าปลายทางมีบัญชีอีเมลจริง SQL จะหยุดก่อนลบอะไร
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { localOnlyGuard } from './local-only-guard.ts';

const OUT = 'private/export';
// ลำดับนำเข้า (ตารางที่ถูกอ้างถึงมาก่อน) · ลบย้อนลำดับนี้
const TABLES = ['species', 'suppliers', 'customers', 'products', 'product_variants', 'hives', 'hive_events', 'hive_media', 'settings', 'honey_lots', 'lot_sources', 'bottlings', 'orders', 'order_items', 'hive_holds', 'weather_daily'] as const;
// คอลัมน์ที่อ้างถึงตาราง users ซึ่งไม่ส่งออก → ตั้งเป็น NULL
const NULL_COLS: Record<string, string[]> = { hive_events: ['created_by'], orders: ['created_by'], honey_lots: ['created_by'], bottlings: ['created_by'] };
// คอลัมน์อ้างถึงแถวอื่นในตารางเดียวกัน → ใส่ NULL ก่อน แล้ว UPDATE หลังนำเข้าครบ (รังแม่อาจมีเลขมากกว่ารังลูก)
const SELF_REFS: Record<string, string[]> = { hives: ['queen_source_hive_id', 'brood_source_hive_id'] };

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};

const { env, dispose } = await getPlatformProxy<{ DB: D1Database; MEDIA: R2Bucket }>();
try {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'media'), { recursive: true });

  const lines: string[] = [
    `-- MetaFarm snapshot ${new Date().toISOString()} (สร้างโดย scripts/export-snapshot.ts — ห้ามแก้มือ)`,
    '-- ⚠️ ล้างข้อมูลเนื้อหาในฐานข้อมูลปลายทางก่อนนำเข้า (ไม่แตะ users/sessions/audit_logs) — ห้ามรันกับระบบจริง',
    ...localOnlyGuard(),
    'PRAGMA defer_foreign_keys = on;',
    ...[...TABLES].reverse().map((t) => `DELETE FROM ${t};`),
  ];
  const counts: Record<string, number> = {};
  const tail: string[] = [];

  for (const t of TABLES) {
    const info = (await env.DB.prepare(`PRAGMA table_info(${t})`).all<{ name: string }>()).results.map((c) => c.name);
    const rows = (await env.DB.prepare(`SELECT * FROM ${t}${info.includes('id') ? ' ORDER BY id' : ''}`).all<Record<string, unknown>>()).results;
    counts[t] = rows.length;
    const nulled = new Set(NULL_COLS[t] ?? []);
    const selfRefs = SELF_REFS[t] ?? [];
    for (const r of rows) {
      const vals = info.map((c) => (nulled.has(c) || selfRefs.includes(c) ? 'NULL' : lit(r[c])));
      lines.push(`INSERT INTO ${t} (${info.join(', ')}) VALUES (${vals.join(', ')});`);
      if (selfRefs.some((c) => r[c] != null)) tail.push(`UPDATE ${t} SET ${selfRefs.map((c) => `${c} = ${lit(r[c])}`).join(', ')} WHERE id = ${lit(r.id)};`);
    }
  }
  lines.push(...tail);
  writeFileSync(join(OUT, 'snapshot.sql'), lines.join('\n') + '\n');

  // รูป: คัดลอกเฉพาะที่ฐานข้อมูลอ้างถึง
  const keys = [
    ...(await env.DB.prepare(`SELECT r2_key k FROM hive_media WHERE r2_key IS NOT NULL`).all<{ k: string }>()).results.map((r) => r.k),
    ...(await env.DB.prepare(`SELECT image_key k FROM products WHERE image_key IS NOT NULL`).all<{ k: string }>()).results.map((r) => r.k),
    ...(await env.DB.prepare(`SELECT r2_key k FROM product_photos`).all<{ k: string }>()).results.map((r) => r.k),
  ];
  let copied = 0, missing = 0, bytes = 0;
  for (const key of keys) {
    const obj = await env.MEDIA.get(key);
    if (!obj) { missing++; console.error(`ไม่พบในที่เก็บรูป: ${key}`); continue; }
    const buf = Buffer.from(await obj.arrayBuffer());
    const path = join(OUT, 'media', ...key.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    copied++; bytes += buf.length;
  }

  console.log('ตารางที่ส่งออก:', Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' · '));
  console.log(`รูป: ${copied} ไฟล์ (${(bytes / 1048576).toFixed(1)} MB)${missing ? ` · ⚠️ ไฟล์ที่ฐานข้อมูลอ้างแต่ไม่มีในที่เก็บ ${missing}` : ''}`);
  console.log(`→ ${OUT}/snapshot.sql, ${OUT}/media/`);
} finally {
  await dispose();
}
