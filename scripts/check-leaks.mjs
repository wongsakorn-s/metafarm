// ตรวจว่าหน้าสาธารณะไม่เปิดเผยข้อมูลภายใน (🔒) — รันทุกครั้งที่แก้ src/server/public.ts หรือหน้าสาธารณะ
//   npm run check:leaks        ต้องรัน `npm run dev` ไว้ก่อน (ใช้ข้อมูลจริงในฐานข้อมูลบนเครื่อง)
//
// วิธีตรวจ: ดึงข้อมูลลับจริงจาก D1 (ชื่อ/เบอร์คู่ค้า, หมายเหตุภายใน, สาเหตุที่ล่ม, ชื่ออำเภอ/ตำบลของผู้ขาย ฯลฯ)
// แล้วเปิดทุกหน้าสาธารณะ (สมุดพกครบทุกรัง + หน้าแรก + ค้นหา) ค้นหาข้อความเหล่านั้นใน HTML
import { getPlatformProxy } from 'wrangler';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const { env, dispose } = await getPlatformProxy();
const all = async (sql) => (await env.DB.prepare(sql).all()).results;

const hives = await all('SELECT code, origin_place, notes, collapse_reason, purchase_price, sold_price, sale_price, for_sale, status FROM hives ORDER BY id');
const variants = await all('SELECT v.stock_qty, p.slug FROM product_variants v JOIN products p ON p.id = v.product_id');
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

// หน้าสินค้าแสดงราคา/คำว่า "บาท" ได้ตามปกติ จึงไม่ใช้คำต้องห้ามกลุ่มราคา แต่ยังตรวจข้อมูลลับอื่น ๆ + ตัวเลขเฉพาะด้านล่าง
const PRICE_WORDS = new Set(['บาท', 'ราคา']);
const saleHives = hives.filter((h) => h.for_sale && h.status === 'active' && h.sale_price > 0);
const pages = [
  ['/', 'หน้าแรก'], ['/passport', 'ค้นหา'], ['/passport?code=A99999', 'ค้นหาไม่พบ'], ['/passport/A99999', '404'],
  ...hives.map((h) => [`/passport/${h.code}`, h.code]),
  ['/products', 'สินค้า:รวม', 'product'], ['/products/hives', 'สินค้า:รังสมบูรณ์', 'product'],
  ['/products/hive-box', 'สินค้า:รังเปล่า', 'product'], ['/products/stingless-honey', 'สินค้า:น้ำผึ้ง', 'product'],
  ['/products/hives/A99999', '404', 'product'], ['/products/no-such-product', '404', 'product'],
  // หน้าเนื้อหา: น้ำผึ้ง/อบรม แสดงราคาได้ · งานวิจัย/ชันโรง/ติดต่อ/ความเป็นส่วนตัว ห้ามมีคำว่าราคา-บาท (กันดูเหมือนโฆษณาสรรพคุณ)
  ['/honey', 'เนื้อหา:น้ำผึ้ง', 'product'], ['/training', 'เนื้อหา:อบรม', 'product'], ['/training/hive-splitting', 'เนื้อหา:อบรมแยกรัง', 'product'],
  ['/training/honey-processing', 'เนื้อหา:อบรมน้ำผึ้ง', 'product'], ['/training/no-such-course', '404', 'product'],
  ['/stingless-bee', 'เนื้อหา:ชันโรงขนเงิน'], ['/learn/research', 'เนื้อหา:งานวิจัย'], ['/contact', 'เนื้อหา:ติดต่อ'], ['/privacy', 'เนื้อหา:ความเป็นส่วนตัว'],
  ...saleHives.map((h) => [`/products/hives/${h.code}`, `สินค้า:รัง ${h.code}`, 'product', h]),
  // รังที่ไม่ได้ขาย (ยังไม่ตั้งขาย/ขายแล้ว) ต้องเปิดหน้าสินค้าไม่ได้
  ...hives.filter((h) => !saleHives.includes(h)).slice(0, 20).map((h) => [`/products/hives/${h.code}`, '404', 'product']),
];
let bad = 0, scanned = 0;
const report = (page, msg) => { bad++; console.log(`FAIL ${page}  ${msg}`); };
const fmt = (n) => [String(n), Number(n).toLocaleString('th-TH'), Number(n).toLocaleString('en-US')];

for (const [path, label, kind, saleHive] of pages) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const html = await res.text();
  scanned++;
  const expected = label === '404' ? 404 : 200;
  if (res.status !== expected) { report(path, `สถานะ ${res.status} (คาดว่า ${expected})`); continue; }
  const text = norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
  const haystack = html + ' ' + text;
  for (const [secret, why] of secrets) if (haystack.includes(secret)) report(path, `พบข้อมูลลับ "${secret}" (${why})`);
  for (const w of forbiddenWords) if (!(kind === 'product' && PRICE_WORDS.has(w)) && haystack.includes(w)) report(path, `พบคำต้องห้าม "${w}"`);

  if (kind === 'product') {
    // 1) จำนวนสต็อกจริงห้ามโผล่ (เว็บบอกแค่ มี/ไม่มี)
    for (const v of variants) if (v.stock_qty >= 2)
      for (const s of fmt(v.stock_qty)) if (new RegExp(`(?:^|[^\\d,.])${s}\\s*(?:ชิ้น|รัง|ขวด)|(?:เหลือ|คงเหลือ|สต็อก|stock)\\s*:?\\s*${s}(?![\\d,])`, 'i').test(text)) report(path, `พบจำนวนสต็อกจริง ${s} (${v.slug})`);
    // 2) ราคาซื้อ/ราคาที่ขายจริงของรังนี้ ห้ามโผล่ (ราคาที่ตั้งขายแสดงได้)
    if (saleHive) for (const [n, why] of [[saleHive.purchase_price, 'ราคาซื้อ'], [saleHive.sold_price, 'ราคาที่ขายจริง']])
      if (n > 0 && n !== saleHive.sale_price) for (const s of fmt(n)) if (new RegExp(`(?:^|[^\\d,.])${s}\\s*บาท`).test(text)) report(path, `พบ${why} ${s} บาท ของรัง ${saleHive.code}`);
  }
}

// ไฟล์สำหรับ search engine: sitemap ต้องมีเฉพาะ URL สาธารณะ (ไม่มี /admin /media) และ robots ต้องปิด /admin
{
  const sm = await (await fetch(BASE + '/sitemap.xml')).text();
  const rb = await (await fetch(BASE + '/robots.txt')).text();
  scanned += 2;
  if (!sm.includes('<urlset') || /\/admin|\/media\//.test(sm)) report('/sitemap.xml', 'sitemap ว่างหรือมี URL หลังบ้าน');
  for (const h of hives) if (!sm.includes(`/passport/${h.code}<`)) { report('/sitemap.xml', `ไม่มี /passport/${h.code}`); break; }
  for (const [secret, why] of secrets) if (sm.includes(secret)) report('/sitemap.xml', `พบข้อมูลลับ "${secret}" (${why})`);
  // โหมดทดลอง (ช่องทางติดต่อยังเป็นตัวอย่าง) ปิดทั้งเว็บด้วย "Disallow: /" ซึ่งครอบ /admin อยู่แล้ว
  const previewMode = /^Disallow: \/\s*$/m.test(rb);
  if (!previewMode && (!/Disallow: \/admin/.test(rb) || !/Sitemap: /.test(rb))) report('/robots.txt', 'robots.txt ไม่ปิด /admin หรือไม่ชี้ sitemap');
  // รังที่ไม่ได้เปิดขายต้องไม่อยู่ใน sitemap ส่วนสินค้า
  for (const h of hives.filter((x) => !saleHives.includes(x)).slice(0, 30)) if (sm.includes(`/products/hives/${h.code}<`)) { report('/sitemap.xml', `รัง ${h.code} ไม่ได้เปิดขายแต่อยู่ใน sitemap สินค้า`); break; }
}

// รูปสาธารณะ: คีย์ที่ไม่มีในฐานข้อมูล/เดาเอง ต้องเปิดไม่ได้
for (const [path, want] of [['/img/hives/A1/not-a-real-file.jpg', 404], ['/img/hives/A25/../../etc/passwd.jpg', 404], ['/media/hives/A1/A1-1.jpeg', 401]]) {
  const r = await fetch(BASE + path, { redirect: 'manual' });
  if (r.status !== want) report(path, `สถานะ ${r.status} (คาดว่า ${want})`);
  scanned++;
}

console.log(`\nสแกน ${scanned} หน้า/ไฟล์ (รังที่เปิดขายอยู่ ${saleHives.length} รัง) · ข้อความลับที่ใช้ตรวจ ${secrets.size} รายการ + คำต้องห้าม ${forbiddenWords.length} คำ`);
console.log(bad ? `❌ พบปัญหา ${bad} จุด` : '✅ ไม่พบข้อมูลลับหลุดในหน้าสาธารณะ');
process.exit(bad ? 1 : 0);
