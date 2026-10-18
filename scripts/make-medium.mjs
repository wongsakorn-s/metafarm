// สร้างรูปขนาดกลาง (800px) ให้รูปเก่าที่อัปโหลดก่อนมีรูปกลาง: อ่านรูปเต็มจาก R2 → ย่อด้วย sharp → เก็บที่ med/<คีย์>
//   bun run media:medium                       ดูว่ามีกี่รูปที่ยังไม่มีรูปกลาง (dry-run, R2 + ฐานข้อมูลในเครื่อง ไม่เขียนอะไร)
//   bun run media:medium -- --yes              สร้างจริงในเครื่อง
//   bun run media:medium -- --remote           ดูรายการบนระบบจริง (ยังไม่เขียน)
//   bun run media:medium -- --remote --yes     สร้างจริงบนระบบจริง (ผู้ดูแลรันเอง)
//   ตัวเลือก: --limit N (ไม่เกิน N รูปต่อรอบ)  --concurrency 4
// รันซ้ำได้: รูปที่มีรูปกลางแล้วหรือเล็กกว่า 800px อยู่แล้วจะถูกข้าม · ไม่แตะรูปเต็ม/รูปย่อ · หน้าเว็บใช้รูปเต็มแทนจนกว่าจะมีรูปกลาง
// ค่าต้องตรงกับ MEDIUM_EDGE / MAX_MEDIUM_BYTES ใน src/lib/media.ts
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import sharp from 'sharp';

const MEDIUM_EDGE = 800;
const MAX_MEDIUM_BYTES = 400 * 1024;
const BUCKET = 'metafarm-media';
const { values } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
  },
});
const where = values.remote ? '--remote' : '--local';
const limit = values.limit ? Number(values.limit) : Infinity;

const wranglerJs = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerSync = (...args) => execFileSync(process.execPath, [wranglerJs, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const wrangler = (...args) => promisify(execFile)(process.execPath, [wranglerJs, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const tmp = mkdtempSync(join(tmpdir(), 'mf-medium-'));
let exitCode = 0;
try {
  // รายชื่อรูป (ชุดเดียวกับ backup-media.mjs) เฉพาะไฟล์รูป ไม่รวมวิดีโอ
  const out = wranglerSync('d1', 'execute', 'metafarm-db', where, '--json', '--command',
    "SELECT r2_key AS k FROM hive_media WHERE r2_key IS NOT NULL UNION SELECT image_key FROM products WHERE image_key IS NOT NULL UNION SELECT r2_key FROM gallery_photos UNION SELECT r2_key FROM product_photos");
  const keys = JSON.parse(out)[0].results.map((r) => r.k).filter((k) => typeof k === 'string' && !k.includes('..') && /\.(jpe?g|png|webp)$/i.test(k));
  console.log(`${keys.length} รูปในฐานข้อมูล (${values.remote ? 'ระบบจริง' : 'ในเครื่อง'})`);

  const stat = { made: 0, had: 0, small: 0, missing: 0, failed: 0, todo: 0 };
  const queue = keys.slice();
  let n = 0;
  async function worker(id) {
    while (queue.length && n < limit) {
      const key = queue.shift();
      const medKey = `med/${key}`;
      const f = (name) => join(tmp, `${id}-${name}`);
      try {
        try { await wrangler('r2', 'object', 'get', `${BUCKET}/${medKey}`, '--file', f('probe'), where); stat.had++; continue; } catch { /* ยังไม่มี */ }
        if (!values.yes) { stat.todo++; continue; }
        n++;
        try { await wrangler('r2', 'object', 'get', `${BUCKET}/${key}`, '--file', f('src'), where); } catch { stat.missing++; console.error(`ไม่พบรูปเต็มใน R2: ${key}`); continue; }
        const bytes = readFileSync(f('src'));
        const meta = await sharp(bytes, { failOn: 'none' }).metadata();
        const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (longEdge <= MEDIUM_EDGE) { stat.small++; continue; }
        const resized = sharp(bytes, { failOn: 'none' }).rotate().resize({ width: MEDIUM_EDGE, height: MEDIUM_EDGE, fit: 'inside', withoutEnlargement: true }); // .rotate() หมุนตาม EXIF และผลลัพธ์ไม่มีข้อมูลกล้อง/GPS
        let buf = await resized.clone().webp({ quality: 78 }).toBuffer();
        if (buf.length > MAX_MEDIUM_BYTES) buf = await resized.clone().webp({ quality: 60 }).toBuffer();
        if (buf.length > MAX_MEDIUM_BYTES) { stat.failed++; console.error(`ใหญ่เกิน ${MAX_MEDIUM_BYTES / 1024} KB แม้ลดคุณภาพ: ${key} (${Math.round(buf.length / 1024)} KB)`); continue; }
        writeFileSync(f('out'), buf);
        await wrangler('r2', 'object', 'put', `${BUCKET}/${medKey}`, '--file', f('out'), '--content-type', 'image/webp', where);
        stat.made++;
      } catch (e) {
        stat.failed++;
        console.error(`ล้มเหลว ${key}: ${String(e.stderr ?? e.message).split('\n')[0]}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, (_, i) => worker(i)));

  if (!values.yes) console.log(`ยังไม่มีรูปกลาง ${stat.todo} รูป · มีแล้ว ${stat.had} รูป — (dry-run) ยังไม่ได้เขียนอะไร ใส่ --yes เพื่อสร้างจริง`);
  else console.log(`เสร็จ: สร้าง ${stat.made} · มีอยู่แล้ว ${stat.had} · เล็กกว่า ${MEDIUM_EDGE}px จึงข้าม ${stat.small} · ไม่พบรูปเต็ม ${stat.missing} · ล้มเหลว ${stat.failed}`);
  if (stat.failed || stat.missing) exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
