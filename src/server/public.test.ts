// รังตัวอย่างในหน้าสมุดพก: สุ่มเฉพาะรังที่รูปและข้อมูลครบ · รังละรูปเดียว (รูปถ่ายใหม่ก่อนรูปเล็กจาก Excel)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFarmStats, getPublicHive, getSaleHive, getSaleHives, getSampleHives, listHivesByCategory } from './public.ts';
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

describe('รูปบนหน้าสาธารณะ (เจ้าของขอ 2026-10-13/14)', () => {
  it('สมุดพก 6 รูป · หน้ารังที่ขาย = รูปสำหรับขายของรังนั้น (สูงสุด 6) · ไม่มีเลย = 3 รูปแรกของสมุดพก', async () => {
    await t.d1.batch([
      t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (20, 'A20', 1, 'active', 1, 1600)`),
      ...Array.from({ length: 8 }, (_, i) => t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key, sort_order) VALUES (20, 'passport', ?, ?)`).bind(`hives/A20/passport-p${i}-0.webp`, i)),
    ]);
    expect((await getPublicHive(t.db, 'A20'))!.photos).toHaveLength(6);
    const sale = (await getSaleHive(t.db, 'A20'))!;
    expect(sale.photos.map((p) => p.key)).toEqual(['hives/A20/passport-p0-0.webp', 'hives/A20/passport-p1-0.webp', 'hives/A20/passport-p2-0.webp']);
    expect(sale.coverKey).toBe('hives/A20/passport-p0-0.webp');
    // มีรูปสำหรับขาย 8 รูป (เกินเพดาน) → หน้าขายแสดง 6 รูปแรกตามลำดับ เฉพาะรูปสำหรับขาย · รูปปกการ์ดเป็นรูปแรกของชุดขาย
    await t.d1.batch(Array.from({ length: 8 }, (_, i) => t.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key, sort_order) VALUES (20, 'sale', ?, ?)`).bind(`hives/A20/sale-s${i}-0.webp`, i)));
    const withSale = (await getSaleHive(t.db, 'A20'))!;
    expect(withSale.photos).toHaveLength(6);
    expect(withSale.photos.every((p) => p.key.includes('/sale-'))).toBe(true);
    expect(withSale.coverKey).toBe('hives/A20/sale-s0-0.webp');
    expect((await getSaleHives(t.db)).find((h) => h.code === 'A20')!.coverKey).toBe('hives/A20/sale-s0-0.webp');
  });
});

describe('วันเกิดนางพญาบนสมุดพก (เจ้าของเปลี่ยนรังเพาะนางพญาเป็น "ขยายรังโดย MetaFarm" 2026-10-17)', () => {
  it('ขยายรัง/เพาะนางพญา → แสดง · ซื้อมา → ไม่แสดง (เหมือนเดิม)', async () => {
    await t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, origin, acquired_on, queen_born_on) VALUES
      (30, 'A30', 1, 'active', 'split', '2026-07-22', '2026-08-23'),
      (31, 'A31', 1, 'active', 'queen_bred', '2026-07-22', '2026-08-25'),
      (32, 'A32', 1, 'active', 'purchased', '2026-07-22', '2026-08-01')`).run();
    expect((await getPublicHive(t.db, 'A30'))!.queenBornOn).toBe('2026-08-23');
    expect((await getPublicHive(t.db, 'A31'))!.queenBornOn).toBe('2026-08-25');
    expect((await getPublicHive(t.db, 'A32'))!.queenBornOn).toBeNull();
  });
});

describe('ตัวเลขฟาร์มหน้าแรก (เจ้าของขอ 2026-10-18)', () => {
  it('รังในทะเบียน · ขยายรังโดย MetaFarm (ขยายรัง + เพาะนางพญา) · ขายแล้ว · รังปัจจุบันในสวน', async () => {
    const q = async (where: string) => (await t.d1.prepare(`SELECT count(*) n FROM hives WHERE ${where}`).first<{ n: number }>())!.n;
    const s = await getFarmStats(t.db);
    expect(s).toEqual({ total: await q('1'), bred: await q("origin IN ('split', 'queen_bred')"), sold: await q("status = 'sold'"), active: await q("status = 'active'") });
    expect(s.sold).toBeGreaterThan(0);
  });
});

describe('รังตามหมวด (แตะตัวเลขหน้าแรก — เจ้าของขอ 2026-10-20)', () => {
  it('all = ทุกรัง (เรียงตามรหัส) · bred/sold/active = เฉพาะที่ตรงเงื่อนไข · รูป = รูปสมุดพกแรกถ้ามี ไม่มีก็ null', async () => {
    const all = await listHivesByCategory(t.db, 'all');
    const total = (await t.d1.prepare('SELECT count(*) n FROM hives').first<{ n: number }>())!.n;
    expect(all).toHaveLength(total);
    expect(all.map((h) => h.code)).toEqual([...all.map((h) => h.code)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));

    const sold = await listHivesByCategory(t.db, 'sold');
    expect(sold.every((h) => h.status === 'sold')).toBe(true);
    expect(sold.map((h) => h.code)).toContain('A3');

    const bred = await listHivesByCategory(t.db, 'bred');
    expect(bred.map((h) => h.code).sort()).toEqual(['A30', 'A31']);

    const active = await listHivesByCategory(t.db, 'active');
    expect(active.every((h) => h.status === 'active')).toBe(true);

    const a1 = all.find((h) => h.code === 'A1')!;
    expect(a1.key).toBe('hives/A1/A1-1.jpeg'); // รังนี้มีรูปสมุดพกจาก fixture ด้านบน
    const noPhoto = all.find((h) => h.code === 'A4')!; // A4 มีแต่รูป "sale" ไม่มีรูป "passport" ในฐานข้อมูลทดสอบ
    expect(noPhoto.key).toBeNull();
  });
});

describe('กล่องรัง บนหน้าสาธารณะ (เจ้าของขอ 2026-10-20)', () => {
  it('ส่งค่าจริงออกไป (ไม่มีกำหนดไว้ = unknown ตามค่าเริ่มต้นของตาราง — หน้าเว็บเป็นคนซ่อนเอง)', async () => {
    await t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, origin, box_type) VALUES (40, 'A40', 1, 'active', 'purchased', 'teak_2room')`).run();
    expect((await getPublicHive(t.db, 'A40'))!.boxType).toBe('teak_2room');
    expect((await getPublicHive(t.db, 'A1'))!.boxType).toBe('unknown'); // A1 ไม่ได้ตั้งไว้ตอน insert → ค่าเริ่มต้นของตาราง

    await t.d1.prepare(`UPDATE hives SET for_sale = 1, sale_price = 900 WHERE code = 'A40'`).run();
    expect((await getSaleHive(t.db, 'A40'))!.boxType).toBe('teak_2room');
  });
});
