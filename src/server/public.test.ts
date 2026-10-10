// รังตัวอย่างในหน้าสมุดพก: รูปที่ถ่ายใหม่มาก่อนรูปเล็กจาก Excel · รังละรูปเดียว · ไม่เอารังที่ขาย/ล่มแล้ว
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPhotoHives } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status) VALUES (1, 'A1', 1, 'active'), (2, 'A2', 1, 'active'), (3, 'A3', 1, 'sold'), (4, 'A4', 1, 'active'), (5, 'A5', 1, 'active')`),
    t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key) VALUES
      (1, 'passport', 'hives/A1/A1-1.jpeg'),
      (2, 'passport', 'hives/A2/A2-1.jpeg'),
      (2, 'passport', 'hives/A2/passport-aaa-0.webp'),
      (2, 'passport', 'hives/A2/passport-bbb-0.webp'),
      (3, 'passport', 'hives/A3/passport-ccc-0.webp'),
      (4, 'sale', 'hives/A4/sale-ddd-0.webp'),
      (5, 'passport', 'hives/A5/passport-eee-0.webp')`),
  ]);
}, 60_000);
afterAll(() => t?.close());

describe('getPhotoHives', () => {
  it('รูปถ่ายใหม่ (ใหม่สุดก่อน) มาก่อนรูป Excel · รังละ 1 รูป · เฉพาะรังที่ยังอยู่และรูปสมุดพก', async () => {
    expect(await getPhotoHives(t.db)).toEqual([
      { code: 'A5', key: 'hives/A5/passport-eee-0.webp' },
      { code: 'A2', key: 'hives/A2/passport-bbb-0.webp' },
      { code: 'A1', key: 'hives/A1/A1-1.jpeg' },
    ]);
  });
  it('จำกัดจำนวนรัง', async () => {
    expect((await getPhotoHives(t.db, 1)).map((h) => h.code)).toEqual(['A5']);
  });
});
