// ทดสอบแบบ "จำลองมือถือ" (ลึกกว่าแค่ย่อหน้าต่าง): โปรไฟล์เครื่องจริง + touch + เครือข่าย/CPU ช้า + หมุนจอ + สัญญาณหลุด
//   npm run check:mobile            ต้องรัน `npm run dev` ไว้ (หรือ BASE_URL=… ชี้ preview/ระบบจริง) และมี private/dev-owner.txt
//   ตัวเลือก: MOBILE_FLOWS=0 ข้ามขั้นตอนที่เขียนข้อมูล (อัปโหลดรูป) · ADMIN_EMAIL / ADMIN_PASSWORD สำหรับระบบจริง
//
// ⚠️ ข้อจำกัด: เป็นการ "จำลอง" บน Chromium (Edge/Chrome ที่ติดตั้ง) ไม่ใช่เครื่องจริง และไม่ใช่เอนจิน Safari (WebKit)
//    จึงตรวจเรื่องขนาดจอ/สัมผัส/เครือข่ายได้ แต่ไม่รู้ว่า iOS Safari จริงทำอะไรต่าง (เช่นแปลงรูป HEIC, ปุ่มแถบเมนูล่าง, 100vh)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const FLOWS = process.env.MOBILE_FLOWS !== '0';
const OUT = 'private/screenshots/mobile';
mkdirSync(OUT, { recursive: true });

const creds = process.env.ADMIN_EMAIL ? [] : readFileSync('private/dev-owner.txt', 'utf8').split('\n');
const email = process.env.ADMIN_EMAIL ?? creds[0].split(/:\s*/)[1].trim();
const password = process.env.ADMIN_PASSWORD ?? creds[1].split(/:\s*/)[1].trim();

// เครื่องที่จำลอง (Chromium รับ viewport/touch/UA ของโปรไฟล์เหล่านี้ได้ แม้ iPhone จะเป็นเครื่อง WebKit จริง)
const PROFILES = [
  ['Pixel 7 (Android)', devices['Pixel 7']],
  ['iPhone 13', devices['iPhone 13']],
  ['iPhone SE รุ่นแรก (จอเล็กสุด 320×568)', devices['iPhone SE']],
];
const PUBLIC = ['/', '/stingless-bee', '/honey', '/products', '/training', '/passport', '/passport/A25', '/contact'];
const ADMIN = ['/admin', '/admin/hives', '/admin/hives/A25', '/admin/hives/A25/edit', '/admin/hives/A25/media', '/admin/hives/new', '/admin/account', '/admin/readiness', '/admin/photos', '/admin/todo', '/admin/settings', '/admin/products'];

/** ล็อกอินแบบที่ใช้จริงบนมือถือ: กรอกแล้วกด Enter (ไม่พึ่ง locator.tap ซึ่งค้างในโหมดจำลองจอแนวนอน) */
async function login(page) {
  await page.goto(BASE + '/admin/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL('**/admin'), page.press('#password', 'Enter')]);
}
/** แตะด้วยนิ้วที่กึ่งกลางองค์ประกอบ (เลื่อนให้เห็นก่อน) */
async function tapAt(page, selector) {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await page.locator(selector).first().boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
let failed = 0;
const fail = (m) => { failed++; console.log(`   ❌ ${m}`); };
const ok = (m) => console.log(`   ✅ ${m}`);

/** ตรวจหน้าเดียว: ล้นจอแนวนอน, console error, ขนาดจุดแตะ, ขนาดตัวอักษรในช่องกรอก, รูปเสีย */
async function audit(page, path) {
  const errors = [];
  const onErr = (e) => errors.push(`pageerror: ${e.message}`);
  const onCon = (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 120)}`);
  page.on('pageerror', onErr); page.on('console', onCon);
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const vw = innerWidth;
    const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('.sr-only') && !el.classList.contains('sr-only'); };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
    const small = [], tiny = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, summary, label')) {
      if (!visible(el) || el.closest('astro-dev-toolbar')) continue;
      // ช่องติ๊ก/ตัวเลือกที่อยู่ในป้ายกำกับที่แตะได้ ≥ 44px: ผู้ใช้แตะที่ป้าย ไม่ใช่ที่ตัวช่อง
      if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type)) { const l = el.closest('label')?.getBoundingClientRect(); if (l && l.height >= 44) continue; }
      if (el.tagName === 'LABEL') {
        // ป้ายที่เป็นปุ่ม (class btn, ผูกกับช่องเลือกไฟล์) หรือห่อ checkbox/radio ถือเป็นจุดแตะ · ป้ายของช่องกรอกข้อความไม่นับ
        const ctl = el.control;
        const isTapTarget = el.className.includes('btn') || (ctl && ['checkbox', 'radio', 'file'].includes(ctl.type)) || el.querySelector('input[type=checkbox], input[type=radio]');
        if (!isTapTarget) continue;
      }
      const b = el.getBoundingClientRect();
      const inline = getComputedStyle(el).display === 'inline'; // ลิงก์แทรกในข้อความ: เกณฑ์ผ่อนกว่า
      const h = Math.round(b.height), w = Math.round(b.width);
      if (inline ? h < 24 : (h < 44 || w < 44)) (inline ? tiny : small).push(`${el.tagName.toLowerCase()} "${label(el)}" ${w}×${h}`);
    }
    const fonts = [...document.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea')].filter(visible).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map(label);
    return {
      overflow: document.documentElement.scrollWidth - vw,
      small, tiny, fonts,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      zoomLocked: /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(document.querySelector('meta[name=viewport]')?.content ?? ''),
    };
  });
  page.off('pageerror', onErr); page.off('console', onCon);
  return { status: res?.status(), errors, ...r };
}

for (const [name, profile] of PROFILES) {
  console.log(`\n📱 ${name}  (${profile.viewport.width}×${profile.viewport.height}, ×${profile.deviceScaleFactor}, touch)`);
  const { defaultBrowserType, ...opts } = profile;
  const ctx = await browser.newContext({ ...opts, locale: 'th-TH' });
  const page = await ctx.newPage();

  // --- หน้าสาธารณะ ---
  const agg = { overflow: [], small: new Map(), tiny: new Map(), fonts: new Set(), errors: [], broken: [], zoom: false };
  const sweep = async (paths) => {
    for (const p of paths) {
      const a = await audit(page, p);
      if (a.status >= 500) agg.errors.push(`${p}: สถานะ ${a.status}`);
      if (a.overflow > 1) agg.overflow.push(`${p} (+${a.overflow}px)`);
      a.small.forEach((s) => agg.small.set(s, (agg.small.get(s) ?? new Set()).add(p)));
      a.tiny.forEach((s) => agg.tiny.set(s, (agg.tiny.get(s) ?? new Set()).add(p)));
      a.fonts.forEach((f) => agg.fonts.add(`${p}: ${f}`));
      a.errors.forEach((e) => agg.errors.push(`${p}: ${e}`));
      a.broken.forEach((b) => agg.broken.push(`${p}: ${b}`));
      agg.zoom ||= a.zoomLocked;
    }
  };
  await sweep(PUBLIC);
  await page.screenshot({ path: `${OUT}/${name.split(' ')[0]}-home.png`, fullPage: false });

  // --- หลังบ้าน (ล็อกอินด้วยการแตะ) ---
  await login(page);
  await sweep(ADMIN);

  console.log(agg.overflow.length ? '' : '   ✅ ไม่มีหน้าไหนล้นจอแนวนอน');
  agg.overflow.forEach((o) => fail(`ล้นจอแนวนอน: ${o}`));
  agg.errors.length ? agg.errors.slice(0, 6).forEach((e) => fail(e)) : ok('ไม่มี error ใน console / ไม่มีหน้า 5xx');
  agg.broken.length ? agg.broken.slice(0, 4).forEach((e) => fail(`รูปเสีย ${e}`)) : ok('ไม่มีรูปเสีย');
  agg.zoom ? fail('วิวพอร์ตล็อกการซูม (ผู้สายตาไม่ดีซูมไม่ได้)') : ok('ซูมได้ (วิวพอร์ตไม่ล็อกการซูม)');
  agg.fonts.size ? fail(`ช่องกรอกตัวอักษร < 16px (iOS จะซูมเข้าเองตอนแตะ): ${[...agg.fonts].slice(0, 3).join(' | ')}`) : ok('ช่องกรอกทุกช่องตัวอักษร ≥ 16px (iOS ไม่ซูมเอง)');
  if (agg.small.size) {
    fail(`จุดแตะเล็กกว่า 44×44px ${agg.small.size} จุด (ปุ่ม/เมนู/ช่องกรอก):`);
    [...agg.small].slice(0, Number(process.env.SHOW ?? 6)).forEach(([s, pages]) => console.log(`      · ${s}  [${[...pages][0]}${pages.size > 1 ? ` +${pages.size - 1} หน้า` : ''}]`));
  } else ok('ปุ่ม/เมนู/ช่องกรอกทุกอันแตะได้ ≥ 44×44px');
  agg.tiny.size ? (console.log(`   ⚠️  ลิงก์ในข้อความสูงต่ำกว่า 24px ${agg.tiny.size} จุด`), [...agg.tiny].slice(0, 3).forEach(([s]) => console.log(`      · ${s}`))) : ok('ลิงก์ในข้อความสูง ≥ 24px');
  await ctx.close();
}

// ---------- หมุนจอเป็นแนวนอน (Pixel 7) ----------
console.log('\n🔄 หมุนจอแนวนอน (Pixel 7 landscape)');
{
  const { defaultBrowserType, ...opts } = devices['Pixel 7 landscape'];
  const ctx = await browser.newContext({ ...opts, locale: 'th-TH' });
  const page = await ctx.newPage();
  let bad = 0;
  for (const p of ['/', '/products', '/passport/A25', '/contact']) { const a = await audit(page, p); if (a.overflow > 1) { fail(`แนวนอนล้นจอ ${p} (+${a.overflow}px)`); bad++; } }
  await login(page);
  for (const p of ['/admin', '/admin/photos']) { const a = await audit(page, p); if (a.overflow > 1) { fail(`แนวนอนล้นจอ ${p} (+${a.overflow}px)`); bad++; } }
  const nav = await page.evaluate(() => { const n = document.querySelector('nav.fixed'); const b = n?.getBoundingClientRect(); return b ? { h: Math.round(b.height), vh: innerHeight } : null; });
  if (nav && nav.h > nav.vh * 0.25) fail(`แถบเมนูล่างกินจอแนวนอนเกินไป (${nav.h}px จาก ${nav.vh}px)`); else if (!bad) ok('แนวนอนไม่ล้นจอ และแถบเมนูล่างไม่บังเนื้อหาเกินไป');
  await ctx.close();
}

// ---------- ขั้นตอนจริงในสวน: เครือข่ายช้า + CPU ช้า + สัญญาณหลุด ----------
if (FLOWS) {
  console.log('\n🌴 ขั้นตอนในสวน: ถ่ายรูปเข้าคิวบนมือถือรุ่นกลาง ๆ + เน็ตช้า + สัญญาณหลุด (Pixel 7)');
  const { defaultBrowserType, ...opts } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...opts, locale: 'th-TH' });
  const page = await ctx.newPage();
  await login(page);

  // แตะเมนูล่างด้วยนิ้ว (touch) ไปหน้าเตรียมเปิด → คิวถ่ายรูป
  await tapAt(page, 'nav.fixed a[href="/admin/readiness"]');
  await page.waitForURL('**/admin/readiness');
  await tapAt(page, 'main a[href="/admin/photos"]');
  await page.waitForURL('**/admin/photos');
  ok('แตะเมนูล่าง → เตรียมเปิด → คิวถ่ายรูป ด้วยการสัมผัสได้');

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // ~ 3G ช้า: หน่วง 400ms, 400 kbps ทั้งขึ้นและลง · CPU ช้าลง 4 เท่า (เครื่องรุ่นกลาง-ล่าง)
  // เครือข่ายทั้งหมดตั้งผ่าน CDP ที่เดียว (ห้ามใช้ ctx.setOffline ร่วมด้วย เพราะสองทางทับกันและการตัดสัญญาณไม่มีผล)
  const slow = { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 };
  const net = (c) => cdp.send('Network.emulateNetworkConditions', c);
  await net(slow);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const [code, code2] = await page.$$eval('li[data-code]', (els) => els.slice(0, 2).map((e) => e.dataset.code));
  const left = async () => Number(await page.textContent('#left'));
  const before = await left();
  // รูปขนาดใหญ่แบบกล้องมือถือ (4032×3024) สร้างในหน้าแล้วเก็บเป็น Blob · ทุกครั้งที่ "เลือกรูป" สร้างชุดไฟล์ใหม่ (เหมือนผู้ใช้จริง)
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 4032; cv.height = 3024; const g = cv.getContext('2d');
    for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${Math.random() * 360} 70% 50%)`; g.fillRect(Math.random() * 4032, Math.random() * 3024, 70, 70); }
    window.__blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
  });
  const origBytes = await page.evaluate(() => window.__blob.size);
  const pick = (c) => page.locator(`li[data-code="${c}"] input[id^="pick-"]`).evaluate((el) => {
    const dt = new DataTransfer(); dt.items.add(new File([window.__blob], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const waitText = (c, text, ms) => page.locator(`li[data-code="${c}"] [data-state]`).filter({ hasText: text }).first().textContent({ timeout: ms }).catch(() => null);

  // 1) สัญญาณหลุดกลางทาง → ต้องมีข้อความภาษาไทยที่เข้าใจได้ (ไม่ใช่ "Failed to fetch") และรังยังอยู่ในคิว
  await net({ offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await pick(code);
  const errText = await waitText(code, 'ยังไม่ได้ถูกส่ง', 90000);
  errText ? ok(`สัญญาณหลุดระหว่างอัปโหลด → "${errText.trim()}"`) : fail('สัญญาณหลุดแล้วไม่มีข้อความผิดพลาดที่เข้าใจได้ให้ผู้ใช้เห็น');
  errText && /fetch|TypeError|Load failed/i.test(errText) ? fail('ข้อความผิดพลาดยังเป็นศัพท์เทคนิคภาษาอังกฤษ') : ok('ข้อความผิดพลาดเป็นภาษาไทย ไม่มีศัพท์เทคนิค');
  (await left()) === before ? ok('รังยังอยู่ในคิว (ไม่นับว่าสำเร็จทั้งที่ส่งไม่ถึง)') : fail('นับว่าสำเร็จทั้งที่สัญญาณหลุด');

  // 2) สัญญาณกลับมา (ยังช้า) → เลือกรูปใหม่ ส่งสำเร็จ
  await net(slow);
  const t0 = Date.now();
  await pick(code);
  const done = await waitText(code, '✅', 120000);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  done ? ok(`ลองใหม่สำเร็จบนเน็ตช้า + CPU ช้า 4 เท่า ภายใน ${secs} วินาที (รูปเดิม ${(origBytes / 1048576).toFixed(1)} MB) — "${done.trim()}"`) : fail('ลองใหม่ไม่สำเร็จภายใน 120 วินาที');
  (await left()) === before - 1 ? ok(`ตัวนับในคิวลดลงเป็น ${before - 1}`) : fail(`ตัวนับในคิวไม่ลดลง (${before} → ${await left()})`);
  await page.screenshot({ path: `${OUT}/photos-queue-after.png` });

  // 3) ล็อกอินหมดอายุกลางทาง (ล้างคุกกี้) → ต้องบอกให้ล็อกอินใหม่ ห้ามนับว่าสำเร็จ (เดิมจะเห็นหน้าล็อกอินตอบ 200 แล้วเข้าใจผิด)
  await net({ offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await ctx.clearCookies();
  await pick(code2);
  const sess = await waitText(code2, 'ล็อกอินใหม่', 90000);
  sess ? ok(`ล็อกอินหมดอายุระหว่างอัปโหลด → "${sess.trim()}"`) : fail('ล็อกอินหมดอายุแล้วแอปไม่บอก (อาจนับว่าสำเร็จทั้งที่ไม่ได้บันทึก)');
  (await left()) === before - 1 ? ok('ไม่นับว่ารังที่สองสำเร็จ (ตัวนับคงเดิม)') : fail('นับว่าสำเร็จทั้งที่ล็อกอินหมดอายุ');
  await ctx.close();
  console.log(`   ℹ️ ทดสอบกับรัง ${code} (เพิ่มรูปทดสอบ 1 รูป) — ล้างด้วย: npm run db:seed:local && npm run media:seed:local -- --prune`);
}
await browser.close();
console.log(failed ? `\n❌ พบปัญหา ${failed} จุด` : '\n✅ ผ่านทั้งหมด');
process.exit(failed ? 1 : 0);
