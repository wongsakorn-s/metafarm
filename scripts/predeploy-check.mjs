// ตรวจว่าพร้อมขึ้นออนไลน์จริงหรือยัง — บอกสิ่งที่ "ต้องแก้ก่อน" (BLOCKER) และ "ควรแก้" (WARNING)
//   npm run predeploy
// ไม่ได้เชื่อมต่อ Cloudflare จริง: ใช้ข้อมูลในเครื่อง (ซึ่งควรเหมือนที่จะนำขึ้น) + ไฟล์ในโปรเจกต์
// ส่วนของเจ้าของฟาร์ม (ติดต่อ/ราคา/รูป/ข้อมูลรัง) เช็กได้ที่หน้า /admin/readiness เช่นกัน
import { readFileSync, readdirSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { parseSettingRows } from '../src/lib/settings.ts';

const blockers = [], warnings = [], ok = [];
const check = (list, cond, okMsg, msg) => (cond ? ok.push(okMsg) : list.push(msg));

// --- ตั้งค่า Cloudflare (ผู้ดูแลระบบ) ---
const wrangler = readFileSync('wrangler.jsonc', 'utf8');
const dbId = /"database_id"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1] ?? '';
check(blockers, dbId && !/^0{8}-/.test(dbId), 'wrangler.jsonc มี database_id จริง', 'wrangler.jsonc: database_id ยังเป็นค่าปลอม 00000000-… (สร้าง D1 บน Cloudflare แล้วใส่ id จริง — ดู docs/10-deploy-runbook.md)');

const { env, dispose } = await getPlatformProxy();
let settings;
try {
  const one = async (sql) => (await env.DB.prepare(sql).first()) ?? {};
  settings = parseSettingRows((await env.DB.prepare('SELECT key, value FROM settings').all()).results);

  // --- ช่องทางติดต่อ (เจ้าของฟาร์มกรอกที่ /admin/settings) ---
  const c = settings.contact;
  check(blockers, c.confirmed, 'ยืนยันช่องทางติดต่อจริงแล้ว', 'ช่องทางติดต่อยังไม่ได้ยืนยันว่าเป็นข้อมูลจริง (เว็บขึ้นแถบเหลือง "ข้อมูลตัวอย่าง") — กรอกและติ๊กยืนยันที่ /admin/settings');
  const isSample = (v) => /sample|000-0000/i.test(v);
  check(blockers, c.lineId !== '' && !isSample(c.lineId), 'มี LINE ID จริง', `LINE ID ยังว่างหรือเป็นตัวอย่าง (${c.lineId || 'ว่าง'})`);
  check(warnings, c.phone !== '' && !isSample(c.phone), 'มีเบอร์โทรจริง', `เบอร์โทรว่างหรือเป็นตัวอย่าง (${c.phone || 'ว่าง'})`);
  check(warnings, c.facebookUrl !== '' && !isSample(c.facebookUrl), 'มีลิงก์ Facebook จริง', `ลิงก์ Facebook ว่างหรือเป็นตัวอย่าง (${c.facebookUrl || 'ว่าง'})`);
  // แผนที่: ลิงก์ค้นหาตามที่อยู่ (?q=…) ไม่ใช่ตำแหน่งฟาร์มจริง
  check(warnings, c.mapUrl !== '' && !/[?&]q=/.test(c.mapUrl), 'มีลิงก์แผนที่ตำแหน่งฟาร์ม', `ลิงก์แผนที่ว่างหรือเป็นลิงก์ค้นหาตามที่อยู่ ไม่ใช่ตำแหน่งฟาร์ม (${c.mapUrl || 'ว่าง'})`);

  // --- ข้อมูลในฐานข้อมูล ---
  const owners = (await one("SELECT count(*) n FROM users WHERE role = 'owner' AND active = 1")).n;
  check(blockers, owners >= 1, 'มีผู้ใช้ owner ในฐานข้อมูล', 'ไม่มีผู้ใช้ owner (หลังบ้านจะเข้าไม่ได้) — สร้างด้วย npm run user:create -- --print-sql');
  const unconfirmed = (await one('SELECT count(*) n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.published = 1 AND v.price_confirmed = 0')).n;
  check(blockers, unconfirmed === 0, 'ราคาสินค้าทุกรายการยืนยันแล้ว', `ราคาสินค้า ${unconfirmed} ตัวเลือกยังเป็นตัวอย่าง (เว็บแสดงป้าย "ราคาตัวอย่าง") — แก้ที่ /admin/products`);
  const noImg = (await one('SELECT count(*) n FROM products WHERE published = 1 AND image_key IS NULL')).n;
  check(warnings, noImg === 0, 'สินค้าทุกชิ้นมีรูปจริง', `${noImg} สินค้ายังใช้รูปชั่วคราว — อัปโหลดที่ /admin/products`);
  const unknown = (await one("SELECT count(*) n FROM hives WHERE notes LIKE '%???%'")).n;
  check(warnings, unknown === 0, 'ไม่มีรังที่มีข้อมูล ??? ค้างอยู่', `${unknown} รังยังมีข้อมูลที่ไม่ทราบ (???) — เติมหรือตั้งเป็น "ไม่ทราบจริง ๆ" ที่ /admin/todo`);
  const noPhoto = (await one("SELECT count(*) n FROM hives h WHERE h.status = 'active' AND NOT EXISTS (SELECT 1 FROM hive_media m WHERE m.hive_id = h.id AND m.kind = 'passport')")).n;
  check(warnings, noPhoto === 0, 'ทุกรังที่ยังอยู่มีรูปสมุดพก', `${noPhoto} รังที่ยังอยู่ไม่มีรูปสมุดพก — ถ่ายรูปที่ /admin/photos`);
  const saleNoMedia = (await one("SELECT count(*) n FROM hives h WHERE h.for_sale = 1 AND h.status = 'active' AND (SELECT count(*) FROM hive_media m WHERE m.hive_id = h.id AND m.kind = 'sale') < 3")).n;
  check(warnings, saleNoMedia === 0, 'รังที่ตั้งขายมีรูปขายครบ 3 รูป', `${saleNoMedia} รังที่ตั้งขายมีรูปขายไม่ครบ 3 รูป`);
} finally {
  await dispose();
}

// --- เนื้อหา ---
for (const f of readdirSync('content/training')) {
  const slug = f.replace(/\.md$/, '');
  const md = readFileSync(`content/training/${f}`, 'utf8');
  const sampleInFile = /priceIsSample:\s*true/.test(md);
  const confirmed = settings.courses[slug]?.confirmed === true;
  check(warnings, !sampleInFile || confirmed, `อบรม ${slug}: ราคา/ระยะเวลายืนยันแล้ว`, `อบรม ${slug}: ราคาและระยะเวลายังเป็นตัวอย่าง — ยืนยันที่ /admin/settings#courses (เนื้อหาหลักสูตรยังเป็นหัวข้อโดยสังเขป)`);
}
const privacy = readFileSync('content/pages/privacy.md', 'utf8');
check(warnings, !/ร่างเบื้องต้น/.test(privacy), 'นโยบายความเป็นส่วนตัวผ่านการทบทวนแล้ว', 'content/pages/privacy.md ยังเป็นร่างเบื้องต้น ควรให้เจ้าของเว็บ/ผู้รู้ทบทวนก่อนเปิดจริง');
check(warnings, false, '', 'รูป hero และรูปประกอบหน้าอื่นที่เป็นรูปชั่วคราว (public/placeholder/) ยังไม่ได้เปลี่ยน');

console.log('ผ่านแล้ว:'); ok.forEach((m) => console.log(`  ✅ ${m}`));
console.log(`\nต้องแก้ก่อนขึ้นออนไลน์ (${blockers.length}):`); blockers.forEach((m) => console.log(`  ❌ ${m}`));
console.log(`\nควรแก้ (${warnings.length}):`); warnings.forEach((m) => console.log(`  ⚠️  ${m}`));
console.log(blockers.length ? '\n❌ ยังไม่พร้อมขึ้นออนไลน์' : '\n✅ ผ่านเกณฑ์ขั้นต่ำ (ยังควรดูรายการ ⚠️)');
process.exit(blockers.length ? 1 : 0);
