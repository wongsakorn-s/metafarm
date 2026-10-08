// ทดสอบ "ส่งฟอร์มจริง" ในเบราว์เซอร์ — สิ่งที่ check:browser (เปิดหน้าอย่างเดียว) จับไม่ได้
//   npm run check:forms      ต้องรัน `npm run dev` ไว้ และมี private/dev-owner.txt
//
// ⚠️ เขียนข้อมูลจริงลงฐานข้อมูล "ในเครื่อง" (เหตุการณ์ทดสอบ, รังใหม่ 1 รัง, รูปทดสอบ) — จึงยอมรันกับ localhost เท่านั้น
//    ล้างกลับเป็นข้อมูล Excel: npm run db:seed:local && npm run media:seed:local -- --prune
import { readFileSync, writeFileSync } from 'node:fs';
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
  if (!c3) throw new Error('คิวถ่ายรูปในเครื่องเหลือไม่พอสำหรับทดสอบ (ทุกการทดสอบเติมรูปให้รัง) — ล้างข้อมูลทดสอบ: npm run db:seed:local && npm run media:seed:local -- --prune');
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
  check(t1.includes('ไม่ได้บันทึกรูป') && !t1.includes('เพิ่มแล้ว'), `ไฟล์ที่ไม่ใช่รูป → "${t1}"`, `ขึ้นว่าสำเร็จทั้งที่เซิร์ฟเวอร์ไม่บันทึก: "${t1}"`);
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
  await stateOf(c2).filter({ hasText: 'เพิ่มแล้ว' }).waitFor({ timeout: 20000 }).catch(() => {});
  const t2 = (await stateOf(c2).textContent()).trim();
  check(t2.includes('เพิ่มแล้ว 1 รูป') && (await stateOf(c2).getAttribute('class')).includes('text-palm-700'), `กดส่งซ้ำสำเร็จ → "${t2}"`, `ส่งซ้ำไม่สำเร็จ: "${t2}"`);
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
  check(tabs.join('|') === 'ภาพรวม|รัง|บันทึก|ขาย|เมนู', `แถบล่าง 5 ปุ่ม: ${tabs.join(' · ')}`, `แถบล่างไม่ถูกต้อง: ${tabs.join(' · ')}`);

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

console.log('\n10) หลังบ้านบนคอม: ตารางรังเรียงได้ / ปุ่มหลักปุ่มเดียว');
{
  const firstRow = async (sort) => page.evaluate(async (u) => {
    const html = await (await fetch(u)).text();
    return new DOMParser().parseFromString(html, 'text/html').querySelector('tbody th[scope=row]')?.textContent.trim();
  }, `/admin/hives?sort=${sort}`);
  const [oldest, newest] = [await firstRow('old'), await firstRow('new')];
  check(oldest === 'A1' && newest !== 'A1', `เรียงตามรหัส: น้อยก่อน = ${oldest} · ใหม่ก่อน = ${newest}`, `เรียงไม่ถูก (old=${oldest}, new=${newest})`);
  const recent = await firstRow('recent');
  check(!!recent, `เรียงตามบันทึกล่าสุด: แถวแรก ${recent}`, 'เรียงตามบันทึกล่าสุดไม่มีข้อมูล');
  await page.goto(BASE + '/admin/readiness');
  const primaries = await page.locator('main .btn-primary').count();
  check(primaries <= 1, `หน้าเตรียมเปิดเว็บมีปุ่มหลัก ${primaries} ปุ่ม`, `ปุ่มหลักมากเกินไป (${primaries})`);
}

console.log('\n11) ผลผลิต + สภาพอากาศ');
{
  await page.goto(BASE + '/admin/production?range=24', { waitUntil: 'networkidle', timeout: 120000 });
  const figs = await page.locator('#charts figure').count();
  check(figs === 4, 'มีกราฟ 4 กราฟ (น้ำผึ้ง · ขยายรัง · ฝน · อุณหภูมิ) แกนเวลาเดียวกัน', `จำนวนกราฟ ${figs}`);
  const cells = await page.$$eval('#charts figure', (fs) => fs.map((f) => f.querySelectorAll('.chart-cell').length).filter((n) => n > 0));
  check(cells.length >= 2 && new Set(cells).size === 1 && cells[0] === 24, `ทุกกราฟมี ${cells[0]} เดือนเท่ากัน`, `จำนวนเดือนไม่เท่ากัน ${cells}`);
  await page.locator('#charts figure').nth(2).locator('.chart-cell').nth(5).dispatchEvent('pointerenter');
  const tips = (await page.locator('#charts .chart-tip').allTextContents()).filter(Boolean);
  const sameMonth = tips.length >= 2 && new Set(tips.map((t) => t.split(':')[0])).size === 1;
  check(sameMonth, `ชี้เดือนในกราฟฝน → ทุกกราฟแสดงเดือนเดียวกัน (${tips[0]?.split(':')[0]})`, `ค่าที่แสดงไม่ตรงเดือน: ${tips.join(' | ')}`);
  const rainRows = await page.locator('details:has(#tbl-h) tbody tr').count();
  check(rainRows === 24, 'ตารางข้อมูลรายเดือนครบ 24 แถว (สำหรับโปรแกรมอ่านหน้าจอ)', `ตารางมี ${rainRows} แถว`);
}

console.log('\n12) ขาย: ออเดอร์ → ชำระ → ส่ง · ยกเลิกคืนสต็อก/คืนรัง');
{
  const tag = 'ทดสอบ' + Date.now().toString().slice(-6);
  // สินค้าตัวแรก + สต็อกตั้งต้น
  await page.goto(BASE + '/admin/products');
  const vid = await page.$eval('input[id^="st-"]', (e) => e.id.slice(3));
  const stockOf = async () => { await page.goto(BASE + '/admin/products'); return Number(await page.inputValue('#st-' + vid)); };
  const setStock = async (n) => {
    await page.goto(BASE + '/admin/products');
    await page.fill('#st-' + vid, String(n));
    await Promise.all([page.waitForURL(/saved=variant/), page.locator('li:has(#st-' + vid + ') button:has-text("บันทึก")').click()]);
  };
  await setStock(5);
  const stock0 = await stockOf();
  // ออเดอร์ใหม่: ลูกค้าใหม่ · สินค้า 2 ชิ้น · รังที่ตั้งขาย/ยังอยู่ 1 รัง · ค่าส่ง 50
  await page.goto(BASE + '/admin/orders/new');
  await page.check('input[name=customerMode][value=new]');
  await page.fill('#c_name', 'คุณ' + tag);
  await page.fill('#c_phone', '081-555-0' + tag.slice(-3));
  await page.fill('#c_address', 'บ้านเลขที่ ' + tag + ' ต.ทดสอบ');
  await page.fill('#qty_v' + vid, '2');
  const unit = Number(await page.inputValue('#price_v' + vid));
  const hiveBox = page.locator('input[data-hive]').first();
  const hiveId = await hiveBox.getAttribute('data-hive');
  await page.locator('details:has(input[data-hive])').evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
  await hiveBox.check();
  await page.fill('#price_h' + hiveId, '1500');
  await page.fill('#shipFee', '50');
  const shown = await page.textContent('#total');
  const fields = await page.$eval('#order-form', (f) => Object.fromEntries([...new FormData(f)].filter(([, v]) => typeof v === 'string')));
  await Promise.all([page.waitForURL(/\/admin\/orders\/S\d{4}-\d+\?saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
  const code = page.url().match(/orders\/(S\d{4}-\d+)/)[1];
  const expect = unit * 2 + 1500 + 50;
  check(shown?.replace(/[^\d]/g, '') === String(expect), 'ยอดรวมสดในฟอร์ม = ' + shown, 'ยอดรวมในฟอร์มไม่ตรง ' + shown + ' (คาด ' + expect + ')');
  const summary = await page.inputValue('#summary');
  check(summary.includes(code) && summary.includes(expect.toLocaleString('th-TH')), 'สร้าง ' + code + ' ข้อความสรุปมีรหัสและยอด ' + expect.toLocaleString('th-TH') + ' บาท', 'ข้อความสรุปไม่ถูกต้อง: ' + summary.slice(0, 120));
  // ส่งฟอร์มเดิมซ้ำ (กดสองครั้ง/เน็ตหลุด) → ได้ออเดอร์เดิม
  const again = await post('/admin/orders/new', fields);
  check(again.url.includes(code), 'ส่งฟอร์มเดิมซ้ำ → ได้ออเดอร์ ' + code + ' เดิม ไม่สร้างใหม่', 'ส่งซ้ำได้ออเดอร์ใหม่: ' + again.url);
  // รังถูกเอาออกจากหน้าขาย และไม่ให้เลือกซ้ำในออเดอร์อื่น
  await page.goto(BASE + '/admin/orders/new');
  check((await page.locator('input[data-hive="' + hiveId + '"]').count()) === 0, 'รังในออเดอร์ค้างเลือกซ้ำในออเดอร์ใหม่ไม่ได้', 'รังในออเดอร์ค้างยังเลือกได้');
  // ชำระแล้ว → ตัดสต็อก + รังขายแล้ว
  await page.goto(BASE + '/admin/orders/' + code);
  await page.selectOption('#payMethodSel', 'promptpay');
  await Promise.all([page.waitForURL(/saved=pay/), page.click('button:has-text("บันทึกว่าชำระแล้ว")')]);
  const stock1 = await stockOf();
  check(stock0 === 5 && stock1 === 3, 'ชำระแล้ว → ตัดสต็อก 5 → 3', 'สต็อกไม่ถูกตัด (' + stock0 + ' → ' + stock1 + ')');
  await page.goto(BASE + '/admin/orders/' + code);
  const hiveCode = await page.locator('a[href^="/admin/hives/A"]').first().textContent().then((t) => t.match(/A\d+/)[0]);
  await page.goto(BASE + '/admin/hives/' + hiveCode);
  check(await page.isVisible('.badge:has-text("ขายแล้ว")'), 'รัง ' + hiveCode + ' เปลี่ยนเป็น "ขายแล้ว" เอง', 'รังไม่เปลี่ยนเป็นขายแล้ว');
  // ส่งแล้ว
  await page.goto(BASE + '/admin/orders/' + code);
  await page.fill('#trackingNo', 'TH' + tag.slice(-6));
  await Promise.all([page.waitForURL(/saved=fulfill/), page.click('button:has-text("บันทึกว่าส่งแล้ว")')]);
  check(await page.isVisible('.badge:has-text("ส่งแล้ว")'), 'บันทึกว่าส่งแล้ว พร้อมเลขพัสดุ', 'สถานะไม่เป็นส่งแล้ว');
  check((await page.locator('button:has-text("ยกเลิกออเดอร์")').count()) === 0, 'ออเดอร์ที่ส่งแล้วไม่มีปุ่มยกเลิก', 'ส่งแล้วยังยกเลิกได้');
  // ออเดอร์ที่ 2: ชำระทันที แล้วยกเลิก → คืนสต็อก · ออเดอร์ที่ 3: สินค้าทำตามสั่ง (สต็อก 0) ยกเลิกแล้วต้องไม่เกิดสต็อกลอย
  await page.goto(BASE + '/admin/orders/new');
  await page.check('input[name=customerMode][value=existing]');
  await page.selectOption('#customerId', { label: new RegExp('คุณ' + tag) }).catch(async () => {
    const val = await page.$eval('#customerId', (s, t) => [...s.options].find((o) => o.text.includes(t))?.value, tag);
    await page.selectOption('#customerId', val);
  });
  await page.fill('#qty_v' + vid, '1');
  await page.check('#paidNow');
  await page.selectOption('#payMethod', 'transfer');
  await Promise.all([page.waitForURL(/saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
  const code2 = page.url().match(/orders\/(S\d{4}-\d+)/)[1];
  const stock2 = await stockOf();
  await page.goto(BASE + '/admin/orders/' + code2);
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.accept(); });
  await Promise.all([page.waitForURL(/status=cancelled/), page.click('button:has-text("ยกเลิกออเดอร์")')]);
  const stock3 = await stockOf();
  check(asked.includes(code2) && stock2 === 2 && stock3 === 3, 'ยกเลิก ' + code2 + ' (ถามยืนยัน) → คืนสต็อก 2 → 3', 'ยกเลิกแล้วสต็อกไม่ถูก (' + stock2 + ' → ' + stock3 + ', ถาม: ' + asked + ')');
  await setStock(0);
  const made = await page.evaluate(async ({ vid, tag }) => {
    const html = await (await fetch('/admin/orders/new')).text();
    const cid = new DOMParser().parseFromString(html, 'text/html').querySelector('#customerId option:not([value=""])')?.value;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ customerMode: 'existing', customerId: cid, channel: 'farm', orderedOn: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), shipMethod: 'pickup', shipFee: '0', paidNow: 'on', payMethod: 'cash', ['qty_v' + vid]: '2', ['price_v' + vid]: '100', idem: crypto.randomUUID() })) fd.append(k, v);
    const r = await fetch('/admin/orders/new', { method: 'POST', body: fd });
    return r.url.match(/orders\/(S\d{4}-\d+)/)?.[1];
  }, { vid, tag });
  const madeStock = await stockOf();
  await page.goto(BASE + '/admin/orders/' + made);
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForURL(/status=cancelled/), page.click('button:has-text("ยกเลิกออเดอร์")')]);
  const afterCancel = await stockOf();
  check(madeStock === 0 && afterCancel === 0, 'สินค้าทำตามสั่ง (สต็อก 0): ชำระแล้วสต็อกไม่ติดลบ · ยกเลิกแล้วไม่เกิดสต็อกลอย (0 → 0)', 'สต็อกผิดหลังยกเลิกออเดอร์ทำตามสั่ง (' + madeStock + ' → ' + afterCancel + ')');
  // รังที่ขายแล้ว (ชำระแล้ว) ถูกยกเลิก → กลับเป็น "ยังอยู่" และกลับไปตั้งขายตามเดิม
  {
    await page.goto(BASE + '/admin/orders/new');
    const box = page.locator('input[data-hive]').first();
    const hid = await box.getAttribute('data-hive');
    const hcode = (await page.locator('label:has(input[data-hive="' + hid + '"])').textContent()).match(/A\d+/)[0];
    await page.goto(BASE + '/admin/hives/' + hcode);
    await page.click('summary:has-text("ตั้งขาย")');
    await page.check('input[name=forSale]');
    await page.fill('#s-price', '1700');
    await Promise.all([page.waitForURL(/saved=sale/), page.click('button:has-text("บันทึกการตั้งขาย")')]);
    await page.goto(BASE + '/admin/orders/new?hive=' + hcode);
    await page.check('input[name=customerMode][value=existing]');
    const cid = await page.$eval('#customerId', (s) => [...s.options].find((o) => o.value)?.value);
    await page.selectOption('#customerId', cid);
    await page.check('#paidNow');
    await page.selectOption('#payMethod', 'cash');
    await Promise.all([page.waitForURL(/saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
    const hc = page.url().match(/orders\/(S\d{4}-\d+)/)[1];
    await page.goto(BASE + '/admin/hives/' + hcode);
    const soldNow = await page.isVisible('.badge:has-text("ขายแล้ว")');
    await page.goto(BASE + '/admin/orders/' + hc);
    page.once('dialog', (d) => d.accept());
    await Promise.all([page.waitForURL(/status=cancelled/), page.click('button:has-text("ยกเลิกออเดอร์")')]);
    await page.goto(BASE + '/admin/hives/' + hcode);
    const back = await page.isVisible('.badge:has-text("ยังอยู่")');
    const forSaleAgain = await page.isVisible('.badge:has-text("ตั้งขาย")');
    check(soldNow && back && forSaleAgain, 'รัง ' + hcode + ': ชำระแล้วเป็น "ขายแล้ว" → ยกเลิกแล้วกลับเป็น "ยังอยู่" และตั้งขายตามเดิม', 'รังไม่กลับสถานะเดิม (ขาย=' + soldNow + ' ยังอยู่=' + back + ' ตั้งขาย=' + forSaleAgain + ')');
  }
  // ลูกค้า: ประวัติ 1 ออเดอร์ที่ไม่ยกเลิก
  await page.goto(BASE + '/admin/customers?q=' + encodeURIComponent(tag));
  const card = await page.locator('main li').first().textContent();
  check(card.includes('1 ออเดอร์') && card.includes(expect.toLocaleString('th-TH')), 'หน้าลูกค้า: 1 ออเดอร์ รวม ' + expect.toLocaleString('th-TH') + ' บาท (ไม่นับที่ยกเลิก)', 'สรุปลูกค้าไม่ถูก: ' + card.replace(/\s+/g, ' '));
  console.log('   ℹ️ ข้อมูลทดสอบ: ลูกค้า คุณ' + tag + ' · ' + code + ', ' + code2);
}

console.log('\n13) ล็อตน้ำผึ้ง: เก็บ → ล็อต → บรรจุ → ฉลาก QR → ขาย (ล็อตเก่าก่อน)');
{
  // เก็บน้ำหวาน 2 รัง (รวม 600 มล.)
  for (const [code, ml] of [['A30', 400], ['A31', 200]]) await post('/admin/hives/' + code, { intent: 'honey', occurredOn: today, honeyMl: String(ml), idem: crypto.randomUUID() });
  await page.goto(BASE + '/admin/lots/new');
  // เลือกเฉพาะ 2 ครั้งล่าสุดของ A30/A31
  await page.$$eval('input[name=eventId]', (els) => els.forEach((e) => (e.checked = false)));
  for (const code of ['A30', 'A31']) await page.locator('label:has-text("' + code + '") input[name=eventId]').first().check();
  const sumText = await page.textContent('#sum');
  await Promise.all([page.waitForURL(/\/admin\/lots\/H\d{4}-\d{2}-\d+\?saved=created/), page.click('button:has-text("สร้างล็อต")')]);
  const lot = page.url().match(/lots\/(H\d{4}-\d{2}-\d+)/)[1];
  check(/600/.test(sumText ?? '') && /^H\d{4}-\d{2}-\d+$/.test(lot), 'สร้างล็อต ' + lot + ' จากการเก็บ 600 มล.', 'สร้างล็อตไม่ถูก (' + sumText + ', ' + lot + ')');
  // บรรจุขวด 50 มล.: 13 ขวด ใช้ได้ไม่เกิน 12 → ถูกปฏิเสธ · 10 ขวด ผ่าน → สต็อก +10
  const v50 = await page.$eval('#variantId', (s) => [...s.options].find((o) => / 50 มล\./.test(o.text))?.value);
  await page.goto(BASE + '/admin/products');
  const before = Number(await page.inputValue('#st-' + v50));
  await page.goto(BASE + '/admin/lots/' + lot);
  await page.selectOption('#variantId', v50);
  await page.fill('#qty', '13');
  await Promise.all([page.waitForLoadState('load'), page.click('button:has-text("บันทึกการบรรจุ")')]);
  const err = (await page.locator('[role=alert]').first().textContent().catch(() => '')) ?? '';
  check(err.includes('ไม่เกิน 12 ขวด'), 'บรรจุเกินน้ำผึ้งที่มี → ปฏิเสธ: "' + err.trim() + '"', 'บรรจุเกินได้: ' + err);
  await page.selectOption('#variantId', v50);
  await page.fill('#qty', '10');
  await page.fill('#unitCost', '37');
  await Promise.all([page.waitForURL(/saved=bottled/), page.click('button:has-text("บันทึกการบรรจุ")')]);
  await page.goto(BASE + '/admin/products');
  const after = Number(await page.inputValue('#st-' + v50));
  check(after === before + 10, 'บรรจุ 10 ขวด → สต็อก ' + before + ' → ' + after, 'สต็อกไม่เพิ่ม (' + before + ' → ' + after + ')');
  // ฉลาก: 10 ดวง มี QR ชี้หน้า /lot/
  await page.goto(BASE + '/admin/lots/' + lot + '/labels?variant=' + v50 + '&count=10&start=3');
  const labels = await page.locator('.lbl').count();
  const qrOk = await page.locator('.lbl svg').first().getAttribute('aria-label');
  const blanks = await page.$$eval('.sheet > div:not(.lbl)', (e) => e.length);
  check(labels === 10 && blanks === 2 && qrOk?.includes(lot), 'หน้าพิมพ์ฉลาก: 10 ดวง เริ่มดวงที่ 3 (เว้น 2) มี QR ของล็อต', 'ฉลากไม่ถูก (' + labels + ' ดวง, เว้น ' + blanks + ', ' + qrOk + ')');
  // หน้าสาธารณะ (ไม่ล็อกอิน): มีรังที่มา ไม่มีต้นทุน
  const pub = await page.evaluate(async (u) => { const r = await fetch(u, { credentials: 'omit' }); return { s: r.status, t: await r.text() }; }, '/lot/' + lot);
  check(pub.s === 200 && pub.t.includes('A30') && pub.t.includes('A31') && !pub.t.includes('37 บาท') && !pub.t.includes('600 มล.'), 'หน้า /lot/' + lot + ' (สาธารณะ): แสดงรัง A30, A31 · ไม่มีต้นทุนหรือปริมาณ', 'หน้าล็อตสาธารณะไม่ถูกต้อง (' + pub.s + ')');
  // ขาย 2 ขวด ชำระแล้ว → ผูกล็อตนี้
  await page.goto(BASE + '/admin/orders/new');
  await page.check('input[name=customerMode][value=new]');
  await page.fill('#c_name', 'ลูกค้าล็อต' + Date.now().toString().slice(-5));
  await page.fill('#qty_v' + v50, '2');
  await page.check('#paidNow');
  await page.selectOption('#payMethod', 'promptpay');
  await Promise.all([page.waitForURL(/saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
  const sumOrder = await page.inputValue('#summary');
  check(sumOrder.includes('ล็อต H'), 'ขายขวด 50 มล. → ผูกล็อตให้เอง (ข้อความสรุปมี "' + (sumOrder.match(/ล็อต H[\d-]+/) ?? [''])[0] + '")', 'ขายแล้วไม่ผูกล็อต');
}

console.log('\n14) รายงาน: ต้นทุนในหน้าสินค้า → ขาย → ยอดขาย/กำไร · ส่งออก CSV');
{
  // ใส่ต้นทุนรังเปล่า (ไม่มีล็อต → ใช้ต้นทุนในหน้าสินค้า · บันทึกแถวนี้ = ยืนยันราคา จึงไม่ใช้น้ำผึ้งที่ข้อ 5 ตรวจราคาตัวอย่าง)
  await page.goto(BASE + '/admin/orders/new');
  const orderable = await page.$$eval('input[id^=qty_v]', (els) => els.map((e) => e.id.slice(5)));
  await page.goto(BASE + '/admin/products');
  const vid = await page.evaluate((ids) => ids.find((id) => /รังเปล่า/.test(document.getElementById('co-' + id)?.closest('form')?.textContent ?? '')), orderable);
  await page.fill('#co-' + vid, '40');
  await Promise.all([page.waitForLoadState('load'), page.locator('#co-' + vid).locator('xpath=ancestor::form').locator('button[type=submit]').click()]);
  await page.goto(BASE + '/admin/products');
  check(await page.inputValue('#co-' + vid) === '40', 'ต้นทุนต่อชิ้นในหน้าสินค้าบันทึกได้ (40)', 'ต้นทุนไม่ถูกบันทึก: ' + (await page.inputValue('#co-' + vid)));

  const tile = async () => {
    await page.goto(BASE + '/admin/reports');
    return { rev: Number(await page.getAttribute('#r-revenue', 'data-value')), profit: Number(await page.getAttribute('#r-profit', 'data-value')) };
  };
  const before = await tile();
  // ขาย 2 ขวด ชำระแล้ว · ลูกค้าชื่อขึ้นต้นด้วย = (ทดสอบกันสูตรใน CSV)
  const cname = '=SUM(1)รายงาน' + Date.now().toString().slice(-5);
  await page.goto(BASE + '/admin/orders/new');
  await page.check('input[name=customerMode][value=new]');
  await page.fill('#c_name', cname);
  await page.fill('#qty_v' + vid, '2');
  const price = Number(await page.inputValue('#price_v' + vid));
  await page.check('#paidNow');
  await page.selectOption('#payMethod', 'transfer');
  await Promise.all([page.waitForURL(/saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
  const code = page.url().match(/orders\/(S\d{4}-\d+)/)[1];
  const after = await tile();
  check(after.rev - before.rev === 2 * price && after.profit - before.profit === 2 * (price - 40),
    'ขาย 2 × ' + price + ' บาท (ต้นทุน 40) → ยอดขาย +' + (after.rev - before.rev) + ' กำไร +' + (after.profit - before.profit),
    'รายงานไม่ตรง: ยอดขาย +' + (after.rev - before.rev) + ' (คาด ' + 2 * price + ') กำไร +' + (after.profit - before.profit) + ' (คาด ' + 2 * (price - 40) + ')');

  const get = (u, omit) => page.evaluate(async ({ u, omit }) => {
    const r = await fetch(u, { credentials: omit ? 'omit' : 'same-origin' });
    const buf = new Uint8Array(await r.arrayBuffer());
    return { s: r.status, url: r.url, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), bom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, t: new TextDecoder().decode(buf) };
  }, { u, omit });
  const year = new Date(Date.now() + 7 * 3600e3).getUTCFullYear();
  const sales = await get('/admin/reports/export/sales-' + year + '.csv');
  const salesRow = sales.t.split('\r\n').find((l) => l.startsWith(code + ','));
  check(sales.s === 200 && sales.bom && /text\/csv/.test(sales.type ?? '') && /attachment/.test(sales.disp ?? '') && salesRow?.endsWith(',2,' + price + ',' + 2 * price + ',40,' + 2 * (price - 40)),
    'sales-' + year + '.csv: BOM + ดาวน์โหลด + แถว ' + code + ' มีต้นทุน/กำไร', 'CSV รายการขายไม่ถูก (' + sales.s + ', ' + salesRow + ')');
  const orders = await get('/admin/reports/export/orders.csv');
  check(orders.s === 200 && orders.t.includes(code + ',') && orders.t.includes('ชำระแล้ว'), 'orders.csv มีออเดอร์ ' + code + ' (สถานะเป็นภาษาไทย)', 'orders.csv ไม่ถูก (' + orders.s + ')');
  const cus = await get('/admin/reports/export/customers.csv');
  check(cus.s === 200 && cus.t.includes("'" + cname) && !cus.t.includes(',' + cname), 'customers.csv: ชื่อขึ้นต้นด้วย = ถูกเติม \' กันสูตร', 'customers.csv ไม่กันสูตร');
  const hv = await get('/admin/reports/export/hives.csv');
  check(hv.s === 200 && hv.bom && hv.t.startsWith('รหัส,') && hv.t.split('\r\n').length > 10, 'hives.csv: ' + (hv.t.split('\r\n').length - 2) + ' รัง', 'hives.csv ไม่ถูก (' + hv.s + ', ' + JSON.stringify(hv.t.slice(0, 20)) + ')');
  const bad = await get('/admin/reports/export/secrets.csv');
  const anon = await get('/admin/reports/export/customers.csv', true);
  check(bad.s === 404 && anon.url.includes('/admin/login') && !anon.t.includes(cname), 'ไฟล์ไม่รู้จัก → 404 · ไม่ล็อกอิน → ไปหน้า login (ไม่ได้ข้อมูล)', 'ส่งออกรั่ว/ผิด (' + bad.s + ', ' + anon.url + ')');
}

console.log('\n15) สิทธิ์พนักงาน: เพิ่มพนักงาน → รหัสชั่วคราว → ทำงานรังได้ · เรื่องเงิน/ขายไม่ได้ · ปิดบัญชี');
{
  const text = (url, fields) => page.evaluate(async ({ url, fields }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(url, { method: 'POST', body: fd });
    return { status: r.status, t: await r.text() };
  }, { url, fields });
  const stamp = Date.now().toString().slice(-6);
  const sEmail = 'staff' + stamp + '@metafarm.local';
  const sName = 'พนักงานทดสอบ' + stamp;
  // เพิ่มพนักงาน · ส่งฟอร์มซ้ำด้วยคีย์เดิม → บัญชีเดียว ได้รหัสใหม่
  const key = crypto.randomUUID();
  const c1 = await text('/admin/users', { intent: 'create', name: sName, email: sEmail, idem: key });
  const c2 = await text('/admin/users', { intent: 'create', name: sName, email: sEmail, idem: key });
  const pw1 = (c1.t.match(/id="temp-pw"[^>]*>([^<]+)</) ?? [])[1];
  const temp = (c2.t.match(/id="temp-pw"[^>]*>([^<]+)</) ?? [])[1];
  await page.goto(BASE + '/admin/users');
  const rows = await page.locator('li:has-text("' + sEmail + '")').count();
  check(pw1 && temp && pw1 !== temp && rows === 1, 'เพิ่มพนักงาน ' + sEmail + ' · ส่งซ้ำ → บัญชีเดียว รหัสชั่วคราวใหม่', 'เพิ่มพนักงานไม่ถูก (' + rows + ' แถว, ' + pw1 + ' / ' + temp + ')');
  const other = await text('/admin/users', { intent: 'create', name: 'x', email: sEmail, idem: crypto.randomUUID() });
  check(other.t.includes('อีเมลนี้มีบัญชีอยู่แล้ว'), 'อีเมลซ้ำ (คนละฟอร์ม) → ปฏิเสธ', 'อีเมลซ้ำไม่ถูกปฏิเสธ');
  const userId = await page.locator('li:has-text("' + sEmail + '") input[name=userId]').first().getAttribute('value');

  // พนักงานล็อกอินด้วยรหัสชั่วคราว → ถูกพาไปเปลี่ยนรหัส · หน้าอื่นเข้าไม่ได้จนกว่าจะเปลี่ยน
  const sctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const sp = await sctx.newPage();
  sp.on('pageerror', (e) => pageErrors.push('staff: ' + e.message));
  const staffLogin = async (pw) => {
    await sp.goto(BASE + '/admin/login');
    await sp.fill('#email', sEmail);
    await sp.fill('#password', pw);
    await Promise.all([sp.waitForLoadState('load'), sp.press('#password', 'Enter')]);
    await sp.waitForTimeout(300);
  };
  await staffLogin(temp);
  const forcedUrl = sp.url();
  await sp.goto(BASE + '/admin/hives');
  check(/\/admin\/account\?first=1/.test(forcedUrl) && /\/admin\/account/.test(sp.url()), 'รหัสชั่วคราว → บังคับไปหน้าเปลี่ยนรหัสผ่าน (เปิดหน้ารังไม่ได้)', 'ไม่บังคับเปลี่ยนรหัส (' + forcedUrl + ' → ' + sp.url() + ')');
  const newPw = 'staff-pass-' + stamp + '-ok';
  await sp.fill('#current', temp);
  await sp.fill('#next', newPw);
  await sp.fill('#confirm', newPw);
  await Promise.all([sp.waitForURL(/\/admin\?welcome=1/), sp.click('button:has-text("เปลี่ยนรหัสผ่าน")')]);
  check(true, 'ตั้งรหัสผ่านใหม่แล้วเข้าใช้งานได้', '');
  writeFileSync('private/dev-staff.txt', 'อีเมล: ' + sEmail + '\nรหัสผ่าน: ' + newPw + '\n(บัญชีพนักงานทดสอบในเครื่อง — สร้างโดย check:forms ข้อ 15 ใช้กับ check:staff)\n');

  // เมนู: ไม่มีหมวดขาย/ตั้งค่า/ผู้ใช้
  const ownerLinks = await sp.locator('a[href^="/admin/orders"], a[href^="/admin/products"], a[href^="/admin/reports"], a[href^="/admin/settings"], a[href^="/admin/users"], a[href^="/admin/readiness"]').count();
  const lotsTab = await sp.locator('nav a[href="/admin/lots"]').count();
  check(ownerLinks === 0 && lotsTab > 0, 'เมนูพนักงาน: ไม่มีลิงก์หมวดขาย/ตั้งค่า/ผู้ใช้ · แท็บล่างเป็น "ล็อต"', 'เมนูพนักงานยังมีลิงก์ของเจ้าของ ' + ownerLinks + ' ลิงก์');
  const sreq = (url, method = 'GET') => sp.evaluate(async ({ url, method }) => {
    const r = await fetch(url, method === 'POST' ? { method, body: new URLSearchParams({ intent: 'x' }) } : {});
    return { status: r.status, t: await r.text() };
  }, { url, method });
  const g1 = await sreq('/admin/orders');
  const g2 = await sreq('/admin/reports/export/customers.csv');
  const g3 = await sreq('/admin/products', 'POST');
  const g4 = await sreq('/admin/users');
  check(g1.status === 403 && g1.t.includes('สำหรับเจ้าของฟาร์มเท่านั้น') && g2.status === 403 && g3.status === 403 && g4.status === 403,
    'หน้า/ไฟล์/ฟอร์มของเจ้าของ → 403 (ออเดอร์, CSV ลูกค้า, ส่งฟอร์มสินค้า, จัดการผู้ใช้)', 'พนักงานเข้าได้: ' + [g1, g2, g3, g4].map((x) => x.status).join(', '));

  // หน้ารัง: ไม่มีราคาซื้อ/ฟอร์มตั้งขาย · สถานะเลือก "ขายแล้ว" ไม่ได้
  await sp.goto(BASE + '/admin/hives/' + HIVE);
  const saleForm = await sp.locator('#form-sale').count();
  const opts = await sp.$$eval('#st-s option', (os) => os.map((o) => o.value).filter(Boolean));
  const bodyText = await sp.textContent('main');
  check(saleForm === 0 && !opts.includes('sold') && !/ราคาซื้อ|บาท/.test(bodyText ?? ''), 'หน้ารัง ' + HIVE + ' (พนักงาน): ไม่มีราคา/ฟอร์มตั้งขาย · สถานะให้เลือก ' + opts.join(', '), 'หน้ารังของพนักงานมีข้อมูลเงิน/ตัวเลือกขาย (' + saleForm + ', ' + opts + ')');
  // ส่งคำสั่งเองตรง ๆ (ไม่ผ่านปุ่ม) → เซิร์ฟเวอร์ปฏิเสธ
  const fx = (fields) => sp.evaluate(async ({ url, fields }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return (await fetch(url, { method: 'POST', body: fd })).text();
  }, { url: '/admin/hives/' + HIVE, fields });
  const t1 = await fx({ intent: 'sale', forSale: 'on', salePrice: '99999' });
  const t2 = await fx({ intent: 'status', status: 'sold', occurredOn: today, soldPrice: '99999', idem: crypto.randomUUID() });
  check(t1.includes('การตั้งขายเป็นสิทธิ์ของเจ้าของ') && t2.includes('พนักงานเปลี่ยนสถานะได้แค่'), 'ยิงคำสั่งตั้งขาย/ขายแล้วเอง → เซิร์ฟเวอร์ปฏิเสธ', 'เซิร์ฟเวอร์ไม่ปฏิเสธคำสั่งขายจากพนักงาน');
  // แก้ข้อมูลรังที่ซื้อมา (มีราคาซื้อจริง) โดยแอบใส่ราคาซื้อ → ราคาซื้อไม่เปลี่ยน
  await page.goto(BASE + '/admin/hives?origin=purchased');
  const PH = (await page.getAttribute('a[href^="/admin/hives/A"]', 'href')).split('/')[3];
  await page.goto(BASE + '/admin/hives/' + PH + '/edit');
  const priceBefore = await page.inputValue('#price');
  await sp.goto(BASE + '/admin/hives/' + PH + '/edit');
  const hasPrice = await sp.locator('#price').count();
  await sp.evaluate(() => { const f = document.querySelector('select[name=origin]').form; const i = document.createElement('input'); i.type = 'hidden'; i.name = 'purchasePrice'; i.value = '12345'; f.appendChild(i); });
  await Promise.all([sp.waitForURL(/saved=edited/), sp.locator('form:has(select[name=origin]) button[type=submit]').last().click()]);
  await page.goto(BASE + '/admin/hives/' + PH + '/edit');
  const priceAfter = await page.inputValue('#price');
  check(hasPrice === 0 && priceAfter === priceBefore, 'รัง ' + PH + ': ฟอร์มแก้รังของพนักงานไม่มีราคาซื้อ · แอบส่งราคา 12345 → ราคาซื้อเดิม (' + (priceBefore || 'ว่าง') + ')', 'ราคาซื้อถูกแก้โดยพนักงาน: ' + priceBefore + ' → ' + priceAfter);
  // งานรังปกติได้ และประวัติบอกว่าใครบันทึก
  const t3 = await fx({ intent: 'note', occurredOn: today, note: 'form-check: พนักงานบันทึก', idem: crypto.randomUUID() });
  await sp.goto(BASE + '/admin/hives/' + HIVE);
  const by = await sp.locator('#timeline li:has-text("form-check: พนักงานบันทึก")').first().textContent();
  check(!/role="alert"/.test(t3) && (by ?? '').includes('บันทึกโดย ' + sName), 'พนักงานบันทึกหมายเหตุได้ · ประวัติแสดง "บันทึกโดย ' + sName + '"', 'บันทึกงานรังไม่ได้ หรือไม่แสดงผู้บันทึก');

  // เจ้าของปิดบัญชี → พนักงานหลุดทันที · เปิดกลับ → ล็อกอินได้ (ไม่ต้องเปลี่ยนรหัสอีก)
  await post('/admin/users', { intent: 'disable', userId });
  await sp.goto(BASE + '/admin');
  const kicked = sp.url().includes('/admin/login');
  await post('/admin/users', { intent: 'enable', userId });
  await staffLogin(newPw);
  check(kicked && /\/admin$/.test(new URL(sp.url()).pathname), 'ปิดบัญชี → พนักงานถูกออกจากระบบทันที · เปิดกลับ → ล็อกอินได้', 'ปิด/เปิดบัญชีไม่ถูก (' + kicked + ', ' + sp.url() + ')');
  await sctx.close();
}

console.log('\n16) ล็อกอินผิด: จำกัดต่ออีเมลรวมทุก IP · ต่อ IP รวมทุกอีเมล · เจ้าของปลดล็อกพนักงานได้');
{
  // ใช้บัญชีพนักงานจากข้อ 15 · จำลอง IP ด้วย cf-connecting-ip (บนเครื่องเท่านั้น — Cloudflare ตั้งค่านี้เองบนเว็บจริง)
  const sc = readFileSync('private/dev-staff.txt', 'utf8').split('\n');
  const sEmail = sc[0].split(/:\s*/)[1].trim();
  const sPw = sc[1].split(/:\s*/)[1].trim();
  const tryLogin = async (email, password, ip) => {
    const r = await fetch(BASE + '/admin/login', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }), headers: { Origin: BASE, 'cf-connecting-ip': ip } });
    const t = r.status === 200 ? await r.text() : '';
    return r.status >= 300 && r.status < 400 ? 'ok' : t.includes('ลองผิดหลายครั้งเกินไป') ? 'locked' : t.includes('อีเมลหรือรหัสผ่านไม่ถูกต้อง') ? 'invalid' : 'other:' + r.status;
  };
  const run = Date.now().toString().slice(-4);
  // บอทเปลี่ยน IP ทุก 4 ครั้ง (ไม่ติดขีด 5 ครั้ง/IP เดิม) → ครั้งที่ 10 ติดขีดรายอีเมล
  const res = [];
  for (let i = 0; i < 10; i++) res.push(await tryLogin(sEmail, 'wrong-password-' + i, '10.' + run.slice(0, 2) + '.' + Math.floor(i / 4) + '.1'));
  const right = await tryLogin(sEmail, sPw, '10.' + run.slice(0, 2) + '.200.1');
  check(res.every((x) => x === 'invalid') && right === 'locked', 'เดารหัสบัญชีเดียวจาก 3 IP ครบ 10 ครั้ง → ล็อก (แม้รหัสถูกจาก IP ใหม่)', 'ล็อกรายอีเมลไม่ทำงาน: ' + res.join(',') + ' → ' + right);
  // หน้าผู้ใช้ของเจ้าของ: เห็นว่าถูกล็อก → ปลดล็อก → ล็อกอินได้
  await page.goto(BASE + '/admin/users');
  const row = page.locator('li:has-text("' + sEmail + '")');
  const shown = await row.locator('[data-failures]').textContent().catch(() => '');
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForURL(/saved=unlock/), row.locator('button:has-text("ปลดล็อก")').click()]);
  const after = await tryLogin(sEmail, sPw, '10.' + run.slice(0, 2) + '.201.1');
  check((shown ?? '').includes('ล็อกชั่วคราว') && after === 'ok', 'หน้าผู้ใช้แสดง "ล็อกชั่วคราว" · เจ้าของกดปลดล็อก (ถามยืนยัน) → ล็อกอินได้', 'ปลดล็อกไม่ทำงาน (' + shown + ' → ' + after + ')');
  // ไล่เดาหลายบัญชีจาก IP เดียว (แต่ละอีเมลไม่ถึง 5 ครั้ง) → ครบ 30 ครั้ง IP นี้ถูกล็อก · IP อื่นไม่กระทบ
  const ip = '10.' + run.slice(2) + '.99.9';
  const spray = [];
  for (let i = 0; i < 30; i++) spray.push(await tryLogin('nobody' + run + '-' + i + '@example.com', 'x-' + i, ip));
  const blocked = await tryLogin(sEmail, sPw, ip);
  const other = await tryLogin(sEmail, sPw, '10.' + run.slice(2) + '.98.9');
  check(spray.every((x) => x === 'invalid') && blocked === 'locked' && other === 'ok', 'เดา 30 บัญชีจาก IP เดียว → IP นั้นถูกล็อก · คนอื่นล็อกอินได้ตามปกติ', 'ล็อกราย IP ไม่ทำงาน: ' + [...new Set(spray)].join(',') + ' → ' + blocked + ' / ' + other);
}

console.log('\n17) กันเขียนทับกัน: สองคนแก้รังเดียวกัน · แท็บค้างทับสต็อก · กดชำระ/ยกเลิกพร้อมกัน');
{
  // --- สองคนแก้รังเดียวกัน: เจ้าของเปิดฟอร์มค้าง → พนักงานแก้สถานที่ซื้อ → เจ้าของบันทึก = ชน ไม่ทับ ---
  const sc = readFileSync('private/dev-staff.txt', 'utf8').split('\n');
  const sctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const sp = await sctx.newPage();
  await sp.goto(BASE + '/admin/login');
  await sp.fill('#email', sc[0].split(/:\s*/)[1].trim());
  await sp.fill('#password', sc[1].split(/:\s*/)[1].trim());
  await Promise.all([sp.waitForURL(/\/admin$/), sp.press('#password', 'Enter')]);
  const tag = Date.now().toString().slice(-5);
  await page.goto(BASE + '/admin/hives/' + HIVE + '/edit');
  await sp.goto(BASE + '/admin/hives/' + HIVE + '/edit');
  await sp.fill('#place', 'สถานที่จากพนักงาน ' + tag);
  await Promise.all([sp.waitForURL(/saved=edited/), sp.locator('#hive-edit button[type=submit]').last().click()]);
  await page.fill('#pub', 'หมายเหตุจากเจ้าของ ' + tag);
  await Promise.all([page.waitForLoadState('load'), page.locator('#hive-edit button[type=submit]').last().click()]);
  const notice = (await page.locator('[data-conflict]').textContent().catch(() => '')) ?? '';
  check(notice.includes('ยังไม่ได้บันทึก') && notice.includes('สถานที่ซื้อ') && notice.includes('สถานที่จากพนักงาน ' + tag),
    'เจ้าของบันทึกฟอร์มที่เปิดค้าง → แจ้ง "ยังไม่ได้บันทึก" พร้อมช่องที่ต่าง (สถานที่ซื้อ ที่พนักงานแก้)', 'ไม่แจ้งชนกัน: ' + notice.slice(0, 120));
  check(/พนักงานทดสอบ\d+ บันทึกข้อมูลนี้ไปก่อน/.test(notice), 'บอกชื่อคนที่บันทึกไปก่อน', 'ไม่บอกชื่อคนที่บันทึกไปก่อน: ' + notice.slice(0, 80));
  await page.click('[data-use-latest=originPlace]');
  check(await page.inputValue('#place') === 'สถานที่จากพนักงาน ' + tag && await page.inputValue('#pub') === 'หมายเหตุจากเจ้าของ ' + tag, 'กด "ใช้ค่าล่าสุด" → ช่องสถานที่ซื้อเป็นค่าของพนักงาน · ที่เจ้าของพิมพ์ยังอยู่', 'ปุ่มใช้ค่าล่าสุดไม่ทำงาน');
  await Promise.all([page.waitForURL(/saved=edited/), page.locator('#hive-edit button[type=submit]').last().click()]);
  await page.goto(BASE + '/admin/hives/' + HIVE + '/edit');
  check(await page.inputValue('#place') === 'สถานที่จากพนักงาน ' + tag && await page.inputValue('#pub') === 'หมายเหตุจากเจ้าของ ' + tag, 'บันทึกอีกครั้ง → ได้ทั้งค่าของพนักงานและของเจ้าของ (ไม่มีใครทับใคร)', 'ผลรวมไม่ถูก');
  await sctx.close();

  // --- แท็บค้างทับสต็อก: แท็บ 1 เปิดหน้าสินค้า → แท็บ 2 แก้สต็อก → แท็บ 1 บันทึกราคา = ชน สต็อกไม่ถูกทับ ---
  await page.goto(BASE + '/admin/products');
  const vid = (await page.getAttribute('input[id^=st-]', 'id')).slice(3);
  const tab2 = await ctx.newPage();
  await tab2.goto(BASE + '/admin/products');
  const stock0 = Number(await tab2.inputValue('#st-' + vid));
  await tab2.fill('#st-' + vid, String(stock0 + 7));
  await Promise.all([tab2.waitForURL(/saved=variant/), tab2.locator('#variant-' + vid + ' button[type=submit]').click()]);
  const price0 = Number(await page.inputValue('#pr-' + vid));
  await page.fill('#pr-' + vid, String(price0 + 1));
  await Promise.all([page.waitForLoadState('load'), page.locator('#variant-' + vid + ' button[type=submit]').click()]);
  const vnotice = (await page.locator('[data-conflict]').textContent().catch(() => '')) ?? '';
  await tab2.reload();
  const stockNow = Number(await tab2.inputValue('#st-' + vid));
  check(vnotice.includes('สต็อก') && stockNow === stock0 + 7, 'แท็บที่เปิดค้างบันทึกราคา → แจ้งชน (สต็อกเปลี่ยนไปแล้ว) · สต็อก ' + stockNow + ' ไม่ถูกเลขเก่าทับ', 'สต็อกถูกทับ/ไม่แจ้ง (' + stockNow + ', ' + vnotice.slice(0, 60) + ')');
  await page.click('[data-use-latest=stockQty]');
  await Promise.all([page.waitForURL(/saved=variant/), page.locator('#variant-' + vid + ' button[type=submit]').click()]);
  await tab2.reload();
  check(Number(await tab2.inputValue('#st-' + vid)) === stock0 + 7 && Number(await tab2.inputValue('#pr-' + vid)) === price0 + 1, 'ใช้สต็อกล่าสุดแล้วบันทึก → ราคาใหม่ + สต็อกที่ถูกต้อง', 'บันทึกหลังชนไม่ถูก');
  // คืนราคาเดิม (กันข้อ 5 รอบหน้า)
  await tab2.fill('#pr-' + vid, String(price0));
  await Promise.all([tab2.waitForURL(/saved=variant/), tab2.locator('#variant-' + vid + ' button[type=submit]').click()]);
  await tab2.close();

  // --- กด "ชำระแล้ว" / "ยกเลิก" พร้อมกัน 4 ครั้ง → ตัด/คืนสต็อกครั้งเดียว ---
  await page.goto(BASE + '/admin/products');
  const before = Number(await page.inputValue('#st-' + vid));
  await page.goto(BASE + '/admin/orders/new');
  await page.check('input[name=customerMode][value=new]');
  await page.fill('#c_name', 'ลูกค้าพร้อมกัน' + tag);
  await page.fill('#qty_v' + vid, '2');
  await Promise.all([page.waitForURL(/saved=created/), page.click('button:has-text("บันทึกออเดอร์")')]);
  const code = page.url().match(/orders\/(S\d{4}-\d+)/)[1];
  const burst = (fields) => page.evaluate(async ({ url, fields }) => Promise.all(Array.from({ length: 4 }, async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return (await fetch(url, { method: 'POST', body: fd })).status;
  })), { url: '/admin/orders/' + code, fields });
  const paid = await burst({ intent: 'pay', paidOn: today, payMethod: 'transfer' });
  await page.goto(BASE + '/admin/products');
  const afterPay = Number(await page.inputValue('#st-' + vid));
  check(paid.every((x) => x === 200) && afterPay === before - 2, 'กด "ชำระแล้ว" พร้อมกัน 4 ครั้ง → สต็อก ' + before + ' → ' + afterPay + ' (ตัดครั้งเดียว)', 'ตัดสต็อกซ้ำ: ' + before + ' → ' + afterPay + ' (' + paid + ')');
  const cancelled = await burst({ intent: 'cancel' });
  await page.goto(BASE + '/admin/products');
  const afterCancel = Number(await page.inputValue('#st-' + vid));
  check(cancelled.every((x) => x === 200) && afterCancel === before, 'กด "ยกเลิก" พร้อมกัน 4 ครั้ง → สต็อกคืนเป็น ' + afterCancel + ' (คืนครั้งเดียว)', 'คืนสต็อกซ้ำ: ' + afterCancel + ' (คาด ' + before + ')');
}

check(pageErrors.length === 0, 'ไม่มี JavaScript error ในหน้า', `JavaScript error: ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : '\n✅ ผ่านทั้งหมด');
console.log('ℹ️ เขียนข้อมูลทดสอบลงฐานข้อมูลในเครื่อง — ล้างด้วย: npm run db:seed:local && npm run media:seed:local -- --prune');
process.exit(failed ? 1 : 0);
