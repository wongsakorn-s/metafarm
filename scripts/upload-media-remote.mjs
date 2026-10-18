// อัปโหลดรูปจาก private/import/photos ขึ้น R2 "จริง" บน Cloudflare (ผ่าน wrangler CLI)
//   bun run media:upload:remote                 แสดงรายการที่จะอัปโหลด (dry-run) ยังไม่ส่งอะไรออกไป
//   bun run media:upload:remote -- --yes        อัปโหลดจริง (ต้อง `wrangler login` แล้ว และ bucket ถูกสร้างไว้)
//   ตัวเลือก: --bucket metafarm-media  --concurrency 4
// ⚠️ ส่งไฟล์ออกนอกเครื่อง จึงต้องใส่ --yes เสมอ · ยังไม่เคยทดสอบกับ Cloudflare จริง (ทดสอบเฉพาะ dry-run)
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { promisify } from 'node:util';

const run = promisify(execFile);
const { values } = parseArgs({
  options: {
    yes: { type: 'boolean', default: false },
    bucket: { type: 'string', default: 'metafarm-media' },
    dir: { type: 'string', default: 'private/import/photos' },
    // --tree: โฟลเดอร์ที่ได้จาก `bun run snapshot:export` (private/export/media) ใช้พาธเป็น key ตรง ๆ (hives/A1/…, products/…)
    tree: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
  },
});
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const jobs = [];
if (values.tree) {
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
      else if (TYPES[extname(e.name).toLowerCase()]) jobs.push({ key: `${prefix}${e.name}`, path: join(dir, e.name), type: TYPES[extname(e.name).toLowerCase()] });
    }
  };
  walk(values.tree, '');
} else {
  for (const file of readdirSync(values.dir)) {
    const type = TYPES[extname(file).toLowerCase()];
    const m = /^([A-Z]{1,3}\d+)-\d+\./.exec(file);
    if (type && m) jobs.push({ key: `hives/${m[1]}/${file}`, path: join(values.dir, file), type });
  }
}
console.log(`${jobs.length} ไฟล์ → bucket "${values.bucket}" (R2 จริง)`);
if (!values.yes) {
  jobs.slice(0, 5).forEach((j) => console.log(`  ${j.path}  →  ${values.bucket}/${j.key}  [${j.type}]`));
  console.log(`  … (dry-run) ยังไม่ได้อัปโหลดอะไร — ใส่ --yes เพื่อเริ่มจริง`);
  process.exit(0);
}

let done = 0, failed = 0, next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    try {
      await run('npx', ['wrangler', 'r2', 'object', 'put', `${values.bucket}/${j.key}`, '--file', j.path, '--content-type', j.type, '--remote'], { shell: process.platform === 'win32' });
      done++;
    } catch (e) {
      failed++;
      console.error(`ล้มเหลว ${j.key}: ${String(e.stderr ?? e.message).split('\n')[0]}`);
    }
    if ((done + failed) % 20 === 0) console.log(`  ${done + failed}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));
console.log(`เสร็จ: สำเร็จ ${done} · ล้มเหลว ${failed}`);
process.exit(failed ? 1 : 0);
