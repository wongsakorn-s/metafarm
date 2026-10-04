// ตรวจว่าหน้าสาธารณะไม่เปิดเผยข้อมูลภายใน (🔒) — รันทุกครั้งที่แก้ src/server/public.ts หรือหน้าสาธารณะ
//   npm run check:leaks        ต้องรัน `npm run dev` ไว้ก่อน (ใช้ข้อมูลจริงในฐานข้อมูลบนเครื่อง)
//
// วิธีตรวจ: ดึงข้อมูลลับจริงจาก D1 (ชื่อ/เบอร์คู่ค้า, หมายเหตุภายใน, สาเหตุที่ล่ม, ชื่ออำเภอ/ตำบลของผู้ขาย ฯลฯ)
// แล้วเปิดทุกหน้าสาธารณะ (สมุดพกครบทุกรัง + หน้าแรก + ค้นหา) ค้นหาข้อความเหล่านั้นใน HTML
import { getPlatformProxy } from 'wrangler';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const { env, dispose } = await getPlatformProxy();
const all = async (sql) => (await env.DB.prepare(sql).all()).results;

const hives = await all('SELECT code, origin_place, notes, collapse_reason, purchase_price, sold_price, sale_price FROM hives ORDER BY id');
const suppliers = await all('SELECT name, phone, notes FROM suppliers');
const customers = await all('SELECT name, phone FROM customers');
await dispose();

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const secrets = new Map(); // ข้อความลับ → ที่มา
const add = (text, why, min = 4) => { const t = norm(text); if (t.length >= min && !secrets.has(t)) secrets.set(t, why); };

for (const s of suppliers) { add(s.name, 'ชื่อคู่ค้า'); add(s.phone, 'เบอร์คู่ค้า', 8); (s.notes ?? '').split('\n').forEach((l) => add(l, 'หมายเหตุคู่ค้า', 6)); }
for (const c of customers) { add(c.name, 'ชื่อลูกค้า'); add(c.phone, 'เบอร์ลูกค้า', 8); }
const FARM_TOKENS = new Set(['ปลวกแดง', 'หนองไร่', 'ระยอง']);
for (const h of hives) {
  (h.notes ?? '').split('\n').forEach((l) => add(l, `หมายเหตุภายใน ${h.code}`, 6));
  add(h.collapse_reason, `สาเหตุที่ล่ม ${h.code}`);
  // ชื่ออำเภอ/ตำบลของผู้ขาย (สมุดพกต้องแสดงแค่จังหวัด)
  for (const m of norm(h.origin_place).matchAll(/[อต]\.\s*([^\s]+)/g)) if (m[1] !== 'เมือง' && !FARM_TOKENS.has(m[1])) add(m[1], `อำเภอ/ตำบลผู้ขาย (${h.code})`, 3);
}
// ตัดวลี "ทั่วไป" ออกจากรายการข้อมูลลับ (ไม่ใช่ข้อมูลของใครโดยเฉพาะ จึงเป็นเรื่องปกติที่จะอยู่บนหน้าเว็บ):
//  1) ป้ายกำกับเปล่าที่ไม่มีค่าตามหลัง เช่น "ไข่อ่อนจาก" "นางพญาเกิด :"
//  2) วลีที่ปรากฏอยู่แล้วในหน้าที่ไม่มีข้อมูลรังเลย (หน้าแรก หน้าค้นหา หน้า 404)
// แสดงรายการที่ตัดออกทุกครั้ง เพื่อให้ตรวจดูได้ว่าไม่ได้ซ่อนของจริง
const textOf = (html) => norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
const baseline = (await Promise.all(['/', '/passport', '/passport/A99999'].map(async (p) => textOf(await (await fetch(BASE + p)).text())))).join(' ');
const LABEL_ONLY = /^(ไข่อ่อน|ไข่นาง|ไข่อ่อนและไข่นาง)(พญา)?จาก$|:$/;
const generic = [];
for (const [t, why] of [...secrets]) {
  if (why.startsWith('หมายเหตุ') && (LABEL_ONLY.test(t) || baseline.includes(t))) { secrets.delete(t); generic.push(t); }
}
if (generic.length) console.log(`ตัดวลีทั่วไปออกจากการตรวจ ${generic.length} รายการ: ${[...new Set(generic)].map((g) => `"${g}"`).join(', ')}\n`);

// คำที่ห้ามปรากฏ: ราคา/เงิน และชื่อฟิลด์ภายใน
const forbiddenWords = ['บาท', 'ราคา', 'คู่ค้า', '???', 'purchase', 'supplier', 'for_sale', 'forSale', 'sold_price', 'sale_price', 'salePrice', 'passwordHash', 'password_hash'];

const pages = [['/', 'หน้าแรก'], ['/passport', 'ค้นหา'], ['/passport?code=A99999', 'ค้นหาไม่พบ'], ['/passport/A99999', '404'], ...hives.map((h) => [`/passport/${h.code}`, h.code])];
let bad = 0, scanned = 0;
const report = (page, msg) => { bad++; console.log(`FAIL ${page}  ${msg}`); };

for (const [path, label] of pages) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const html = await res.text();
  scanned++;
  const expected = label === '404' ? 404 : 200;
  if (res.status !== expected) { report(path, `สถานะ ${res.status} (คาดว่า ${expected})`); continue; }
  const text = norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
  const haystack = html + ' ' + text;
  for (const [secret, why] of secrets) if (haystack.includes(secret)) report(path, `พบข้อมูลลับ "${secret}" (${why})`);
  for (const w of forbiddenWords) if (haystack.includes(w)) report(path, `พบคำต้องห้าม "${w}"`);
}

// รูปสาธารณะ: คีย์ที่ไม่มีในฐานข้อมูล/เดาเอง ต้องเปิดไม่ได้
for (const [path, want] of [['/img/hives/A1/not-a-real-file.jpg', 404], ['/img/hives/A25/../../etc/passwd.jpg', 404], ['/media/hives/A1/A1-1.jpeg', 401]]) {
  const r = await fetch(BASE + path, { redirect: 'manual' });
  if (r.status !== want) report(path, `สถานะ ${r.status} (คาดว่า ${want})`);
  scanned++;
}

console.log(`\nสแกน ${scanned} หน้า/ไฟล์ · ข้อความลับที่ใช้ตรวจ ${secrets.size} รายการ + คำต้องห้าม ${forbiddenWords.length} คำ`);
console.log(bad ? `❌ พบปัญหา ${bad} จุด` : '✅ ไม่พบข้อมูลลับหลุดในหน้าสาธารณะ');
process.exit(bad ? 1 : 0);
