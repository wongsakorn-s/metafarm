// จับภาพและข้อความของหน้าสาธารณะ เพื่อเทียบก่อน/หลังแก้ว่าไม่มีข้อความหายไป (docs/14-public-ux-plan.md ขั้น 0)
//   bun run check:public -- <label>                     จับภาพทุกหน้า (ต้องรัน `bun run dev` ไว้ก่อน)
//   bun run check:public -- --compare <before> <after>  เทียบข้อความ: บรรทัดของ before ที่หายใน after
//   bun run check:public -- --compare <before> <after> --allow "ข้อความ1|ข้อความ2"  ยกเว้นบรรทัดที่ระบุ
// ผลลัพธ์: private/snapshots/<label>/<viewport>/ (ภาพเต็มหน้า + ข้อความ .txt) — private/ ไม่ถูกคอมมิต
// หมายเหตุ: หน้า /passport มีรังตัวอย่างสุ่มทุกครั้ง จึงไม่เทียบบรรทัด "รัง <รหัส>" ของหน้านั้น
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = join(ROOT, 'private', 'snapshots');
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';

// มือถือ 390×844 (emulation) และคอม 1280×800
const VIEWPORTS = {
  m: { width: 390, height: 844, isMobile: true, hasTouch: true },
  d: { width: 1280, height: 800 },
};
// ความกว้างที่ตรวจการเลื่อนแนวนอน
const WIDTHS = [360, 390, 768, 900, 1024, 1280];
const STATIC_PAGES = [
  '/', '/gallery', '/products', '/products/hives', '/stingless-bee', '/honey', '/learn/research',
  '/passport', '/passport?view=all', '/passport?view=bred', '/passport?view=sold', '/passport?view=active',
  '/training', '/training/hive-splitting', '/farmstay', '/contact', '/privacy', '/ไม่มีหน้านี้',
];
// รูปแบบรหัสรังที่สุ่มแสดงในหน้า /passport (ไม่เทียบข้ามการจับภาพ)
const SAMPLE_PASSPORT = /^รัง [A-Z]+\d+$/;

function slugify(name) {
  return name.replace(/[/?=&]/g, '_').replace(/^_+/, '') || 'home';
}

async function discover(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS.d });
  const page = await ctx.newPage();
  const hrefs = async (path, selector) => {
    await page.goto(BASE + path, { waitUntil: 'load' });
    return page.$$eval(selector, (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  };
  const products = (await hrefs('/products', 'main a[href^="/products/"]')).filter((h) => h && !h.startsWith('/products/hives') && h.split('/').length === 3);
  const saleHives = (await hrefs('/products/hives', 'main a[href^="/products/hives/"]')).filter((h) => h.split('/').length === 4);
  const passports = (await hrefs('/passport?view=all', 'main a[href^="/passport/"]')).filter((h) => h.split('/').length === 3);
  await ctx.close();
  // สมุดพก 4 รังแรกจากหมวด "ทั้งหมด" (รายการนี้ไม่สุ่ม)
  return { products, saleHives, passports: passports.slice(0, 4) };
}

async function capture(label) {
  const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
  const found = await discover(browser);
  const pages = [...STATIC_PAGES, ...found.products, ...found.saleHives, ...found.passports];
  console.log(`หน้าที่จะจับ ${pages.length} หน้า (สินค้า ${found.products.length}, รังขาย ${found.saleHives.length}, สมุดพก ${found.passports.length})`);

  const overflows = [];
  for (const [vk, vp] of Object.entries(VIEWPORTS)) {
    const dir = join(SNAP, label, vk);
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const path of pages) {
      const res = await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 }).catch((e) => ({ error: e.message.slice(0, 80) }));
      if (res.error) { console.log(`ERR ${vk} ${path} ${res.error}`); continue; }
      await page.waitForTimeout(500);
      // ซ่อน dev toolbar ของ Astro ที่ลอยทับเนื้อหาตอนจับภาพ (เฉพาะโหมด dev)
      await page.addStyleTag({ content: 'astro-dev-toolbar{display:none !important}' });
      const text = await page.evaluate(() => {
        const parts = ['header', '#main', 'footer'].map((sel) => document.querySelector(sel)?.innerText ?? '');
        return parts.join('\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      });
      const name = slugify(path);
      writeFileSync(join(dir, `${name}.txt`), text + '\n', 'utf8');
      await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
      console.log(`${vk} ${path} ${text.split('\n').length} บรรทัด`);
    }
    await ctx.close();
  }

  // การเลื่อนแนวนอนที่ความกว้างต่าง ๆ (หน้าแรกกับหน้ารายการหลัก)
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/products', '/passport', '/training']) {
      await page.goto(BASE + path, { waitUntil: 'load' });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) overflows.push(`${w}px ${path} เลื่อนแนวนอนได้ ${over}px`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(overflows.length ? `\nการเลื่อนแนวนอน:\n${overflows.join('\n')}` : '\nไม่มีการเลื่อนแนวนอนที่ความกว้างที่ตรวจ');
  console.log(`บันทึกที่ ${join(SNAP, label)}`);
}

// ข้อความ (บรรทัด) ที่ไม่ซ้ำ เพื่อเทียบว่าบรรทัดของ before ยังอยู่ใน after
function linesOf(file) {
  return readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

function compare(before, after, allow) {
  const missing = [];
  for (const vk of Object.keys(VIEWPORTS)) {
    const dirB = join(SNAP, before, vk);
    if (!existsSync(dirB)) { console.log(`ไม่พบ ${dirB}`); process.exit(2); }
    for (const f of readdirSync(dirB).filter((x) => x.endsWith('.txt'))) {
      const fileA = join(SNAP, after, vk, f);
      if (!existsSync(fileA)) { missing.push(`[${vk}] ${f}: หน้านี้หายไปทั้งหน้า`); continue; }
      const afterSet = new Set(linesOf(fileA));
      const isPassport = f.startsWith('passport');
      for (const line of linesOf(join(dirB, f))) {
        if (afterSet.has(line)) continue;
        if (isPassport && SAMPLE_PASSPORT.test(line)) continue;
        if (allow.some((a) => line.includes(a))) continue;
        missing.push(`[${vk}] ${f}: ${line}`);
      }
    }
  }
  if (missing.length) {
    console.log(`พบข้อความหายไป ${missing.length} บรรทัด:\n${missing.join('\n')}`);
    process.exit(1);
  }
  console.log('ไม่มีข้อความหายไป');
}

const args = process.argv.slice(2);
if (args[0] === '--compare') {
  const allowIdx = args.indexOf('--allow');
  const allow = allowIdx >= 0 ? args[allowIdx + 1].split('|').filter(Boolean) : [];
  compare(args[1], args[2], allow);
} else {
  await capture(args[0] ?? 'latest');
}
