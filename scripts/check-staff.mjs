// ตรวจสิทธิ์พนักงาน (Phase 5.1): ล็อกอินเป็นพนักงานจริง แล้ว
//   1) เปิดทุกหน้าที่พนักงานเข้าได้ (ทุกรัง ทุกหน้าแก้ไข ทุกล็อต ฯลฯ) ค้นหาข้อมูลเงิน/คู่ค้า/ลูกค้าจริงจาก D1 ใน HTML
//   2) หน้าที่เฉพาะเจ้าของต้องได้ 403 ทั้งเปิดหน้า ส่งฟอร์ม และดาวน์โหลด CSV
//   npm run check:staff     ต้องรัน `npm run dev` ไว้ และรัน `npm run check:forms` มาก่อน (ข้อ 15 สร้างบัญชีพนักงานทดสอบ → private/dev-staff.txt)
//
// ยกเว้นโดยตั้งใจ: "หมายเหตุภายใน" ของรัง (พนักงานต้องใช้ทำงาน — ข้อความอิสระอาจมีชื่อคนขายรังปนอยู่)
//   หน้าเว็บครอบส่วนนี้ด้วย data-internal-notes จึงตัดออกก่อนสแกน · ส่วนอื่นทั้งหมดตรวจเต็ม
import { existsSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
if (!existsSync('private/dev-staff.txt')) throw new Error('ไม่พบ private/dev-staff.txt — รัน npm run check:forms ก่อน (ข้อ 15 สร้างบัญชีพนักงานทดสอบ)');
const creds = readFileSync('private/dev-staff.txt', 'utf8').split('\n');
const email = creds[0].split(/:\s*/)[1].trim();
const password = creds[1].split(/:\s*/)[1].trim();

const { env, dispose } = await getPlatformProxy();
const all = async (q) => (await env.DB.prepare(q).all()).results;
const hives = await all('SELECT code, purchase_price, sale_price, sold_price FROM hives ORDER BY id');
const suppliers = await all('SELECT name, phone FROM suppliers');
const customers = await all('SELECT name, phone, line_name, address FROM customers');
const orders = await all('SELECT code, note, tracking_no FROM orders');
const payInfo = await all("SELECT value FROM settings WHERE key = 'payment.info'");
const lots = await all('SELECT code FROM honey_lots');
const costs = await all('SELECT unit_cost FROM bottlings WHERE unit_cost IS NOT NULL UNION SELECT unit_cost FROM product_variants WHERE unit_cost IS NOT NULL');
await dispose();

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const secrets = new Map();
const add = (t, why, min = 4) => { const x = norm(t); if (x.length >= min && !secrets.has(x)) secrets.set(x, why); };
for (const s of suppliers) { add(s.name, 'ชื่อคู่ค้า'); add(s.phone, 'เบอร์คู่ค้า', 8); }
for (const c of customers) { add(c.name, 'ชื่อลูกค้า'); add(c.phone, 'เบอร์ลูกค้า', 8); add(c.line_name, 'LINE ลูกค้า'); (c.address ?? '').split('\n').forEach((l) => add(l, 'ที่อยู่ลูกค้า', 6)); }
for (const o of orders) { add(o.code, 'รหัสออเดอร์'); (o.note ?? '').split('\n').forEach((l) => add(l, 'หมายเหตุออเดอร์', 6)); add(o.tracking_no, 'เลขพัสดุ', 6); }
for (const p of payInfo) (p.value ?? '').split('\n').forEach((l) => add(l, 'ช่องทางชำระเงิน', 6));
// คำ/ลิงก์ที่ไม่ควรมีในหน้าของพนักงาน
const forbidden = ['ราคาซื้อ', 'ราคาขาย', 'คู่ค้า', 'ต้นทุน', 'href="/admin/orders', 'href="/admin/customers', 'href="/admin/products', 'href="/admin/reports', 'href="/admin/settings', 'href="/admin/readiness', 'href="/admin/users'];
const moneyNumbers = new Set([...hives.flatMap((h) => [h.purchase_price, h.sale_price, h.sold_price]), ...costs.map((c) => c.unit_cost)].filter((n) => n > 0));

// ล็อกอิน (เก็บคุกกี้เอง)
const lr = await fetch(BASE + '/admin/login', { method: 'POST', body: new URLSearchParams({ email, password }), redirect: 'manual', headers: { Origin: BASE } });
const cookie = (lr.headers.get('set-cookie') ?? '').split(';')[0];
if (!cookie.startsWith('mf_session=')) throw new Error(`ล็อกอินพนักงานไม่สำเร็จ (${lr.status}) — รัน npm run check:forms ใหม่`);
const get = (p, init = {}) => fetch(BASE + p, { redirect: 'manual', ...init, headers: { cookie, Origin: BASE, ...(init.headers ?? {}) } });

let bad = 0, scanned = 0;
const report = (p, m) => { bad++; console.log(`FAIL ${p}  ${m}`); };
const strip = (html) => html.replace(/<(\w+)[^>]*data-internal-notes[^>]*>[\s\S]*?<\/\1>/g, ' ');
const textOf = (html) => norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));

const pages = ['/admin', '/admin/outbox', '/admin/hives', '/admin/hives?forSale=1', '/admin/hives?status=sold', '/admin/hives/new', '/admin/production', '/admin/quick', '/admin/photos', '/admin/todo', '/admin/more', '/admin/account', '/admin/lots', '/admin/lots/new',
  ...hives.flatMap((h) => [`/admin/hives/${h.code}`, `/admin/hives/${h.code}/edit`]),
  ...lots.flatMap((l) => [`/admin/lots/${l.code}`, `/admin/lots/${l.code}/labels`])];
for (const p of pages) {
  const r = await get(p);
  scanned++;
  if (r.status !== 200) { report(p, `สถานะ ${r.status} (คาด 200)`); continue; }
  const html = strip(await r.text());
  const text = textOf(html);
  const hay = html + ' ' + text;
  for (const [s, why] of secrets) if (hay.includes(s)) report(p, `พบ${why} "${s}"`);
  for (const w of forbidden) if (hay.includes(w)) report(p, `พบ "${w}"`);
  // จำนวนเงินใด ๆ (ตัวเลขตามด้วย บาท/฿) — ไม่ใช้คำว่า "บาท" เฉย ๆ เพราะอยู่ในคำว่า "บทบาท"
  for (const m of text.matchAll(/\d[\d,]*\s*(?:บาท|฿)/g)) report(p, `พบจำนวนเงิน "${m[0]}"`);
  for (const n of moneyNumbers) for (const s of [String(n), n.toLocaleString('en-US')]) if (new RegExp(`(?:^|[^\\d,.])${s}\\s*(?:บาท|฿)`).test(text)) report(p, `พบจำนวนเงิน ${s}`);
}

// หน้าที่เฉพาะเจ้าของ: เปิดหน้า → 403 (หน้า "ไม่มีสิทธิ์") · ส่งฟอร์ม/ดาวน์โหลด → 403
const denied = [
  ['GET', '/admin/orders'], ['GET', '/admin/orders/new'], ['GET', '/admin/customers'], ['GET', '/admin/products'], ['GET', '/admin/reports'],
  ['GET', '/admin/reports/export/customers.csv'], ['GET', '/admin/reports/export/orders.csv'], ['GET', '/admin/settings'], ['GET', '/admin/readiness'], ['GET', '/admin/users'],
  ['POST', '/admin/products'], ['POST', '/admin/orders/new'], ['POST', '/admin/settings'], ['POST', '/admin/users'],
  ...(orders[0] ? [['GET', `/admin/orders/${orders[0].code}`], ['POST', `/admin/orders/${orders[0].code}`]] : []),
];
for (const [m, p] of denied) {
  const r = await get(p, m === 'POST' ? { method: 'POST', body: new URLSearchParams({ intent: 'x' }) } : {});
  const t = await r.text();
  scanned++;
  if (r.status !== 403) report(`${m} ${p}`, `สถานะ ${r.status} (คาด 403)`);
  for (const [s, why] of secrets) if (t.includes(s)) report(`${m} ${p}`, `หน้าปฏิเสธมี${why} "${s}"`);
}

console.log(`\nพนักงาน ${email}: สแกน ${scanned} หน้า/คำขอ · ข้อความลับ ${secrets.size} รายการ · ตัวเลขเงิน ${moneyNumbers.size} ค่า · คำต้องห้าม ${forbidden.length} คำ`);
console.log(bad ? `❌ พบปัญหา ${bad} จุด` : '✅ พนักงานไม่เห็นข้อมูลเงิน/ลูกค้า/คู่ค้า และเข้าหน้าของเจ้าของไม่ได้');
process.exit(bad ? 1 : 0);
