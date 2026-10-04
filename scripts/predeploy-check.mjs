// ตรวจว่าพร้อมขึ้นออนไลน์จริงหรือยัง — บอกสิ่งที่ "ต้องแก้ก่อน" (BLOCKER) และ "ควรแก้" (WARNING)
//   npm run predeploy
// ไม่ได้เชื่อมต่อ Cloudflare จริง: ใช้ข้อมูลในเครื่อง (ซึ่งควรเหมือนที่จะนำขึ้น) + ไฟล์ในโปรเจกต์
import { readFileSync, readdirSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { site, isSet } from '../src/config/site.ts';

const blockers = [], warnings = [], ok = [];
const check = (list, cond, okMsg, msg) => (cond ? ok.push(okMsg) : list.push(msg));

// --- ข้อมูลติดต่อ ---
check(blockers, site.contactIsSample === false, 'ตั้ง contactIsSample = false แล้ว', 'src/config/site.ts: contactIsSample ยังเป็น true (เว็บจะขึ้นแถบเหลือง "ข้อมูลตัวอย่าง" ให้ลูกค้าเห็น)');
for (const [k, label] of [['lineId', 'LINE ID'], ['phone', 'เบอร์โทร'], ['facebookUrl', 'Facebook'], ['mapUrl', 'ลิงก์แผนที่']]) {
  const v = site.contact[k];
  // แผนที่: ลิงก์ค้นหาตามที่อยู่ (?q=…) ไม่ใช่ตำแหน่งฟาร์มจริง → ให้ใช้ลิงก์แชร์ตำแหน่งจาก Google Maps แทน
  const sample = !isSet(v) || /sample|000-0000|metafarm\.sample/i.test(v) || (k === 'mapUrl' && /[?&]q=/.test(v));
  (k === 'lineId' ? blockers : warnings).push(...(sample ? [`ช่องทางติดต่อ "${label}" ยังเป็นค่าตัวอย่าง/ว่าง${k === 'mapUrl' ? ' (เป็นลิงก์ค้นหาตามที่อยู่ ยังไม่ใช่ตำแหน่งฟาร์ม)' : ''} (${v})`] : []));
  if (!sample) ok.push(`ช่องทางติดต่อ ${label} ตั้งค่าแล้ว`);
}

// --- ตั้งค่า Cloudflare ---
const wrangler = readFileSync('wrangler.jsonc', 'utf8');
const dbId = /"database_id"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1] ?? '';
check(blockers, dbId && !/^0{8}-/.test(dbId), 'wrangler.jsonc มี database_id จริง', 'wrangler.jsonc: database_id ยังเป็นค่าปลอด 00000000-… (สร้าง D1 บน Cloudflare แล้วใส่ id จริง — ดู docs/10-deploy-runbook.md)');

// --- ข้อมูลในฐานข้อมูล ---
const { env, dispose } = await getPlatformProxy();
try {
  const one = async (sql) => (await env.DB.prepare(sql).first()) ?? {};
  const owners = (await one("SELECT count(*) n FROM users WHERE role = 'owner' AND active = 1")).n;
  check(blockers, owners >= 1, 'มีผู้ใช้ owner ในฐานข้อมูล', 'ไม่มีผู้ใช้ owner (หลังบ้านจะเข้าไม่ได้) — สร้างด้วย npm run user:create -- --print-sql');
  const unconfirmed = (await one('SELECT count(*) n FROM product_variants WHERE price_confirmed = 0')).n;
  check(warnings, unconfirmed === 0, 'ราคาสินค้าทุกรายการยืนยันแล้ว', `ราคาสินค้า ${unconfirmed} ตัวเลือกยังเป็นตัวอย่าง (เว็บแสดงป้าย "ราคาตัวอย่าง") — แก้ที่ /admin/products`);
  const unknown = (await one("SELECT count(*) n FROM hives WHERE notes LIKE '%???%'")).n;
  check(warnings, unknown === 0, 'ไม่มีรังที่มีข้อมูล ??? ค้างอยู่', `${unknown} รังยังมีข้อมูลที่ไม่ทราบ (???) — ดูที่ /admin/hives?incomplete=1`);
  const noPhoto = (await one("SELECT count(*) n FROM hives h WHERE h.status = 'active' AND NOT EXISTS (SELECT 1 FROM hive_media m WHERE m.hive_id = h.id AND m.kind = 'passport')")).n;
  check(warnings, noPhoto === 0, 'ทุกรังที่ยังอยู่มีรูปสมุดพก', `${noPhoto} รังที่ยังอยู่ไม่มีรูปสมุดพก (เว็บแสดงรูปชั่วคราว)`);
  const saleNoMedia = (await one("SELECT count(*) n FROM hives h WHERE h.for_sale = 1 AND h.status = 'active' AND (SELECT count(*) FROM hive_media m WHERE m.hive_id = h.id AND m.kind = 'sale') < 3")).n;
  check(warnings, saleNoMedia === 0, 'รังที่ตั้งขายมีรูปขายครบ 3 รูป', `${saleNoMedia} รังที่ตั้งขายมีรูปขายไม่ครบ 3 รูป`);
} finally {
  await dispose();
}

// --- เนื้อหา ---
for (const f of readdirSync('content/training')) {
  const md = readFileSync(`content/training/${f}`, 'utf8');
  check(warnings, !/priceIsSample:\s*true/.test(md) && !/ตัวอย่าง\)/.test(md), `อบรม ${f}: ราคา/ระยะเวลายืนยันแล้ว`, `content/training/${f}: ราคาหรือระยะเวลายังเป็นตัวอย่าง (priceIsSample: true) และเนื้อหาเป็นหัวข้อโดยสังเขป`);
}
const privacy = readFileSync('content/pages/privacy.md', 'utf8');
check(warnings, !/ร่างเบื้องต้น/.test(privacy), 'นโยบายความเป็นส่วนตัวผ่านการทบทวนแล้ว', 'content/pages/privacy.md ยังเป็นร่างเบื้องต้น ควรให้เจ้าของเว็บ/ผู้รู้ทบทวนก่อนเปิดจริง');
check(warnings, false, '', 'ภาพสินค้ารังเปล่า/น้ำผึ้ง และรูป hero ยังเป็นรูปชั่วคราว (public/placeholder/) — เปลี่ยนเป็นรูปจริง');

console.log('ผ่านแล้ว:'); ok.forEach((m) => console.log(`  ✅ ${m}`));
console.log(`\nต้องแก้ก่อนขึ้นออนไลน์ (${blockers.length}):`); blockers.forEach((m) => console.log(`  ❌ ${m}`));
console.log(`\nควรแก้ (${warnings.length}):`); warnings.forEach((m) => console.log(`  ⚠️  ${m}`));
console.log(blockers.length ? '\n❌ ยังไม่พร้อมขึ้นออนไลน์' : '\n✅ ผ่านเกณฑ์ขั้นต่ำ (ยังควรดูรายการ ⚠️)');
process.exit(blockers.length ? 1 : 0);
