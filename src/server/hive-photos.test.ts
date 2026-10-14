// รูปสมุดพก / รูปสำหรับขาย: อัปโหลดแยกชุด · เรียงลำดับแยกกัน · หน้าขายใช้รูปสำหรับขาย (ไม่มี = 3 รูปแรกของสมุดพก) · สิทธิ์เปิดรูป · migration 0018
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getHiveDetail } from './hives.ts';
import { listMedia, moveHiveMedia, reorderHiveMedia, uploadImages } from './media.ts';
import { getSaleHive, getSaleHives, isPublicMediaKey } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (1, 'A1', 1, 'active', 1, 1600), (2, 'A2', 1, 'active', 0, NULL), (3, 'A3', 1, 'sold', 0, NULL)`),
  ]);
}, 60_000);
afterAll(() => t?.close());

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 5, 1, 2, 3, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x55, 0xff, 0xd9]);
const photo = (n = 'a.jpg') => new File([jpeg], n, { type: 'image/jpeg' });
const hive = async (code: string) => (await getHiveDetail(t.db, code))!.hive;
const idsOf = async (code: string, kind: 'passport' | 'sale') => (await listMedia(t.db, (await hive(code)).id)).filter((m) => m.kind === kind).map((m) => m.id);
const keysOf = async (code: string, kind: 'passport' | 'sale') => (await listMedia(t.db, (await hive(code)).id)).filter((m) => m.kind === kind).map((m) => m.r2Key!);

describe('อัปโหลดแยกชุด', () => {
  it('รูปสมุดพก 6 รูป · รูปสำหรับขาย 6 รูป · เกินแล้วข้าม · ชุดเดียวกันไม่กินที่อีกชุด', async () => {
    const h = await hive('A1');
    const p = await uploadImages(t.db, t.media, t.owner, h, 'passport', Array.from({ length: 7 }, () => photo()));
    expect(p.added).toBe(6);
    expect(p.skipped).toHaveLength(1);
    const s = await uploadImages(t.db, t.media, t.owner, h, 'sale', Array.from({ length: 6 }, () => photo()));
    expect(s.added).toBe(6);
    expect((await uploadImages(t.db, t.media, t.owner, h, 'sale', [photo()])).added).toBe(0);
    expect(await keysOf('A1', 'sale')).toSatisfy((ks: string[]) => ks.every((k) => k.includes('/sale-')));
    expect(await keysOf('A1', 'passport')).toSatisfy((ks: string[]) => ks.every((k) => k.includes('/passport-')));
  });
});

describe('เรียงลำดับแยกกัน', () => {
  it('เรียงรูปสำหรับขายใหม่ → สมุดพกไม่เปลี่ยน · ไม่เปลี่ยน = ไม่เขียน · id ของอีกชุด/รังอื่นถูกข้าม', async () => {
    const h = await hive('A1');
    const sale = await idsOf('A1', 'sale');
    const passport = await idsOf('A1', 'passport');
    expect(await reorderHiveMedia(t.db, t.owner, h, 'sale', [sale[5]!, sale[0]!])).toEqual({ ok: true });
    expect(await idsOf('A1', 'sale')).toEqual([sale[5], sale[0], sale[1], sale[2], sale[3], sale[4]]);
    expect(await idsOf('A1', 'passport')).toEqual(passport); // สมุดพกไม่ขยับ
    // id ของสมุดพกส่งมาในชุดขาย = ถูกข้าม (ไม่มี id ที่ใช้ได้ = ผิดพลาด)
    expect(await reorderHiveMedia(t.db, t.owner, h, 'sale', [passport[0]!])).toMatchObject({ ok: false });
    await uploadImages(t.db, t.media, t.owner, await hive('A2'), 'sale', [photo()]);
    expect(await reorderHiveMedia(t.db, t.owner, h, 'sale', [(await idsOf('A2', 'sale'))[0]!])).toMatchObject({ ok: false });
  });

  it('เลื่อนทีละตำแหน่ง/ไปบนสุด ทำงานในชุดของรูปนั้น', async () => {
    const h = await hive('A1');
    const sale = await idsOf('A1', 'sale');
    const passport = await idsOf('A1', 'passport');
    await moveHiveMedia(t.db, t.owner, h, sale[4]!, 'top');
    expect((await idsOf('A1', 'sale'))[0]).toBe(sale[4]);
    await moveHiveMedia(t.db, t.owner, h, passport[3]!, 'up');
    expect((await idsOf('A1', 'passport'))[2]).toBe(passport[3]);
    expect(await moveHiveMedia(t.db, t.owner, h, (await idsOf('A2', 'sale'))[0]!, 'up')).toMatchObject({ ok: false });
  });
});

describe('หน้าสาธารณะ', () => {
  it('หน้าขาย = รูปสำหรับขายตามลำดับที่เรียง (ไม่รวมรูปสมุดพก) · รูปปกการ์ด = รูปแรกของชุดขาย', async () => {
    const sale = await keysOf('A1', 'sale');
    const got = (await getSaleHive(t.db, 'A1'))!;
    expect(got.photos.map((p) => p.key)).toEqual(sale);
    expect(got.coverKey).toBe(sale[0]);
    expect((await getSaleHives(t.db)).find((x) => x.code === 'A1')!.coverKey).toBe(sale[0]);
  });

  it('ยังไม่มีรูปสำหรับขายเลย → ใช้ 3 รูปแรกของสมุดพก', async () => {
    await t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (4, 'A4', 1, 'active', 1, 1500)`).run();
    await uploadImages(t.db, t.media, t.owner, await hive('A4'), 'passport', Array.from({ length: 5 }, () => photo()));
    const passport = await keysOf('A4', 'passport');
    const got = (await getSaleHive(t.db, 'A4'))!;
    expect(got.photos.map((p) => p.key)).toEqual(passport.slice(0, 3));
    expect(got.coverKey).toBe(passport[0]);
  });

  it('รูปสมุดพกเปิดสาธารณะเสมอ · รูปสำหรับขายเปิดเฉพาะรังที่ตั้งขายและยังอยู่', async () => {
    const saleKey = (await keysOf('A1', 'sale'))[0]!;
    expect(await isPublicMediaKey(t.db, (await keysOf('A1', 'passport'))[0]!)).toBe(true);
    expect(await isPublicMediaKey(t.db, saleKey)).toBe(true);
    await t.d1.prepare(`UPDATE hives SET for_sale = 0 WHERE code = 'A1'`).run();
    expect(await isPublicMediaKey(t.db, saleKey)).toBe(false); // เลิกตั้งขาย = รูปขายหายจากเว็บ
    await t.d1.prepare(`UPDATE hives SET for_sale = 1, status = 'sold' WHERE code = 'A1'`).run();
    expect(await isPublicMediaKey(t.db, saleKey)).toBe(false);
  });
});

describe('migration 0018', () => {
  it('ลบแถวรูปขายเดิม · รูปสมุดพก/วิดีโอคงอยู่ (ทำไปแล้วบนระบบจริง — คอลัมน์ show_in_sale ยังอยู่แต่ไม่ได้ใช้)', async () => {
    const old = await testDb({ until: '0018' });
    try {
      await old.d1.batch([
        old.d1.prepare(`INSERT INTO hives (id, code, species_id) VALUES (1, 'A1', 1)`),
        old.d1.prepare(`INSERT INTO hive_media (hive_id, kind, r2_key, youtube_id) VALUES (1, 'passport', 'hives/A1/passport-a.webp', NULL), (1, 'sale', 'hives/A1/sale-a.webp', NULL), (1, 'sale', 'hives/A1/sale-b.webp', NULL), (1, 'video', NULL, 'dQw4w9WgXcQ')`),
      ]);
      await old.migrate();
      const rows = (await old.d1.prepare(`SELECT kind, show_in_sale s FROM hive_media ORDER BY id`).all()).results;
      expect(rows).toEqual([{ kind: 'passport', s: 0 }, { kind: 'video', s: 0 }]);
    } finally {
      await old.close();
    }
  });
});
