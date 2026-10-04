// ตรวจหน้าหลังบ้านในเบราว์เซอร์จริง (Edge/Chrome ที่ติดตั้งในเครื่อง) บนจอมือถือและคอม
//   npm run check:browser            ต้องรัน `npm run dev` ไว้ก่อน และมี private/dev-owner.txt
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

for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'th-TH' });
  const page = await ctx.newPage();
  // หน้าสาธารณะ (ยังไม่ล็อกอิน) — A19 = รังที่ขายแล้ว, A99999 = ไม่มีรหัสนี้ (ต้องได้ 404 สวย ๆ)
  for (const [p, n, st] of [['/', 'home'], ['/passport', 'passport-search'], ['/passport/A25', 'passport-A25'], ['/passport/A19', 'passport-A19-sold'], ['/passport/A99999', 'passport-404', 404],
    ['/products', 'products'], ['/products/hives', 'products-hives'], ['/products/hive-box', 'product-hive-box'], ['/products/stingless-honey', 'product-honey'], ['/products/hives/A99999', 'product-hive-404', 404]])
    await visit(page, p, `${label}-public-${n}`, st);
  for (const [p, n, st] of [['/stingless-bee', 'stingless-bee'], ['/honey', 'honey'], ['/learn/research', 'research'], ['/training', 'training'], ['/training/hive-splitting', 'training-hive-splitting'],
    ['/training/honey-processing', 'training-honey-processing'], ['/training/nope', 'training-404', 404], ['/contact', 'contact'], ['/privacy', 'privacy']])
    await visit(page, p, `${label}-public-${n}`, st);
  // รังที่เปิดขายอยู่ (ถ้ามี): หาลิงก์แรกจากหน้ารายการแล้วเปิดหน้ารายละเอียด
  await page.goto(BASE + '/products/hives', { waitUntil: 'networkidle' });
  const saleLink = await page.evaluate(() => document.querySelector('a[href^="/products/hives/A"]')?.getAttribute('href'));
  if (saleLink) await visit(page, saleLink, `${label}-public-product-hive-detail`);
  await visit(page, '/admin/login', `${label}-login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL('**/admin'), page.click('button[type=submit]')]);
  for (const [p, n] of [['/admin', 'dashboard'], ['/admin/hives', 'hives'], ['/admin/hives/A25', 'hive-A25'], ['/admin/hives/A25/edit', 'edit-A25'], ['/admin/hives/A25/media', 'media-A25'], ['/admin/hives/new', 'new-hive'], ['/admin/hives?incomplete=1', 'incomplete'], ['/admin/products', 'products']])
    await visit(page, p, `${label}-${n}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `\nพบปัญหา ${problems.length} หน้า: ${problems.join(', ')}` : '\nทุกหน้าผ่าน');
process.exit(problems.length ? 1 : 0);
