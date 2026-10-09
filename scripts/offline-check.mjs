// ทดสอบคิวรอส่ง (Phase 5.5): บันทึกงานรัง/รูปตอนสัญญาณหลุด แล้วส่งเองเมื่อกลับมา — ไม่หาย ไม่ซ้ำ
//   npm run check:offline              Chromium (Android)
//   npm run check:offline -- --webkit  WebKit (เครื่องยนต์เดียวกับ iPhone) — ต้องติดตั้ง: npx playwright-core install webkit
// ต้องรัน `npm run dev` ไว้ และมี private/dev-owner.txt · เขียนข้อมูลทดสอบลงฐานข้อมูลในเครื่อง (localhost เท่านั้น)
import { readFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('check:offline เขียนข้อมูล — รันกับ localhost เท่านั้น');
const useWebkit = process.argv.includes('--webkit');
const creds = readFileSync('private/dev-owner.txt', 'utf8').split('\n');
const email = creds[0].split(/:\s*/)[1].trim();
const password = creds[1].split(/:\s*/)[1].trim();

const browser = useWebkit ? await webkit.launch() : await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: !useWebkit || undefined, hasTouch: true });
const page = await ctx.newPage();
const pageErrors = [];
// WebKit บันทึกคำขอที่เน็ตตัดเป็น "…due to access control checks" แม้โค้ดจับ error เองแล้ว (send() ใน outbox.ts)
// และแถบเครื่องมือ astro dev (audit-*.js) ดึงรูปตอนเน็ตตัด — สองอย่างนี้ไม่ใช่ error ของหน้าเว็บ
const noise = (msg) => (useWebkit && /due to access control checks/.test(msg)) || /Failed to fetch dynamically imported module: \S+\/node_modules\/\.vite\/deps\/audit-/.test(msg);
page.on('pageerror', (e) => {
  const msg = e.message + (e.stack ? ` @ ${e.stack.split(/\r?\n/).slice(0, 3).join(' < ')}` : '');
  if (!noise(msg)) pageErrors.push(msg);
});
page.on('dialog', (d) => d.accept());

let failed = 0;
const check = (cond, good, bad) => { if (cond) console.log(`   ✅ ${good}`); else { failed++; console.log(`   ❌ ${bad}`); } };
console.log(`check:offline (${useWebkit ? 'WebKit / iPhone' : 'Chromium / Android'})`);

const login = async () => {
  await page.goto(BASE + '/admin/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/admin(\?|$)/), page.press('#password', 'Enter')]);
};
await login();
await page.goto(BASE + '/admin/hives?status=active');
const codes = await page.locator('a[href^="/admin/hives/A"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href').split('/')[3]))]);
const HIVE = codes[0];
const HIVE2 = codes.find((c) => c !== HIVE);
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const tag = Date.now().toString().slice(-6);
const badge = page.locator('[data-outbox-badge]');
const badgeText = async () => ((await badge.isVisible()) ? (await page.textContent('[data-outbox-text]'))?.trim() : '');
// รอสคริปต์คิวรอส่งพร้อมก่อน (กดก่อนสคริปต์โหลด = ส่งฟอร์มแบบปกติ)
const ready = () => page.waitForSelector('body[data-outbox-ready]', { timeout: 15000 });
const hivePage = async () => { await page.goto(`${BASE}/admin/hives/${HIVE}`); await ready(); };
const timelineCount = async (text, code = HIVE) => { await page.goto(`${BASE}/admin/hives/${code}`); await ready(); return page.locator(`#timeline li:has-text("${text}")`).count(); };
// ตัดเน็ต: Chromium ใช้โหมดออฟไลน์จริง · WebKit ใช้การตัดคำขอที่ไปเซิร์ฟเวอร์แทน
// (โหมดออฟไลน์ของ Playwright บน WebKit อ่านไฟล์/Blob ในเครื่องไม่ได้ด้วย — iPhone จริงในโหมดเครื่องบินอ่านได้)
const blockServer = (route) => (route.request().method() === 'POST' || route.request().resourceType() === 'fetch' ? route.abort('internetdisconnected') : route.continue());
const goOffline = async () => {
  if (useWebkit) await ctx.route(`${BASE}/admin/**`, blockServer);
  else await ctx.setOffline(true);
};
const goOnline = async () => {
  if (useWebkit) await ctx.unroute(`${BASE}/admin/**`, blockServer);
  else await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
};
const badgeBg = () => badge.evaluate((el) => getComputedStyle(el).backgroundColor);
let pendingBg = '';
const waitDrained = () => badge.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
const record = async (summary, fill, button) => {
  // เปิดกล่องด้วยการแตะแบบคนจริง เฉพาะตอนยังปิด (แตะซ้ำ = ปิด · สั่งเปิดด้วยโค้ดแล้วพิมพ์ทันที WebKit ทิ้งค่าที่พิมพ์)
  const box = page.locator(`details:has(> summary:has-text("${summary}"))`).first();
  if (!(await box.evaluate((d) => d.open))) await box.locator('> summary').click();
  await fill();
  await page.click(`button:has-text("${button}")`);
};
// พิมพ์จนค่าเข้าจริง — Playwright บน WebKit พิมพ์ไม่ติดถ้าสั่งทันทีหลังกล่อง <details> เปิด (คนจริงไม่เจอ)
const type = async (sel, value) => {
  for (let i = 0; i < 10 && (await page.inputValue(sel)) !== value; i++) { await page.fill(sel, value); if ((await page.inputValue(sel)) !== value) await page.waitForTimeout(200); }
};
const note = (text) => record('หมายเหตุ', () => type('#n-note', text), 'บันทึกหมายเหตุ');

console.log('\n1) สัญญาณหลุด: บันทึก 3 รายการ → เก็บในเครื่อง → สัญญาณกลับ ส่งเองครบ ไม่ซ้ำ');
{
  await hivePage();
  await goOffline();
  const ml = String(700 + Number(tag.slice(-2)));
  // หมายเหตุมีรหัสรอบนี้ — นับเฉพาะรายการของรอบนี้ (ปริมาณอย่างเดียวซ้ำกับรอบก่อนได้)
  await record('เก็บน้ำหวาน', async () => { await type('#h-ml', ml); await type('#h-note', `honey ${tag}`); }, 'บันทึกการเก็บน้ำหวาน');
  await page.locator('[data-outbox-note]').first().waitFor({ timeout: 20000 });
  const msg = (await page.locator('#form-honey [data-outbox-note]').textContent()) ?? '';
  const cleared = (await page.inputValue('#h-ml')) === '';
  await note(`offline-1 ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  await note(`offline-2 ${tag}`);
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.includes('3'), null, { timeout: 20000 }).catch(() => {});
  pendingBg = await badgeBg();
  check(msg.includes('เก็บไว้ในเครื่องแล้ว') && cleared && (await badgeText()) === 'รอส่ง 3', 'ออฟไลน์: "เก็บไว้ในเครื่องแล้ว" · ช่องว่างพร้อมบันทึกต่อ · แถบ "รอส่ง 3"', `ไม่เข้าคิว (${msg} / ${await badgeText()})`);
  const logoutConfirm = await page.getAttribute('form[action="/admin/logout"]', 'data-confirm');
  check(logoutConfirm?.includes('ยังมี 3 รายการ'), 'ออกจากระบบระหว่างมีรายการค้าง → เตือนก่อน', 'ไม่เตือนตอนออกจากระบบ: ' + logoutConfirm);
  await goOnline();
  await waitDrained();
  const n = [await timelineCount(`honey ${tag}`), await timelineCount(`offline-1 ${tag}`), await timelineCount(`offline-2 ${tag}`)];
  check(!(await badge.isVisible()) && n.every((x) => x === 1), 'สัญญาณกลับ → ส่งเองครบ 3 รายการ รายการละครั้งเดียว', `ส่งไม่ครบ/ซ้ำ: ${n.join(', ')}`);
}

console.log('\n2) เซิร์ฟเวอร์บันทึกแล้วแต่คำตอบหาย → ส่งซ้ำไม่เกิดรายการซ้ำ');
{
  await hivePage();
  let hits = 0;
  await page.route(`**/admin/hives/${HIVE}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    hits++;
    await route.fetch(); // ถึงเซิร์ฟเวอร์ (บันทึกแล้ว)
    await route.abort('failed'); // แต่คำตอบไม่ถึงมือถือ
  });
  await note(`lost-reply ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  await page.unroute(`**/admin/hives/${HIVE}`);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitDrained();
  check(hits === 1 && (await timelineCount(`lost-reply ${tag}`)) === 1, 'คำตอบหาย → เข้าคิว → ส่งซ้ำ → มีรายการเดียว', 'เกิดรายการซ้ำ/หาย');
}

console.log('\n3) เน็ตช้าเกิน 15 วินาที → เข้าคิว ไม่ต้องยืนรอ → ได้รายการเดียว');
{
  await hivePage();
  await page.route(`**/admin/hives/${HIVE}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((r) => setTimeout(r, 17000));
    await route.continue().catch(() => {});
  });
  const t0 = Date.now();
  await note(`slow ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 25000 });
  const waited = Math.round((Date.now() - t0) / 1000);
  await page.unroute(`**/admin/hives/${HIVE}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitDrained();
  check(waited <= 18 && (await timelineCount(`slow ${tag}`)) === 1, `ช้าเกินเวลา → เข้าคิวใน ${waited} วินาที · สุดท้ายมีรายการเดียว`, `ไม่เข้าคิว/ซ้ำ (${waited} วินาที)`);
}

console.log('\n4) ข้อมูลผิด: ออนไลน์ = แจ้งตรงช่องทันที · ออฟไลน์ = ค้างในคิวพร้อมเหตุผล');
{
  await hivePage();
  await record('แยกไข่อ่อน', () => type('#b-t', 'A99999'), 'บันทึกการแยกรัง');
  await page.waitForLoadState('load');
  const alert = (await page.locator('[role=alert]').first().textContent().catch(() => '')) ?? '';
  check(/A99999/.test(alert) && !(await badge.isVisible()), 'ออนไลน์ + รหัสรังผิด → แจ้งข้อผิดพลาดในหน้าเลย (ไม่เข้าคิว)', 'ไม่แจ้งข้อผิดพลาด: ' + alert);
  await hivePage();
  await goOffline();
  await record('แยกไข่อ่อน', () => type('#b-t', 'A99999'), 'บันทึกการแยกรัง');
  await page.locator('#form-brood [data-outbox-note]').waitFor({ timeout: 20000 });
  await goOnline();
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.includes('ต้องแก้'), null, { timeout: 20000 }).catch(() => {});
  await page.goto(BASE + '/admin/outbox');
  const item = page.locator('[data-outbox-item]').first();
  await item.waitFor({ timeout: 10000 });
  const text = (await item.textContent()) ?? '';
  check(text.includes('ส่งไม่ผ่าน') && text.includes('A99999'), 'สัญญาณกลับ → ค้างในหน้า "รอส่ง" พร้อมเหตุผล (รหัสรังผิด)', 'ไม่บอกเหตุผล: ' + text.slice(0, 120));
  await item.locator('button:has-text("ลบรายการนี้")').click();
  await page.locator('#empty').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  check(await page.locator('#empty').isVisible(), 'ลบรายการที่ผิดได้ (ถามยืนยัน)', 'ลบรายการไม่ได้');
}

console.log('\n5) ล็อกอินหมดอายุระหว่างออฟไลน์ → รายการยังอยู่ → ล็อกอินแล้วส่งต่อเอง');
{
  await hivePage();
  await goOffline();
  await note(`session ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  await ctx.clearCookies();
  await goOnline();
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.includes('ต้องแก้'), null, { timeout: 20000 }).catch(() => {});
  const stuck = await badgeText();
  const stuckBg = await badgeBg();
  check(stuckBg !== pendingBg, `แถบ "ต้องแก้" เปลี่ยนสี (${pendingBg} → ${stuckBg})`, `แถบ "ต้องแก้" สีเดียวกับ "รอส่ง" (${stuckBg})`);
  await login();
  await page.goto(BASE + '/admin/outbox');
  await page.locator('#empty').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  check(stuck.includes('ต้องแก้ 1') && (await timelineCount(`session ${tag}`)) === 1, 'หมดอายุ → แถบ "ต้องแก้ 1" · ล็อกอินใหม่ → ส่งต่อเองครบ', `รายการหาย/ไม่ส่งต่อ (${stuck})`);
}

console.log('\n6) รูปตอนออฟไลน์ → เก็บในเครื่อง → ส่งเองได้รูปเดียว');
{
  await page.goto(`${BASE}/admin/hives/${HIVE}/media`);
  await ready();
  const count = () => page.locator('img[src^="/media/hives/"]').count();
  const before = await count();
  await goOffline();
  await page.locator('#upload-form input[type=file]').first().evaluate(async (el) => {
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 750;
    const g = cv.getContext('2d'); g.fillStyle = '#2f6fb3'; g.fillRect(0, 0, 1000, 750);
    const f = new File([await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9))], 'offline.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files;
  });
  await page.click('#upload-btn');
  await page.locator('#upload-status').filter({ hasText: 'เก็บไว้ในเครื่องแล้ว' }).waitFor({ timeout: 30000 }).catch(() => {});
  const st = (await page.textContent('#upload-status'))?.trim() ?? '';
  await goOnline();
  await waitDrained();
  await page.reload();
  check(st.includes('เก็บไว้ในเครื่องแล้ว') && (await count()) === before + 1, 'รูปตอนออฟไลน์ → "เก็บไว้ในเครื่องแล้ว" → สัญญาณกลับ ได้รูปเพิ่ม 1 รูป', `รูปไม่ถูกส่ง/ซ้ำ (${st}, ${before} → ${await count()})`);
}

console.log('\n7) มีรายการรอส่ง: แถบ "รอส่ง" ไม่ทับปุ่มบันทึกที่ติดล่างจอ');
{
  // เซิร์ฟเวอร์ตอบ 503 ให้รายการค้างในคิว (หน้าอื่นยังเปิดได้ตามปกติ)
  const hold = (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, body: 'busy' }) : route.continue());
  await hivePage();
  await page.route(`**/admin/hives/${HIVE}`, hold);
  await note(`hold ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  for (const path of ['/admin/hives/new', `/admin/hives/${HIVE}/edit`]) {
    await page.goto(BASE + path);
    await ready();
    await badge.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    console.log(`   · ${path}: แถบ "${await badgeText()}"`);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('[data-sticky-save]').getBoundingClientRect();
      const b = document.querySelector('[data-outbox-badge]').getBoundingClientRect();
      // ทุกปุ่มในแถบ: จุดกลางปุ่มต้องเป็นปุ่มนั้นเอง (ไม่ใช่แถบรอส่ง)
      const hits = [...document.querySelectorAll('[data-sticky-save] :is(button, a)')].map((el) => {
        const c = el.getBoundingClientRect();
        const top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return el.contains(top);
      });
      return { gap: Math.round(bar.top - b.bottom), hits, badge: b.height > 0 && b.top >= 0 };
    });
    check(r.gap >= 4 && r.hits.length > 0 && r.hits.every(Boolean) && r.badge, `${path}: แถบรอส่งอยู่เหนือแถบบันทึก (ห่าง ${r.gap}px) · แตะปุ่มบันทึกได้ทุกปุ่ม`, `${path}: แถบรอส่งทับแถบบันทึก (${JSON.stringify(r)})`);
  }
  await page.unroute(`**/admin/hives/${HIVE}`, hold);
  await hivePage();
  // แถบเริ่มแบบซ่อน (ก่อนสคริปต์นับคิว) — รอให้ขึ้นก่อน ไม่งั้น "หายแล้ว" ทันทีทั้งที่ยังส่งไม่เสร็จ
  await badge.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitDrained();
  const left = await badgeText();
  const held = await timelineCount(`hold ${tag}`);
  check(held === 1, 'เซิร์ฟเวอร์กลับมา → ส่งรายการที่ค้างได้ครั้งเดียว', `รายการที่ค้างหาย/ซ้ำ (พบ ${held} · แถบ: ${left})`);
}

console.log('\n8) คิวถ่ายรูป: ส่งไม่ได้และเก็บในเครื่องไม่ได้ → รูปยังอยู่ กด "ส่งอีกครั้ง" ได้');
{
  await page.goto(BASE + '/admin/photos');
  const code = await page.locator('#queue > li').first().getAttribute('data-code');
  const photoCount = async () => { await page.goto(`${BASE}/admin/hives/${code}/media`); return page.locator('img[src^="/media/hives/"]').count(); };
  const before = await photoCount();
  await page.goto(BASE + '/admin/photos');
  await ready();
  const li = page.locator(`#queue > li[data-code="${code}"]`);
  // จำลองพื้นที่เต็ม: เก็บลงเครื่องไม่ได้
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await goOffline();
  await li.locator('input[type=file]:not([capture])').evaluate(async (el) => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 700;
    const g = cv.getContext('2d'); g.fillStyle = '#7a9e3b'; g.fillRect(0, 0, 900, 700);
    const f = new File([await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9))], 'queue.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const retry = li.locator('[data-retry]');
  await retry.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  const st = (await li.locator('[data-state]').textContent())?.trim() ?? '';
  check((await retry.isVisible()) && st.includes('รูปยังอยู่ในหน้านี้'), 'ส่ง/เก็บไม่ได้ → บอกว่ารูปยังอยู่ · มีปุ่ม "ส่งอีกครั้ง"', `ไม่มีปุ่มส่งอีกครั้ง (${st})`);
  await goOnline();
  await retry.click();
  await li.locator('[data-state]').filter({ hasText: 'บันทึก' }).waitFor({ timeout: 30000 }).catch(() => {});
  const done = (await li.locator('[data-state]').textContent())?.trim() ?? '';
  const hidden = !(await retry.isVisible());
  const n = await photoCount();
  check(hidden && n === before + 1, `กด "ส่งอีกครั้ง" → ${code} ได้รูปเพิ่ม 1 รูป (${done})`, `ส่งอีกครั้งไม่สำเร็จ (${done}, รูป ${before} → ${n})`);
}

console.log('\n9) คำตอบขาดกลางทาง (เซิร์ฟเวอร์บันทึกแล้ว) ตอนส่งเบื้องหลัง → ส่งซ้ำ ไม่ขึ้น "ต้องแก้" · ได้รายการเดียว');
{
  await hivePage();
  await goOffline();
  await note(`cut-reply ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  let hits = 0;
  const cut = async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    hits++;
    await route.fetch(); // ถึงเซิร์ฟเวอร์ (บันทึกแล้ว)
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":tr' }); // แต่คำตอบขาด
  };
  await page.route(`**/admin/hives/${HIVE}`, cut);
  await goOnline();
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.trim() !== '', null, { timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 40 && hits === 0; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(500);
  const after = await badgeText();
  await page.unroute(`**/admin/hives/${HIVE}`, cut);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitDrained();
  const n = await timelineCount(`cut-reply ${tag}`);
  check(hits >= 1 && after === 'รอส่ง 1' && n === 1, 'คำตอบขาด → ยังเป็น "รอส่ง" (ไม่ใช่ต้องแก้) → ส่งซ้ำ → มีรายการเดียว', `ผิด (ส่ง ${hits} ครั้ง · แถบ "${after}" · พบ ${n})`);
}

console.log('\n10) รายการที่เซิร์ฟเวอร์ขัดข้องไม่ขวางรายการอื่น · เว้นระยะก่อนลองเอง · "ส่งตอนนี้" ส่งทันที');
{
  const busy = (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, body: 'busy' }) : route.continue());
  await page.route(`**/admin/hives/${HIVE}`, busy);
  await hivePage();
  await note(`busy ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  await page.goto(`${BASE}/admin/hives/${HIVE2}`);
  await ready();
  await goOffline();
  await note(`after-busy ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  // รอแถบนับครบ 2 ก่อน (ไม่งั้น "รอส่ง 1" ของรายการแรกทำให้ขั้นถัดไปผ่านทั้งที่ยังไม่ได้ส่ง)
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.trim() === 'รอส่ง 2', null, { timeout: 20000 }).catch(() => {});
  await goOnline();
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.trim() === 'รอส่ง 1', null, { timeout: 20000 }).catch(() => {});
  const left = await badgeText();
  const second = await timelineCount(`after-busy ${tag}`, HIVE2);
  check(left === 'รอส่ง 1' && second === 1, `รายการแรกเซิร์ฟเวอร์ขัดข้อง → รายการถัดไป (${HIVE2}) ยังส่งได้`, `รายการถัดไปถูกขวาง (แถบ "${left}" · ${HIVE2} พบ ${second})`);
  await page.goto(BASE + '/admin/outbox');
  const item = page.locator('[data-outbox-item]').first();
  await item.waitFor({ timeout: 10000 }).catch(() => {});
  const text = (await item.textContent().catch(() => '')) ?? '';
  check(text.includes('จะลองเองอีกครั้ง'), 'เซิร์ฟเวอร์ขัดข้อง → เว้นระยะ บอกเวลาที่จะลองเองครั้งถัดไป', 'ไม่บอกเวลาลองครั้งถัดไป: ' + text.slice(0, 120));
  await page.unroute(`**/admin/hives/${HIVE}`, busy);
  await page.click('#send-now');
  await page.locator('#empty').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const sent = await page.locator('#empty').isVisible();
  check(sent && (await timelineCount(`busy ${tag}`)) === 1, '"ส่งตอนนี้" ส่งทันทีไม่รอเว้นระยะ · ได้รายการเดียว', 'กด "ส่งตอนนี้" แล้วไม่ส่ง/ส่งซ้ำ');
}

console.log('\n11) การเชื่อมต่อฐานข้อมูลในเครื่องหลุด (iPhone หลังสลับแอป) → เปิดใหม่เอง เก็บรายการได้ตามปกติ');
{
  await hivePage();
  // การเชื่อมต่อที่เปิดไว้แล้ว "หลุด": ใช้ไม่ได้อีก แต่เปิดใหม่ได้ (แบบที่ iPhone เป็น โดยไม่มีเหตุการณ์ close)
  await page.evaluate(() => {
    const fresh = new WeakSet();
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...a) {
      const r = open.apply(this, a);
      r.addEventListener('success', () => fresh.add(r.result));
      return r;
    };
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...a) {
      if (!fresh.has(this)) throw new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
      return tx.apply(this, a);
    };
  });
  await goOffline();
  await note(`reconnect ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 }).catch(() => {});
  const msg = (await page.locator('#form-note [data-outbox-note]').textContent().catch(() => '')) ?? '';
  // รอแถบ "รอส่ง 1" ขึ้นก่อน (แถบเริ่มแบบซ่อน — ไม่งั้นรอ "แถบหาย" ผ่านทันทีทั้งที่ยังไม่ได้ส่ง)
  await badge.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await goOnline();
  await waitDrained();
  check(msg.includes('เก็บไว้ในเครื่องแล้ว') && (await timelineCount(`reconnect ${tag}`)) === 1, 'เชื่อมต่อหลุด → เปิดใหม่เอง → "เก็บไว้ในเครื่องแล้ว" → ส่งได้', `เก็บไม่ได้/ไม่ส่ง (${msg})`);
}

check(pageErrors.length === 0, 'ไม่มี JavaScript error ในหน้า', `JavaScript error: ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : '\n✅ ผ่านทั้งหมด');
process.exit(failed ? 1 : 0);
