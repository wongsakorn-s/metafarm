// สำรองรูปจาก R2 "metafarm-media" ไป "metafarm-backups/media/" แบบเพิ่มเฉพาะรูปใหม่
//   node scripts/backup-media.mjs            ระบบจริง (ใช้ใน GitHub Actions — ต้องมี CLOUDFLARE_API_TOKEN/ACCOUNT_ID)
//   node scripts/backup-media.mjs --local    ทดสอบกับข้อมูลในเครื่อง (.wrangler/state)
//   ตัวเลือก: --limit N (สำรองไม่เกิน N รูปต่อรอบ)
//
// วิธีทำงาน: wrangler ไม่มีคำสั่ง list ของ R2 จึงเอารายชื่อรูปจากฐานข้อมูล (hive_media.r2_key + products.image_key + gallery_photos.r2_key)
// คีย์รูปมี UUID ในชื่อและเนื้อไฟล์ไม่เปลี่ยน → จดรายชื่อที่สำรองแล้วไว้ใน media/_manifest.txt แล้วคัดลอกเฉพาะรูปใหม่
// รูปที่ถูกลบในแอปยังอยู่ในที่สำรอง (กู้คืนได้) · รูปย่อ (thumb/) ไม่สำรอง เพราะไม่จำเป็นต่อการกู้
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { local: { type: 'boolean', default: false }, limit: { type: 'string' } } });
const where = values.local ? '--local' : '--remote';
const limit = values.limit ? Number(values.limit) : Infinity;
const SRC = 'metafarm-media';
const DST = 'metafarm-backups';
const MANIFEST = `${DST}/media/_manifest.txt`;

const wranglerJs = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const wrangler = (...args) => execFileSync(process.execPath, [wranglerJs, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

const tmp = mkdtempSync(join(tmpdir(), 'mf-media-'));
let exitCode = 0;
try {
  // 1) รายชื่อรูปทั้งหมดที่ฐานข้อมูลอ้างถึง
  const out = wrangler('d1', 'execute', 'metafarm-db', where, '--json', '--command',
    "SELECT r2_key AS k FROM hive_media WHERE r2_key IS NOT NULL UNION SELECT image_key FROM products WHERE image_key IS NOT NULL UNION SELECT r2_key FROM gallery_photos UNION SELECT value FROM settings WHERE key = 'home.videoKey' AND value != ''");
  const keys = JSON.parse(out)[0].results.map((r) => r.k).filter((k) => typeof k === 'string' && !k.includes('..'));

  // 2) รายชื่อที่สำรองแล้ว (ครั้งแรกยังไม่มี)
  const manifestFile = join(tmp, 'manifest.txt');
  let done = new Set();
  try {
    wrangler('r2', 'object', 'get', MANIFEST, '--file', manifestFile, where);
    done = new Set(readFileSync(manifestFile, 'utf8').split('\n').filter(Boolean));
  } catch { /* ยังไม่เคยสำรอง */ }

  const todo = keys.filter((k) => !done.has(k)).slice(0, limit);
  console.log(`รูปในฐานข้อมูล ${keys.length} · สำรองแล้ว ${done.size} · รอบนี้ ${todo.length}`);

  const saveManifest = () => {
    writeFileSync(manifestFile, [...done].sort().join('\n') + '\n');
    wrangler('r2', 'object', 'put', MANIFEST, '--file', manifestFile, '--content-type', 'text/plain', where);
  };

  // 3) คัดลอกทีละรูป — บันทึกรายชื่อทุก 25 รูป (ถ้างานถูกตัดกลางทาง รอบหน้าทำต่อจากที่ค้าง)
  let failed = 0;
  for (const [i, key] of todo.entries()) {
    const file = join(tmp, 'obj');
    try {
      wrangler('r2', 'object', 'get', `${SRC}/${key}`, '--file', file, where);
      wrangler('r2', 'object', 'put', `${DST}/media/${key}`, '--file', file, where);
      done.add(key);
    } catch (e) {
      failed++;
      console.error(`ล้มเหลว ${key}: ${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? ''}`);
    } finally {
      if (existsSync(file)) rmSync(file);
    }
    if ((i + 1) % 25 === 0) { saveManifest(); console.log(`  ${i + 1}/${todo.length}`); }
  }
  if (todo.length) saveManifest();
  console.log(`เสร็จ: สำรองใหม่ ${todo.length - failed} รูป · ล้มเหลว ${failed} · รวมที่สำรองแล้ว ${done.size}/${keys.length}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice::สำรองรูป: ใหม่ ${todo.length - failed} · รวม ${done.size}/${keys.length}${failed ? ` · ล้มเหลว ${failed}` : ''}`);
  exitCode = failed ? 1 : 0;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
