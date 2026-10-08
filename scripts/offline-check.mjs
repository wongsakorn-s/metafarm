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
const noise = (msg) => useWebkit && /due to access control checks/.test(msg);
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
const HIVE = (await page.getAttribute('a[href^="/admin/hives/A"]', 'href')).split('/')[3];
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const tag = Date.now().toString().slice(-6);
const badge = page.locator('[data-outbox-badge]');
const badgeText = async () => ((await badge.isVisible()) ? (await page.textContent('[data-outbox-text]'))?.trim() : '');
// รอสคริปต์คิวรอส่งพร้อมก่อน (กดก่อนสคริปต์โหลด = ส่งฟอร์มแบบปกติ)
const ready = () => page.waitForSelector('body[data-outbox-ready]', { timeout: 15000 });
const hivePage = async () => { await page.goto(`${BASE}/admin/hives/${HIVE}`); await ready(); };
const timelineCount = async (text) => { await hivePage(); return page.locator(`#timeline li:has-text("${text}")`).count(); };
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
  await record('เก็บน้ำหวาน', () => type('#h-ml', ml), 'บันทึกการเก็บน้ำหวาน');
  await page.locator('[data-outbox-note]').first().waitFor({ timeout: 20000 });
  const msg = (await page.locator('#form-honey [data-outbox-note]').textContent()) ?? '';
  const cleared = (await page.inputValue('#h-ml')) === '';
  await note(`offline-1 ${tag}`);
  await page.locator('#form-note [data-outbox-note]').waitFor({ timeout: 20000 });
  await note(`offline-2 ${tag}`);
  await page.waitForFunction(() => document.querySelector('[data-outbox-text]')?.textContent?.includes('3'), null, { timeout: 20000 }).catch(() => {});
  check(msg.includes('เก็บไว้ในเครื่องแล้ว') && cleared && (await badgeText()) === 'รอส่ง 3', 'ออฟไลน์: "เก็บไว้ในเครื่องแล้ว" · ช่องว่างพร้อมบันทึกต่อ · แถบ "รอส่ง 3"', `ไม่เข้าคิว (${msg} / ${await badgeText()})`);
  const logoutConfirm = await page.getAttribute('form[action="/admin/logout"]', 'data-confirm');
  check(logoutConfirm?.includes('ยังมี 3 รายการ'), 'ออกจากระบบระหว่างมีรายการค้าง → เตือนก่อน', 'ไม่เตือนตอนออกจากระบบ: ' + logoutConfirm);
  await goOnline();
  await waitDrained();
  const n = [await timelineCount(`${ml} มล.`), await timelineCount(`offline-1 ${tag}`), await timelineCount(`offline-2 ${tag}`)];
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

check(pageErrors.length === 0, 'ไม่มี JavaScript error ในหน้า', `JavaScript error: ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : '\n✅ ผ่านทั้งหมด');
process.exit(failed ? 1 : 0);
