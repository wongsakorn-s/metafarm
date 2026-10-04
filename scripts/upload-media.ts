// นำรูปจาก private/import/photos เข้า R2 บนเครื่อง (local) ให้ตรงกับ hive_media.r2_key ที่ seed.sql สร้างไว้
//   npm run media:seed:local            ข้ามไฟล์ที่มีอยู่แล้ว
//   npm run media:seed:local -- --force อัปโหลดทับ
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { getPlatformProxy } from 'wrangler';

const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, dir: { type: 'string', default: 'private/import/photos' } } });
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const { env, dispose } = await getPlatformProxy<{ MEDIA: R2Bucket }>();
let put = 0, skipped = 0, bad = 0;
try {
  for (const file of readdirSync(values.dir)) {
    const type = TYPES[extname(file).toLowerCase()];
    const m = /^(A\d+)-\d+\./.exec(file);
    if (!type || !m) { bad++; continue; }
    const key = `hives/${m[1]}/${file}`;
    if (!values.force && (await env.MEDIA.head(key))) { skipped++; continue; }
    await env.MEDIA.put(key, readFileSync(join(values.dir, file)), { httpMetadata: { contentType: type } });
    put++;
  }
} finally {
  await dispose();
}
console.log(`อัปโหลด ${put} ไฟล์ · ข้าม ${skipped} · ไฟล์ที่ชื่อไม่ถูกรูปแบบ ${bad}`);
