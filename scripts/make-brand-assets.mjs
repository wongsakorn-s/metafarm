// สร้างไฟล์โลโก้ขนาดเหมาะกับเว็บจาก design/logo/*.png (ต้นฉบับใหญ่ 0.7–1.2 MB) → public/brand/
//   bun run brand:build      (ใช้ Edge/Chrome ที่ติดตั้งในเครื่อง ไม่ต้องติดตั้งเครื่องมือเพิ่ม)
// ถ้าได้โลโก้ใหม่ (เช่น SVG) ให้แทนที่ไฟล์ใน design/logo/ แล้วรันซ้ำ
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

mkdirSync('public/brand', { recursive: true });
const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
const wide = dataUrl('design/logo/logo1.png'); // โลโก้แนวนอน
const round = dataUrl('design/logo/logo2.png'); // โลโก้วงกลมพื้นเหลือง

const browser = await chromium.launch({ channel: process.env.BROWSER ?? 'msedge', headless: true });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

/** วาดรูปลง canvas ขนาด w×h (contain) พื้นหลัง bg (ว่าง = โปร่งใส) แล้วส่งออกเป็นไฟล์ */
async function make(src, { w, h, type = 'image/webp', quality = 0.9, bg = null, pad = 0 }, out) {
  const b64 = await page.evaluate(
    async ({ src, w, h, type, quality, bg, pad }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const ratio = img.width / img.height;
      const outW = w ?? Math.round(h * ratio), outH = h ?? Math.round(w / ratio);
      const c = document.getElementById('c');
      c.width = outW; c.height = outH;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, outW, outH); }
      const s = Math.min((outW - pad * 2) / img.width, (outH - pad * 2) / img.height);
      const dw = img.width * s, dh = img.height * s;
      g.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
      const blob = await new Promise((r) => c.toBlob(r, type, quality));
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
    },
    { src, w, h, type, quality, bg, pad },
  );
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(out, buf);
  console.log(`${out.padEnd(34)} ${(buf.length / 1024).toFixed(1)} KB`);
}

await make(wide, { w: 280 }, 'public/brand/logo.webp'); // หัวเว็บแสดงกว้าง ~132px → 2 เท่าสำหรับจอคมชัด
await make(round, { w: 360 }, 'public/brand/logo-round.webp');
await make(round, { w: 144 }, 'public/brand/logo-round-sm.webp'); // ส่วนท้ายหน้า (แสดง 72px ที่ความละเอียด 2 เท่า)
await make(round, { w: 64, h: 64, type: 'image/png' }, 'public/favicon.png');
await make(round, { w: 180, h: 180, type: 'image/png', bg: '#fff8dc', pad: 14 }, 'public/apple-touch-icon.png');
await make(round, { w: 1200, h: 630, type: 'image/jpeg', quality: 0.85, bg: '#fff8dc', pad: 40 }, 'public/brand/og.jpg'); // รูปตอนแชร์ลิงก์ (JPEG เล็กกว่า PNG ~10 เท่า)

await browser.close();
