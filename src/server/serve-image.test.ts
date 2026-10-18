// เสิร์ฟรูปขนาดต่าง ๆ: ?w=thumb / ?w=med ใช้ไฟล์ย่อถ้ามี ไม่มี (รูปเก่า) ใช้รูปเต็ม · ค่าอื่นใช้รูปเต็ม
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveImage } from './serve-image.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  const put = (k: string, body: string) => t.media.put(k, body, { httpMetadata: { contentType: 'image/webp' } });
  await put('hives/A1/p-1.webp', 'FULL');
  await put('thumb/hives/A1/p-1.webp', 'THUMB');
  await put('med/hives/A1/p-1.webp', 'MED');
  await put('hives/A2/p-1.webp', 'FULL-OLD'); // รูปเก่า: ไม่มีไฟล์ย่อ/กลาง
}, 60_000);
afterAll(() => t?.close());

const get = async (key: string, query = '') => serveImage(t.media, key, new Request(`http://x/img/${key}${query}`), 'public, max-age=60');

describe('serveImage', () => {
  it('?w=thumb → รูปย่อ · ?w=med → รูปกลาง · ไม่ระบุ/ค่าอื่น → รูปเต็ม', async () => {
    expect(await (await get('hives/A1/p-1.webp', '?w=thumb')).text()).toBe('THUMB');
    expect(await (await get('hives/A1/p-1.webp', '?w=med')).text()).toBe('MED');
    expect(await (await get('hives/A1/p-1.webp')).text()).toBe('FULL');
    expect(await (await get('hives/A1/p-1.webp', '?w=huge')).text()).toBe('FULL');
  });

  it('รูปเก่าที่ไม่มีไฟล์ย่อ/กลาง → ส่งรูปเต็ม · ไม่มีรูปเลย → 404 · คีย์อันตราย → 404', async () => {
    expect(await (await get('hives/A2/p-1.webp', '?w=med')).text()).toBe('FULL-OLD');
    expect(await (await get('hives/A2/p-1.webp', '?w=thumb')).text()).toBe('FULL-OLD');
    expect((await get('hives/A9/none.webp', '?w=med')).status).toBe(404);
    expect((await get('hives/../x.webp')).status).toBe(404);
  });

  it('ETag ตรงกันได้ 304', async () => {
    const first = await get('hives/A1/p-1.webp', '?w=med');
    const etag = first.headers.get('etag')!;
    const r = await serveImage(t.media, 'hives/A1/p-1.webp', new Request('http://x/img/a?w=med', { headers: { 'if-none-match': etag } }), 'public');
    expect(r.status).toBe(304);
  });
});
