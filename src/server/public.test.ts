// รังตัวอย่างในหน้าสมุดพก: สุ่มเฉพาะรังที่รูปและข้อมูลครบ · รังละรูปเดียว (รูปถ่ายใหม่ก่อนรูปเล็กจาก Excel)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPublicHive, getSaleHive, getSampleHives } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  const full = `'purchased', '2025-01-10', '2025-03-01'`; // origin, acquired_on, queen_born_on
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, origin, acquired_on, queen_born_on, notes) VALUES
      (1, 'A1', 1, 'active', ${full}, NULL),
      (2, 'A2', 1, 'active', ${full}, 'หมายเหตุทั่วไป'),
      (3, 'A3', 1, 'sold', ${full}, NULL),
      (4, 'A4', 1, 'active', ${full}, NULL),
      (5, 'A5', 1, 'active', 'unknown', '2025-01-10', '2025-03-01', NULL),
      (6, 'A6', 1, 'active', 'purchased', '2025-01-10', NULL, NULL),
      (7, 'A7', 1, 'active', ${full}, '??? วันเกิดนางพญา')`),
    t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key) VALUES
      (1, 'passport', 'hives/A1/A1-1.jpeg'),
      (2, 'passport', 'hives/A2/A2-1.jpeg'),
      (2, 'passport', 'hives/A2/passport-aaa-0.webp'),
      (2, 'passport', 'hives/A2/passport-bbb-0.webp'),
      (3, 'passport', 'hives/A3/passport-ccc-0.webp'),
      (4, 'sale', 'hives/A4/sale-ddd-0.webp'),
      (5, 'passport', 'hives/A5/passport-eee-0.webp'),
      (6, 'passport', 'hives/A6/passport-fff-0.webp'),
      (7, 'passport', 'hives/A7/passport-ggg-0.webp')`),
  ]);
}, 60_000);
afterAll(() => t?.close());

describe('getSampleHives', () => {
  it('เฉพาะรังที่ยังอยู่ มีรูปสมุดพก รู้ที่มา/วันที่ได้รัง/วันเกิดนางพญา และไม่มี ??? · รังละ 1 รูป (รูปถ่ายใหม่สุดก่อน)', async () => {
    const got = await getSampleHives(t.db);
    expect([...got].sort((a, b) => a.code.localeCompare(b.code))).toEqual([
      { code: 'A1', key: 'hives/A1/A1-1.jpeg' },
      { code: 'A2', key: 'hives/A2/passport-bbb-0.webp' },
    ]);
  });
  it('สุ่มลำดับ และจำกัดจำนวน', async () => {
    expect(await getSampleHives(t.db, 1)).toHaveLength(1);
    const firsts = new Set<string>();
    for (let i = 0; i < 30; i++) firsts.add((await getSampleHives(t.db))[0]!.code);
    expect(firsts).toEqual(new Set(['A1', 'A2']));
  });
});

describe('จำนวนรูปสูงสุดบนหน้าสาธารณะ (เจ้าของขอ 2026-10-13)', () => {
  it('สมุดพก 6 รูป · หน้ารังที่ขาย = รูปขาย 3 + รูปสมุดพก 3', async () => {
    await t.d1.batch([
      t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (20, 'A20', 1, 'active', 1, 1600)`),
      ...Array.from({ length: 8 }, (_, i) => t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key, sort_order) VALUES (20, 'passport', ?, ?)`).bind(`hives/A20/passport-p${i}-0.webp`, i)),
      ...Array.from({ length: 4 }, (_, i) => t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key, sort_order) VALUES (20, 'sale', ?, ?)`).bind(`hives/A20/sale-s${i}-0.webp`, i)),
    ]);
    expect((await getPublicHive(t.db, 'A20'))!.photos).toHaveLength(6);
    const sale = (await getSaleHive(t.db, 'A20'))!;
    expect(sale.salePhotos).toHaveLength(3);
    expect(sale.passportPhotos).toHaveLength(3);
  });
});
