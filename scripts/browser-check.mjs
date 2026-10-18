// ตรวจหน้าหลังบ้านในเบราว์เซอร์จริง (Edge/Chrome ที่ติดตั้งในเครื่อง) บนจอมือถือและคอม
//   bun run check:browser            ต้องรัน `bun run dev` ไว้ก่อน และมี private/dev-owner.txt
// ผลลัพธ์: ภาพหน้าจอใน private/screenshots/ + ตรวจ error ใน console และการล้นจอแนวนอน
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const OUT = 'private/screenshots';
mkdirSync(OUT, { recursive: true });

// ระบบจริง: ตั้ง ADMIN_EMAIL และ ADMIN_PASSWORD (ไม่ใส่ในบรรทัดคำสั่ง) · ในเครื่อง: อ่านจาก private/dev-owner.txt
const creds = process.env.ADMIN_EMAIL ? [] : readFileSync('private/dev-owner.txt', 'utf8').split('\n');
const email = process.env.ADMIN_EMAIL ?? creds[0].split(/:\s*/)[1].trim();
const password = process.env.ADMIN_PASSWORD ?? creds[1].split(/:\s*/)[1].trim();

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
const problems = [];

async function visit(page, path, name, expect = 200) {
  const errors = [];
  const onErr = (e) => errors.push(`pageerror: ${e.message}`);
  // หน้าที่ตั้งใจให้ได้ 404: เบราว์เซอร์จะบันทึก "Failed to load resource" ของตัวหน้าเอง ถือเป็นเรื่องปกติ
  const onCon = (m) => m.type() === 'error' && !(expect !== 200 && /Failed to load resource/.test(m.text())) && errors.push(`console: ${m.text()}`);
  page.on('pageerror', onErr); page.on('console', onCon);
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (res?.status() !== expect) errors.push(`สถานะ ${res?.status()} (คาดว่า ${expect})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  page.off('pageerror', onErr); page.off('console', onCon);
  const issues = [...errors, ...(overflow > 1 ? [`แนวนอนล้นจอ ${overflow}px`] : []), ...broken.map((s) => `รูปเสีย: ${s}`)];
  console.log(`${issues.length ? 'FAIL' : 'PASS'} ${res?.status()} ${name} ${path}${issues.length ? '\n   ' + issues.join('\n   ') : ''}`);
  if (issues.length) problems.push(name);
}

// ปุ่ม ‹ › ใน lightbox ต้องกดได้ด้วยเมาส์/นิ้ว (เคยกดไม่ได้บนคอมเพราะ stage จับ pointer ไว้ — เจ้าของแจ้ง 2026-10-18)
// คลิกที่กลางปุ่มจริง (page.mouse) ไม่ใช่ element.click() ซึ่งข้ามปัญหานี้ได้
async function checkLightbox(page, paths, name) {
  const counter = page.locator('[data-lb-counter]');
  const text = async () => (await counter.textContent())?.trim() ?? '';
  for (const path of paths) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const first = page.locator('[data-zoom-group] a[data-zoom]').first();
    if (!(await first.count())) continue;
    await first.click();
    await counter.waitFor({ state: 'visible' });
    const start = await text();
    if (!/^1 \/ ([2-9]|\d\d)/.test(start)) { await page.keyboard.press('Escape'); continue; } // รูปเดียว ลองหน้าถัดไป
    const tap = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400); return text(); };
    const afterNext = await tap('[data-lb-next]'), afterPrev = await tap('[data-lb-prev]');
    await page.keyboard.press('Escape');
    const ok = afterNext.startsWith('2 /') && afterPrev.startsWith('1 /');
    console.log(`${ok ? 'PASS' : 'FAIL'} lightbox ${name} ${path} (${start} → › ${afterNext} → ‹ ${afterPrev})`);
    if (!ok) problems.push(`lightbox-${name}`);
    return;
  }
  console.log(`SKIP lightbox ${name}: ไม่พบหน้าที่มีรูปให้เลื่อนอย่างน้อย 2 รูป (${paths.join(', ')})`);
}

for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'th-TH' });
  const page = await ctx.newPage();
  // หน้าสาธารณะ (ยังไม่ล็อกอิน) — A19 = รังที่ขายแล้ว, A99999 = ไม่มีรหัสนี้ (ต้องได้ 404 สวย ๆ)
  for (const [p, n, st] of [['/', 'home'], ['/passport', 'passport-search'], ['/passport/A25', 'passport-A25'], ['/passport/A19', 'passport-A19-sold'], ['/passport/A99999', 'passport-404', 404],
    ['/products', 'products'], ['/products/hives', 'products-hives'], ['/products/hive-box', 'product-hive-box'], ['/products/stingless-honey', 'product-honey'], ['/products/hives/A99999', 'product-hive-404', 404]])
    await visit(page, p, `${label}-public-${n}`, st);
  for (const [p, n, st] of [['/stingless-bee', 'stingless-bee'], ['/honey', 'honey'], ['/learn/research', 'research'], ['/training', 'training'], ['/training/hive-splitting', 'training-hive-splitting'],
    ['/training/honey-processing', 'training-honey-processing'], ['/training/nope', 'training-404', 404], ['/contact', 'contact'], ['/privacy', 'privacy'], ['/farmstay', 'farmstay'], ['/gallery', 'gallery']])
    await visit(page, p, `${label}-public-${n}`, st);
  await checkLightbox(page, ['/gallery', '/passport/A12', '/passport/A25', '/products/hive-box'], label);
  // รังที่เปิดขายอยู่ (ถ้ามี): หาลิงก์แรกจากหน้ารายการแล้วเปิดหน้ารายละเอียด
  await page.goto(BASE + '/products/hives', { waitUntil: 'networkidle' });
  const saleLink = await page.evaluate(() => document.querySelector('a[href^="/products/hives/A"]')?.getAttribute('href'));
  if (saleLink) await visit(page, saleLink, `${label}-public-product-hive-detail`);
  await visit(page, '/admin/login', `${label}-login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL('**/admin'), page.click('button[type=submit]')]);
  for (const [p, n] of [['/admin', 'dashboard'], ['/admin/lots', 'lots'], ['/admin/reports', 'reports'], ['/admin/users', 'users'], ['/admin/outbox', 'outbox'], ['/admin/orders', 'orders'], ['/admin/orders/new', 'order-new'], ['/admin/customers', 'customers'], ['/admin/production', 'production'], ['/admin/quick', 'quick'], ['/admin/more', 'more'], ['/admin/hives', 'hives'], ['/admin/hives/A25', 'hive-A25'], ['/admin/hives/A25/edit', 'edit-A25'], ['/admin/hives/A25/media', 'media-A25'], ['/admin/hives/new', 'new-hive'], ['/admin/hives?incomplete=1', 'incomplete'], ['/admin/products', 'products'], ['/admin/readiness', 'readiness'], ['/admin/settings', 'settings'], ['/admin/photos', 'photos'], ['/admin/todo', 'todo'], ['/admin/account', 'account']])
    await visit(page, p, `${label}-${n}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `\nพบปัญหา ${problems.length} หน้า: ${problems.join(', ')}` : '\nทุกหน้าผ่าน');
process.exit(problems.length ? 1 : 0);
