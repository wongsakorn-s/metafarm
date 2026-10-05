// ทดสอบ "ส่งฟอร์มจริง" ในเบราว์เซอร์ — สิ่งที่ check:browser (เปิดหน้าอย่างเดียว) จับไม่ได้
//   npm run check:forms      ต้องรัน `npm run dev` ไว้ และมี private/dev-owner.txt
//
// ⚠️ เขียนข้อมูลจริงลงฐานข้อมูล "ในเครื่อง" (เหตุการณ์ทดสอบ, รังใหม่ 1 รัง, รูปทดสอบ) — จึงยอมรันกับ localhost เท่านั้น
//    ล้างกลับเป็นข้อมูล Excel: npm run db:seed:local && npm run media:seed:local -- --prune
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('check:forms เขียนข้อมูล — รันกับ localhost เท่านั้น');

const creds = readFileSync('private/dev-owner.txt', 'utf8').split('\n');
const email = creds[0].split(/:\s*/)[1].trim();
const password = creds[1].split(/:\s*/)[1].trim();

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let failed = 0;
const ok = (m) => console.log(`   ✅ ${m}`);
const fail = (m) => { failed++; console.log(`   ❌ ${m}`); };
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));

await page.goto(BASE + '/admin/login');
await page.fill('#email', email);
await page.fill('#password', password);
await Promise.all([page.waitForURL('**/admin'), page.press('#password', 'Enter')]);

/** จำนวนประวัติในหน้ารัง ("ประวัติ (N)") */
const eventCount = async (code) => {
  await page.goto(`${BASE}/admin/hives/${code}`);
  return Number((await page.textContent('#tl-h')).match(/\d+/)[0]);
};
/** POST ฟอร์มด้วย fetch จากในหน้า (ใช้คุกกี้ล็อกอินเดียวกัน) */
const post = (url, fields, headers = {}) =>
  page.evaluate(async ({ url, fields, headers }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(url, { method: 'POST', body: fd, headers });
    return { status: r.status, url: r.url, body: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : null };
  }, { url, fields, headers });

// หารังที่ยังอยู่ (active) มาใช้ทดสอบ
await page.goto(BASE + '/admin/hives?status=active');
const [HIVE, HIVE2] = await page.$$eval('a[href^="/admin/hives/A"]', (as) => [...new Set(as.map((a) => a.getAttribute('href').split('/')[3]))].filter((c) => /^A\d+$/.test(c)).slice(0, 2));
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

console.log(`\n1) หน้ารัง ${HIVE}: กรอกผิด → ฟอร์มอื่นไม่ได้คีย์กันซ้ำร่วมกัน / ข้อความผิดชี้ช่อง`);
{
  const before = await eventCount(HIVE);
  await page.click('summary:has-text("เก็บน้ำหวาน")');
  await Promise.all([page.waitForLoadState('load'), page.click('button:has-text("บันทึกการเก็บน้ำหวาน")')]);
  await page.waitForTimeout(300);
  check(await page.isVisible('[role=alert]:has-text("ยังไม่ได้บันทึก")'), 'ส่งฟอร์มว่าง → แถบแจ้ง "ยังไม่ได้บันทึก" ด้านบน', 'ไม่มีแถบแจ้งเมื่อกรอกผิด');
  const a11y = await page.evaluate(() => ({ invalid: document.getElementById('h-ml')?.getAttribute('aria-invalid'), focused: document.activeElement?.id }));
  check(a11y.invalid === 'true' && a11y.focused === 'h-ml', 'ช่องที่ผิดถูกทำเครื่องหมาย (aria-invalid) และได้โฟกัส', `ช่องที่ผิดไม่ถูกชี้ (${JSON.stringify(a11y)})`);
  const idems = await page.$$eval('input[name=idem]', (els) => els.map((e) => e.value));
  check(new Set(idems).size === idems.length, `คีย์กันซ้ำของ ${idems.length} ฟอร์มไม่ซ้ำกัน`, `ฟอร์มใช้คีย์กันซ้ำร่วมกัน: ${idems.join(', ')}`);

  // คีย์เดียวกันแต่คนละชนิดเหตุการณ์ → บันทึกทั้งคู่ · ส่งซ้ำชนิดเดิม → บันทึกครั้งเดียว
  const key = crypto.randomUUID();
  await post(`/admin/hives/${HIVE}`, { intent: 'note', occurredOn: today, note: 'form-check: โน้ตทดสอบ', idem: key });
  await post(`/admin/hives/${HIVE}`, { intent: 'note', occurredOn: today, note: 'form-check: โน้ตทดสอบ', idem: key });
  await post(`/admin/hives/${HIVE}`, { intent: 'honey', occurredOn: today, honeyMl: '15', idem: key });
  const after = await eventCount(HIVE);
  check(after === before + 2, 'คีย์เดียวกัน: โน้ตส่งซ้ำบันทึกครั้งเดียว และน้ำผึ้งไม่ถูกกลืน (+2 รายการ)', `จำนวนประวัติ ${before} → ${after} (คาด +2)`);

  // แตะปุ่มรัว ๆ → ปุ่มถูกล็อก บันทึกครั้งเดียว
  await page.click('summary:has-text("หมายเหตุ")');
  await page.fill('#n-note', 'form-check: กดสองครั้ง');
  // แตะสองครั้งห่างกัน 40 ms (นิ้วจริง) ในหน้าเดียวกัน ก่อนหน้าใหม่โหลด
  await Promise.all([
    page.waitForURL(/saved=note/),
    page.evaluate(async () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('บันทึกหมายเหตุ'));
      b.click();
      await new Promise((r) => setTimeout(r, 40));
      b.click();
    }),
  ]);
  const after2 = await eventCount(HIVE);
  check(after2 === after + 1, 'กดปุ่มบันทึกสองครั้ง → บันทึกครั้งเดียว', `จำนวนประวัติ ${after} → ${after2} (คาด +1)`);
}

console.log(`\n2) เปลี่ยนสถานะรัง ${HIVE}: ต้องเลือกเองและยืนยันก่อน`);
{
  await page.goto(`${BASE}/admin/hives/${HIVE}`);
  await page.click('summary:has-text("เปลี่ยนสถานะรัง")');
  check((await page.$eval('#st-s', (s) => s.value)) === '', 'ไม่มีสถานะถูกเลือกไว้ก่อน (ต้องเลือกเอง)', 'สถานะใหม่ถูกเลือกไว้ล่วงหน้า');
  await page.selectOption('#st-s', 'collapsed');
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('button:has-text("ยืนยันเปลี่ยนสถานะ")');
  await page.waitForTimeout(500);
  check(asked.includes(HIVE) && asked.includes('ล่ม'), `ถามยืนยันพร้อมรหัสรังและสถานะ: "${asked}"`, `ไม่ถามยืนยัน หรือข้อความไม่ระบุสถานะ ("${asked}")`);
  check(!page.url().includes('saved='), 'กดยกเลิก → ไม่เปลี่ยนสถานะ', 'กดยกเลิกแล้วยังส่งฟอร์ม');
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForURL(/saved=status/), page.click('button:has-text("ยืนยันเปลี่ยนสถานะ")')]);
  ok('กดยืนยัน → เปลี่ยนสถานะแล้ว');
  // คืนสถานะเดิม
  await page.click('summary:has-text("เปลี่ยนสถานะรัง")');
  await page.selectOption('#st-s', 'active');
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForURL(/saved=status/), page.click('button:has-text("ยืนยันเปลี่ยนสถานะ")')]);
  ok('คืนสถานะ "ยังอยู่" แล้ว');
}

console.log('\n3) เพิ่มรัง: ส่งซ้ำพร้อมกันด้วยคีย์เดิม → ได้รังเดียว');
{
  await page.goto(BASE + '/admin/hives/new');
  const next = (await page.textContent('button:has-text("สร้างรัง")')).match(/A\d+/)[0];
  const fields = await page.$eval('form:has([name=origin])', (f) => Object.fromEntries([...new FormData(f)].filter(([, v]) => typeof v === 'string')));
  fields.origin = 'split';
  fields.notes = 'form-check: รังทดสอบ (ลบได้)';
  const [r1, r2] = await Promise.all([post('/admin/hives/new', fields), post('/admin/hives/new', fields)]);
  const codes = [r1.url, r2.url].map((u) => u.match(/hives\/(A\d+)/)?.[1]);
  check(codes[0] === next && codes[1] === next, `ทั้งสองคำขอได้รัง ${next} เดียวกัน`, `ได้รัง ${codes.join(' / ')} (คาด ${next} ทั้งคู่)`);
  await page.goto(BASE + '/admin/hives/new');
  const after = (await page.textContent('button:has-text("สร้างรัง")')).match(/A\d+/)[0];
  check(after === `A${Number(next.slice(1)) + 1}`, `รังถัดไปเป็น ${after} (สร้างเพิ่มแค่ 1 รัง)`, `รังถัดไปเป็น ${after} — สร้างซ้ำ`);
}

console.log('\n4) คิวถ่ายรูป: ผลจริงจากเซิร์ฟเวอร์ / สัญญาณหลุดแล้วส่งรูปเดิมซ้ำ / ไม่บันทึกซ้ำ');
{
  await page.goto(BASE + '/admin/photos');
  const [c1, c2, c3] = await page.$$eval('li[data-code]', (els) => els.slice(0, 3).map((e) => e.dataset.code));
  const left = async () => Number(await page.textContent('#left'));
  const before = await left();
  const pick = (code, kind) => page.locator(`li[data-code="${code}"] input[id^="pick-"]`).evaluate(async (el, kind) => {
    let file;
    if (kind === 'text') file = new File(['not an image'], 'IMG_0002.jpg', { type: 'image/jpeg' });
    else {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 900;
      const g = cv.getContext('2d'); g.fillStyle = '#0b7a3e'; g.fillRect(0, 0, 1200, 900); g.fillStyle = '#f2c230'; g.fillRect(300, 200, 400, 300);
      file = new File([await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9))], 'IMG_0001.jpg', { type: 'image/jpeg' });
    }
    const dt = new DataTransfer(); dt.items.add(file);
    el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, kind);
  const stateOf = (code) => page.locator(`li[data-code="${code}"] [data-state]`);

  // ไฟล์ที่ไม่ใช่รูป → เซิร์ฟเวอร์ข้าม → ต้องไม่ขึ้น ✅
  await pick(c1, 'text');
  await stateOf(c1).filter({ hasText: 'ไม่ได้บันทึกรูป' }).waitFor({ timeout: 20000 }).catch(() => {});
  const t1 = (await stateOf(c1).textContent()).trim();
  check(t1.includes('ไม่ได้บันทึกรูป') && !t1.includes('✅'), `ไฟล์ที่ไม่ใช่รูป → "${t1}"`, `ขึ้นว่าสำเร็จทั้งที่เซิร์ฟเวอร์ไม่บันทึก: "${t1}"`);
  check((await left()) === before, 'ตัวนับคิวไม่ลด', 'ตัวนับคิวลดทั้งที่ไม่ได้บันทึก');

  // สัญญาณหลุด → ปุ่ม "ส่งรูปเดิมอีกครั้ง" → สัญญาณกลับ กดแล้วสำเร็จ (ไม่ต้องถ่ายใหม่)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await pick(c2, 'image');
  const retry = page.locator(`li[data-code="${c2}"] [data-retry]`);
  await retry.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  check(await retry.isVisible(), 'สัญญาณหลุด → มีปุ่ม "ส่งรูปเดิมอีกครั้ง"', 'สัญญาณหลุดแล้วไม่มีปุ่มส่งซ้ำ (ต้องถ่ายใหม่)');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await retry.click();
  await stateOf(c2).filter({ hasText: '✅' }).waitFor({ timeout: 20000 }).catch(() => {});
  const t2 = (await stateOf(c2).textContent()).trim();
  check(t2.startsWith('✅') && t2.includes('เพิ่มแล้ว 1 รูป'), `กดส่งซ้ำสำเร็จ → "${t2}"`, `ส่งซ้ำไม่สำเร็จ: "${t2}"`);
  check((await left()) === before - 1, 'ตัวนับคิวลดลง 1', 'ตัวนับคิวไม่ลด');

  // ชุดเดิมส่งซ้ำพร้อมกัน (เน็ตหลุดหลังเซิร์ฟเวอร์ได้รับ) → บันทึกรูปเดียว
  const batch = crypto.randomUUID();
  const dup = await page.evaluate(async ({ code, batch }) => {
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; cv.getContext('2d').fillRect(0, 0, 800, 600);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.8));
    const send = () => {
      const fd = new FormData();
      fd.append('intent', 'upload'); fd.append('kind', 'passport'); fd.append('batch', batch); fd.append('file', new File([blob], 'a.webp', { type: 'image/webp' }));
      return fetch(`/admin/hives/${code}/media`, { method: 'POST', body: fd, headers: { Accept: 'application/json' } }).then((r) => r.json());
    };
    const rs = await Promise.all([send(), send()]);
    rs.push(await send());
    return rs;
  }, { code: c3, batch });
  await page.goto(`${BASE}/admin/hives/${c3}/media`);
  const n = await page.locator('img[src^="/media/hives/"]').count();
  check(dup.every((r) => r.ok) && n === 1, `ส่งชุดเดิม 3 ครั้ง (2 ครั้งพร้อมกัน) → ทุกครั้งตอบสำเร็จ และมีรูปเดียว`, `ได้ ${n} รูป · ผล ${JSON.stringify(dup.map((r) => r.message))}`);
  console.log(`   ℹ️ รังที่ได้รูปทดสอบ: ${c2}, ${c3}`);
}

console.log('\n5) หน้าสินค้า: ราคาตัวอย่างไม่หลุดไปกับข้อความ LINE / คำอธิบาย');
{
  await page.goto(BASE + '/products/stingless-honey');
  const sample = await page.locator('text=ราคาตัวอย่าง').count();
  const lines = await page.$$eval('a[href*="line.me"]', (as) => as.map((a) => decodeURIComponent(a.href)));
  const desc = await page.getAttribute('meta[name=description]', 'content');
  if (sample === 0) ok('ราคายืนยันแล้ว — ข้ามการตรวจ');
  else {
    check(lines.length > 0 && lines.every((l) => !/ราคา \d/.test(l)), `ลิงก์ LINE ${lines.length} ลิงก์ไม่มีตัวเลขราคาตัวอย่าง`, `ลิงก์ LINE มีราคาตัวอย่าง: ${lines.find((l) => /ราคา \d/.test(l))}`);
    check(!/ราคาเริ่มต้น/.test(desc ?? ''), 'คำอธิบายหน้า (meta) ไม่มีราคาตัวอย่าง', `meta description มีราคาตัวอย่าง: ${desc}`);
  }
}

console.log('\n6) สายพันธุ์: ตั้งรังลูกเป็นรังแม่ของรังแม่ตัวเองไม่ได้ (กันวน)');
{
  // หาคู่ แม่ → ลูก จากหน้ารัง: รังที่มีลิงก์ "ไข่นางจาก"
  let child = null, parent = null;
  for (const code of ['A12', 'A13', 'A14', 'A20', 'A30']) {
    await page.goto(`${BASE}/admin/hives/${code}`);
    const p = await page.locator('dt:has-text("ไข่นางจาก") + dd a').first().textContent().catch(() => null);
    if (p) { child = code; parent = p.trim(); break; }
  }
  if (!child) fail('หาคู่รังแม่/ลูกในข้อมูลทดสอบไม่เจอ');
  else {
    await page.goto(`${BASE}/admin/hives/${parent}/edit`);
    await page.fill('#qs', child);
    await Promise.all([page.waitForLoadState('load'), page.click('button:has-text("บันทึกการแก้ไข")')]);
    const msg = (await page.locator('[role=alert]').first().textContent().catch(() => '')) ?? '';
    check(msg.includes('วนกัน') && !page.url().includes('saved='), `ตั้ง ${child} (ลูก) เป็นรังแม่ของ ${parent} → ถูกปฏิเสธ: "${msg.trim()}"`, `ไม่ถูกปฏิเสธ (url=${page.url()} msg="${msg.trim()}")`);
  }
}

console.log('\n7) รูปย่อและ cache ของรูป');
{
  // อัปโหลดรูปใหญ่ผ่านหน้ารูปของรัง (ย่อในเบราว์เซอร์ → ได้ทั้งรูปเต็มและรูปย่อ)
  await page.goto(BASE + '/admin/photos');
  const code = await page.$eval('li[data-code]', (e) => e.dataset.code);
  await page.goto(`${BASE}/admin/hives/${code}/media`);
  await page.locator('#file').evaluate(async (el) => {
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2250; const g = cv.getContext('2d');
    for (let i = 0; i < 800; i++) { g.fillStyle = `hsl(${(i * 37) % 360} 60% 50%)`; g.fillRect((i * 97) % 3000, (i * 53) % 2250, 120, 120); }
    const dt = new DataTransfer(); dt.items.add(new File([await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92))], 'big.jpg', { type: 'image/jpeg' }));
    el.files = dt.files;
  });
  await Promise.all([page.waitForURL(/msg=/, { timeout: 60000 }), page.click('#upload-btn')]);
  const src = await page.locator('img[src^="/media/hives/"]').first().getAttribute('src');
  const info = await page.evaluate(async (src) => {
    const full = src.replace('?w=thumb', '');
    const [a, b] = await Promise.all([fetch(full), fetch(src)]);
    return { thumbParam: src.includes('?w=thumb'), full: (await a.arrayBuffer()).byteLength, thumb: (await b.arrayBuffer()).byteLength, cache: a.headers.get('cache-control'), etag: a.headers.get('etag') };
  }, src);
  check(info.thumbParam, 'หน้ารูปของรังแสดงรูปย่อ (?w=thumb)', `หน้ารูปของรังยังใช้รูปเต็ม (${src})`);
  check(info.thumb > 0 && info.thumb < info.full / 2, `รูปย่อ ${(info.thumb / 1024).toFixed(0)} KB เล็กกว่ารูปเต็ม ${(info.full / 1024).toFixed(0)} KB`, `รูปย่อไม่เล็กลง (${info.thumb} vs ${info.full} bytes)`);
  check(/private/.test(info.cache ?? '') && /max-age=\d{6,}/.test(info.cache ?? '') && !/no-store/.test(info.cache ?? ''), `รูปหลังบ้านเก็บในเครื่องได้: ${info.cache}`, `รูปหลังบ้านไม่ถูก cache: ${info.cache}`);
  const status304 = await page.evaluate(async ({ src, etag }) => (await fetch(src.replace('?w=thumb', ''), { headers: { 'If-None-Match': etag }, cache: 'no-store' })).status, { src, etag: info.etag });
  check(status304 === 304, 'ขอซ้ำพร้อม ETag → 304 (ไม่ส่งรูปซ้ำ)', `ขอซ้ำได้ ${status304} แทน 304`);
  console.log(`   ℹ️ รังที่ได้รูปทดสอบเพิ่ม: ${code}`);
}

console.log('\n8) SEO: รังที่ตั้งขาย / 404 / URL ตัวพิมพ์เล็ก');
{
  await page.goto(`${BASE}/admin/hives/${HIVE}`);
  await page.click('summary:has-text("ตั้งขาย")');
  await page.check('input[name=forSale]');
  await page.fill('#s-price', '1590');
  await Promise.all([page.waitForURL(/saved=sale/), page.click('button:has-text("บันทึกการตั้งขาย")')]);
  const res = await page.goto(`${BASE}/products/hives/${HIVE.toLowerCase()}`);
  check(page.url().endsWith(`/products/hives/${HIVE}`) && res.status() === 200, `/products/hives/${HIVE.toLowerCase()} → ย้ายไป ${HIVE} (URL เดียว)`, `ไม่ย้าย URL (${page.url()})`);
  const ld = await page.$$eval('script[type="application/ld+json"]', (els) => els.flatMap((e) => [JSON.parse(e.textContent)].flat()));
  const product = ld.find((x) => x['@type'] === 'Product');
  check(product?.offers?.[0]?.price === 1590 && product.offers[0].priceCurrency === 'THB', 'ข้อมูลสินค้า (JSON-LD) มีราคา 1,590 บาท', `JSON-LD ไม่ถูกต้อง: ${JSON.stringify(ld)}`);
  // ยกเลิกการตั้งขาย
  await page.goto(`${BASE}/admin/hives/${HIVE}`);
  await page.click('summary:has-text("ตั้งขาย")');
  await page.uncheck('input[name=forSale]');
  await Promise.all([page.waitForURL(/saved=sale/), page.click('button:has-text("บันทึกการตั้งขาย")')]);
  // ข้าม cache ของเบราว์เซอร์ (หน้านี้ cache 60 วินาที — ผู้ที่เพิ่งเปิดอาจเห็นต่ออีกไม่เกิน 1 นาที)
  const gone = await page.evaluate(async (u) => { const r = await fetch(u, { cache: 'no-store' }); return { status: r.status, text: await r.text() }; }, `/products/hives/${HIVE}`);
  check(gone.status === 404 && gone.text.includes('ไม่ได้เปิดขายแล้ว'), 'ยกเลิกตั้งขาย → หน้ารังขายตอบ 404 พร้อมข้อความไทย', `ยกเลิกแล้วได้ ${gone.status}`);
  const nf = await page.goto(`${BASE}/no-such-page-${Date.now()}`);
  const nfInfo = await page.evaluate(() => ({ lang: document.documentElement.lang, canonical: !!document.querySelector('link[rel=canonical]'), robots: document.querySelector('meta[name=robots]')?.content, nav: !!document.querySelector('nav[aria-label="เมนูหลัก"]') }));
  check(nf.status() === 404 && nfInfo.lang === 'th' && nfInfo.nav && !nfInfo.canonical && /noindex/.test(nfInfo.robots ?? ''), 'หน้า 404 ภาษาไทย มีเมนู ไม่มี canonical และ noindex', `หน้า 404: ${nf.status()} ${JSON.stringify(nfInfo)}`);
}

console.log('\n9) เมนูมือถือ: บันทึกด่วน / เมนูเว็บสาธารณะ');
{
  await page.goto(BASE + '/admin/quick');
  await page.fill('#code', '25');
  await Promise.all([page.waitForURL(/\/admin\/hives\/A25\?do=honey/), page.click('button[value=honey]')]);
  const open = await page.evaluate(() => document.getElementById('form-honey')?.open);
  check(open === true, 'บันทึกด่วน: พิมพ์ 25 + เก็บน้ำหวาน → เปิดฟอร์มเก็บน้ำหวานของรัง A25', `ไม่ได้เปิดฟอร์ม (${page.url()})`);
  await page.goto(BASE + '/admin/quick?code=99999&do=honey');
  check(await page.isVisible('#code-err:has-text("ไม่พบรัง")'), 'เลขรังที่ไม่มี → แจ้ง "ไม่พบรัง"', 'ไม่แจ้งเมื่อไม่พบรัง');
  const tabs = await page.$$eval('nav[aria-label="เมนูหลัก"] a', (as) => as.filter((a) => a.offsetParent).map((a) => a.textContent.trim()));
  check(tabs.join('|') === 'ภาพรวม|รัง|บันทึก|สินค้า|เมนู', `แถบล่าง 5 ปุ่ม: ${tabs.join(' · ')}`, `แถบล่างไม่ถูกต้อง: ${tabs.join(' · ')}`);

  await page.goto(BASE + '/');
  const before = await page.isVisible('nav[aria-label="เมนูหลัก (มือถือ)"] a[href="/passport"]');
  await page.click('[data-menu-toggle]');
  const links = await page.$$eval('nav[aria-label="เมนูหลัก (มือถือ)"] a', (as) => as.map((a) => a.textContent.trim()));
  check(!before && links.length === 7, `เมนูเว็บ: ซ่อนไว้ก่อน แตะแล้วเห็นครบ ${links.length} รายการ`, `เมนูเว็บไม่ถูกต้อง (ก่อนแตะเห็น=${before}, ${links.length} รายการ)`);
  await page.mouse.click(200, 700);
  check(!(await page.evaluate(() => document.querySelector('[data-site-menu]').open)), 'แตะนอกเมนู → เมนูปิด', 'แตะนอกเมนูแล้วเมนูไม่ปิด');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, 'หน้าเว็บไม่ล้นจอแนวนอน', `ล้นจอ ${overflow}px`);
}

check(pageErrors.length === 0, 'ไม่มี JavaScript error ในหน้า', `JavaScript error: ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : '\n✅ ผ่านทั้งหมด');
console.log('ℹ️ เขียนข้อมูลทดสอบลงฐานข้อมูลในเครื่อง — ล้างด้วย: npm run db:seed:local && npm run media:seed:local -- --prune');
process.exit(failed ? 1 : 0);
