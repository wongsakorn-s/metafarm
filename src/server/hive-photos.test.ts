// รูปรังชุดเดียว: เรียงลำดับ · ติ๊กแสดงในหน้าขาย · migration 0018 (ลบรูปขายเดิม)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getHiveDetail } from './hives.ts';
import { listMedia, moveHiveMedia, reorderHiveMedia, setPhotoForSale, uploadImages } from './media.ts';
import { getSaleHive, isPublicMediaKey } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (1, 'A1', 1, 'active', 1, 1600), (2, 'A2', 1, 'active', 0, NULL)`),
  ]);
}, 60_000);
afterAll(() => t?.close());

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 5, 1, 2, 3, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x55, 0xff, 0xd9]);
const photo = (n = 'a.jpg') => new File([jpeg], n, { type: 'image/jpeg' });
const hive = async (code: string) => (await getHiveDetail(t.db, code))!.hive;
const order = async (code: string) => (await listMedia(t.db, (await hive(code)).id)).filter((m) => m.kind === 'passport').map((m) => m.id);

describe('รูปรังชุดเดียว', () => {
  it('อัปโหลด 6 รูป · เกินแล้วข้าม', async () => {
    const r = await uploadImages(t.db, t.media, t.owner, await hive('A1'), 'passport', Array.from({ length: 7 }, () => photo()));
    expect(r.added).toBe(6);
    expect(r.skipped).toHaveLength(1);
  });

  it('เรียงลำดับ: ลากเปลี่ยนที่ · ไม่เปลี่ยน = ไม่เขียน · id ของรังอื่นถูกข้าม · เลื่อนทีละตำแหน่ง', async () => {
    const h = await hive('A1');
    const ids = await order('A1');
    expect(await reorderHiveMedia(t.db, t.owner, h, [ids[5]!, ids[0]!])).toEqual({ ok: true });
    expect(await order('A1')).toEqual([ids[5], ids[0], ids[1], ids[2], ids[3], ids[4]]); // ที่ไม่อยู่ในรายการต่อท้าย
    await uploadImages(t.db, t.media, t.owner, await hive('A2'), 'passport', [photo()]);
    const foreign = (await order('A2'))[0]!;
    expect(await reorderHiveMedia(t.db, t.owner, h, [foreign])).toMatchObject({ ok: false });
    await moveHiveMedia(t.db, t.owner, h, ids[4]!, 'top');
    expect((await order('A1'))[0]).toBe(ids[4]);
    await moveHiveMedia(t.db, t.owner, h, ids[4]!, 'down');
    expect((await order('A1'))[1]).toBe(ids[4]);
    expect(await moveHiveMedia(t.db, t.owner, h, foreign, 'up')).toMatchObject({ ok: false });
  });

  it('ติ๊กแสดงในหน้าขาย → หน้าขายแสดงตามลำดับที่เรียงไว้ · ทุกรูปเปิดสาธารณะเหมือนรูปสมุดพก', async () => {
    const h = await hive('A1');
    const ids = await order('A1');
    expect((await getSaleHive(t.db, 'A1'))!.photos).toHaveLength(3); // ยังไม่ติ๊ก = 3 รูปแรก
    await setPhotoForSale(t.db, t.owner, h, ids[5]!, true);
    await setPhotoForSale(t.db, t.owner, h, ids[1]!, true);
    await setPhotoForSale(t.db, t.owner, h, ids[1]!, true); // ซ้ำ = ไม่เขียน
    const keys = (await listMedia(t.db, h.id)).filter((m) => m.kind === 'passport').map((m) => m.r2Key);
    const sale = (await getSaleHive(t.db, 'A1'))!;
    expect(sale.photos.map((p) => p.key)).toEqual([keys[1], keys[5]]);
    expect(sale.coverKey).toBe(keys[1]);
    await setPhotoForSale(t.db, t.owner, h, ids[1]!, false);
    expect((await getSaleHive(t.db, 'A1'))!.photos.map((p) => p.key)).toEqual([keys[5]]);
    expect(await isPublicMediaKey(t.db, keys[3]!)).toBe(true); // ไม่ได้ติ๊กก็ยังอยู่ในสมุดพก
    expect(await setPhotoForSale(t.db, t.owner, h, (await order('A2'))[0]!, true)).toMatchObject({ ok: false }); // รูปของรังอื่น
  });
});

describe('migration 0018', () => {
  it('ลบแถวรูปขายเดิม · รูปสมุดพก/วิดีโอคงอยู่ · รูปสมุดพกเดิมไม่ถูกติ๊ก', async () => {
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
