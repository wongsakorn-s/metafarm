// ตรวจหน้าหลังบ้านในเบราว์เซอร์จริง (Edge/Chrome ที่ติดตั้งในเครื่อง) บนจอมือถือและคอม
//   npm run check:browser            ต้องรัน `npm run dev` ไว้ก่อน และมี private/dev-owner.txt
// ผลลัพธ์: ภาพหน้าจอใน private/screenshots/ + ตรวจ error ใน console และการล้นจอแนวนอน
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const OUT = 'private/screenshots';
mkdirSync(OUT, { recursive: true });

const creds = readFileSync('private/dev-owner.txt', 'utf8').split('\n');
const email = creds[0].split(/:\s*/)[1].trim();
const password = creds[1].split(/:\s*/)[1].trim();

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
const problems = [];

async function visit(page, path, name) {
  const errors = [];
  const onErr = (e) => errors.push(`pageerror: ${e.message}`);
  const onCon = (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`);
  page.on('pageerror', onErr); page.on('console', onCon);
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
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
  await visit(page, '/admin/login', `${label}-login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL('**/admin'), page.click('button[type=submit]')]);
  for (const [p, n] of [['/admin', 'dashboard'], ['/admin/hives', 'hives'], ['/admin/hives/A25', 'hive-A25'], ['/admin/hives/A25/edit', 'edit-A25'], ['/admin/hives/A25/media', 'media-A25'], ['/admin/hives/new', 'new-hive'], ['/admin/hives?incomplete=1', 'incomplete']])
    await visit(page, p, `${label}-${n}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `\nพบปัญหา ${problems.length} หน้า: ${problems.join(', ')}` : '\nทุกหน้าผ่าน');
process.exit(problems.length ? 1 : 0);
