// นำรูปจาก private/import/photos เข้า R2 บนเครื่อง (local) ให้ตรงกับ hive_media.r2_key ที่ seed.sql สร้างไว้
//   npm run media:seed:local                ข้ามไฟล์ที่มีอยู่แล้ว
//   npm run media:seed:local -- --force     อัปโหลดทับ
//   npm run media:seed:local -- --prune     ลบรูปใน R2 บนเครื่องที่ไม่ได้มาจากโฟลเดอร์นี้ (เช่นรูปที่อัปโหลดทดสอบ)
// ใช้กับ R2 ในเครื่องเท่านั้น (getPlatformProxy ไม่แตะ Cloudflare จริง)
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { getPlatformProxy } from 'wrangler';

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false }, prune: { type: 'boolean', default: false }, dir: { type: 'string', default: 'private/import/photos' } },
});
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const { env, dispose } = await getPlatformProxy<{ MEDIA: R2Bucket }>();
let put = 0, skipped = 0, bad = 0, pruned = 0;
try {
  const wanted = new Set<string>();
  for (const file of readdirSync(values.dir)) {
    const type = TYPES[extname(file).toLowerCase()];
    const m = /^([A-Z]{1,3}\d+)-\d+\./.exec(file);
    if (!type || !m) { bad++; continue; }
    const key = `hives/${m[1]}/${file}`;
    wanted.add(key);
    if (!values.force && (await env.MEDIA.head(key))) { skipped++; continue; }
    await env.MEDIA.put(key, readFileSync(join(values.dir, file)), { httpMetadata: { contentType: type } });
    put++;
  }

  if (values.prune) {
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix: 'hives/', cursor });
      for (const o of page.objects) if (!wanted.has(o.key)) { await env.MEDIA.delete(o.key); pruned++; }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
} finally {
  await dispose();
}
console.log(`อัปโหลด ${put} ไฟล์ · ข้าม ${skipped} · ชื่อไม่ถูกรูปแบบ ${bad}${values.prune ? ` · ลบที่ไม่อยู่ในโฟลเดอร์ ${pruned}` : ''}`);
