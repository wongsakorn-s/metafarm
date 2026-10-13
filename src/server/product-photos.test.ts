// รูปสินค้าหลายรูป: อัปโหลด/เพดานต่อสินค้า · รูปปก (image_key) ซิงก์กับรูปแรก · เรียงลำดับ · ลบ · สาธารณะเฉพาะสินค้าที่แสดง · migration 0017
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productPhotoLimit } from '../lib/product-photos.ts';
import { deleteProductPhoto, listProductPhotos, moveProductPhoto, reorderProductPhotos, uploadProductPhotos } from './product-photos.ts';
import { getPublicProducts, isPublicMediaKey } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO products (id, slug, name, category, published) VALUES (1, 'hive-box', 'รัง MetaFarm (รังเปล่า)', 'hive_box', 1), (2, 'honey', 'น้ำผึ้ง', 'honey', 1), (3, 'hidden', 'ซ่อน', 'honey', 0)`),
    t.d1.prepare(`INSERT INTO product_variants (product_id, label, price_thb, price_confirmed) VALUES (1, 'รังเปล่า 1 รัง', 750, 1), (2, 'ขวด', 300, 1)`),
  ]);
}, 60_000);
afterAll(() => t?.close());

const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const jpeg = new Uint8Array([0xff, 0xd8, ...seg(0xe1, [...txt('Exif\0\0II'), 1, 2, 3, ...txt('GPS')]), ...seg(0xdb, [0, ...Array<number>(64).fill(3)]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x55, 0xff, 0xd9]);
const photo = (n = 'a.jpg') => new File([jpeg], n, { type: 'image/jpeg' });
const covers = async () => Object.fromEntries((await t.d1.prepare(`SELECT id, image_key k FROM products`).all<{ id: number; k: string | null }>()).results.map((r) => [r.id, r.k]));

describe('รูปสินค้า', () => {
  it('เพดาน: รังเปล่า 6 รูป · น้ำผึ้ง 3 รูป · เกินแล้วข้ามพร้อมเหตุผล', async () => {
    expect(productPhotoLimit('hive_box')).toBe(6);
    expect(productPhotoLimit('honey')).toBe(3);
    const r = await uploadProductPhotos(t.db, t.media, t.owner, 2, [photo(), photo(), photo(), photo('d.jpg')]);
    expect(r.added).toBe(3);
    expect(r.skipped).toEqual([{ name: 'd.jpg', reason: expect.stringContaining('ไม่เกิน 3 รูป') }]);
    const r2 = await uploadProductPhotos(t.db, t.media, t.owner, 1, Array.from({ length: 6 }, () => photo()));
    expect(r2.added).toBe(6);
    expect((await uploadProductPhotos(t.db, t.media, t.owner, 1, [photo()])).added).toBe(0);
  });

  it('ลบ GPS ในไฟล์ที่เก็บ · รูปปกซิงก์กับรูปแรก · สาธารณะ', async () => {
    const all = (await listProductPhotos(t.db)).filter((x) => x.productId === 2);
    const first = all[0]!;
    const stored = new Uint8Array(await (await t.media.get(first.r2Key))!.arrayBuffer());
    expect(Buffer.from(stored).includes('GPS', 0, 'latin1')).toBe(false);
    expect((await covers())[2]).toBe(first.r2Key); 
    const pub = (await getPublicProducts(t.db, 'honey'))[0]!;
    expect(pub.photos.map((p) => p.key)).toEqual(all.map((x) => x.r2Key));
    expect(pub.imageKey).toBe(pub.photos[0]!.key);
    expect(await isPublicMediaKey(t.db, all[2]!.r2Key)).toBe(true); // รูปที่ไม่ใช่รูปปกก็เปิดได้ (สินค้าแสดงอยู่)
  });

  it('เรียงลำดับ: ลากเปลี่ยนรูปแรก → รูปปกเปลี่ยนตาม · ไม่เปลี่ยน = ไม่เขียน · เลื่อนทีละตำแหน่ง', async () => {
    const ids = (await listProductPhotos(t.db)).filter((x) => x.productId === 2).map((x) => x.id);
    expect(await reorderProductPhotos(t.db, t.owner, 2, [ids[2]!, ids[0]!, ids[1]!])).toEqual({ ok: true });
    const after = (await listProductPhotos(t.db)).filter((x) => x.productId === 2);
    expect(after.map((x) => x.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect((await covers())[2]).toBe(after[0]!.r2Key);
    expect(await reorderProductPhotos(t.db, t.owner, 2, [999])).toMatchObject({ ok: false });
    expect(await reorderProductPhotos(t.db, t.owner, 2, [ids[2]!, ids[0]!, ids[1]!])).toEqual({ ok: true });
    await moveProductPhoto(t.db, t.owner, ids[1]!, 'top');
    expect((await listProductPhotos(t.db)).filter((x) => x.productId === 2)[0]!.id).toBe(ids[1]);
    // รูปของสินค้าอื่นปนมาใน ids ถูกข้าม
    const other = (await listProductPhotos(t.db)).find((x) => x.productId === 1)!.id;
    await reorderProductPhotos(t.db, t.owner, 2, [other, ids[0]!]);
    expect((await listProductPhotos(t.db)).find((x) => x.id === other)!.productId).toBe(1);
  });

  it('ลบรูป → ไฟล์ใน R2 หาย · รูปปกกลับไปเป็นรูปถัดไป · ลบหมด = ไม่มีรูปปก', async () => {
    const rows = (await listProductPhotos(t.db)).filter((x) => x.productId === 2);
    await deleteProductPhoto(t.db, t.media, t.owner, rows[0]!.id);
    expect(await t.media.head(rows[0]!.r2Key)).toBeNull();
    expect((await covers())[2]).toBe(rows[1]!.r2Key);
    for (const r of rows.slice(1)) await deleteProductPhoto(t.db, t.media, t.owner, r.id);
    expect((await covers())[2]).toBeNull();
    expect(await deleteProductPhoto(t.db, t.media, t.owner, rows[0]!.id)).toEqual({ ok: true }); // กดซ้ำ
  });

  it('สินค้าที่ซ่อน → รูปไม่เปิดสาธารณะ · ส่งชุดเดิมซ้ำไม่บันทึกซ้ำ', async () => {
    await uploadProductPhotos(t.db, t.media, t.owner, 3, [photo()]);
    const key = (await listProductPhotos(t.db)).find((x) => x.productId === 3)!.r2Key;
    expect(await isPublicMediaKey(t.db, key)).toBe(false);
    const batch = crypto.randomUUID();
    const rs = await Promise.all([1, 2].map(() => uploadProductPhotos(t.db, t.media, t.owner, 3, [photo()], { batch })));
    expect(rs.every((r) => r.added === 1)).toBe(true);
    expect((await listProductPhotos(t.db)).filter((x) => x.productId === 3)).toHaveLength(2);
  });
});

describe('migration 0017', () => {
  it('รูปเดี่ยวเดิมย้ายเข้ารายการรูป · ชื่อสินค้าเปลี่ยนเฉพาะที่ยังเป็นชื่อเดิม', async () => {
    const old = await testDb({ until: '0017' });
    try {
      await old.d1.batch([
        old.d1.prepare(`INSERT INTO products (id, slug, name, category, image_key) VALUES (1, 'hive-box', 'รังเปล่า (รังไม้สัก 2 ห้อง)', 'hive_box', 'products/hive-box/a.webp'), (2, 'stingless-honey', 'น้ำผึ้งที่เจ้าของแก้เอง', 'honey', NULL), (3, 'x', 'น้ำผึ้งชันโรงขนเงิน ปี 2569', 'honey', NULL)`),
      ]);
      await old.migrate();
      expect((await old.d1.prepare(`SELECT product_id, r2_key FROM product_photos`).all()).results).toEqual([{ product_id: 1, r2_key: 'products/hive-box/a.webp' }]);
      const names = (await old.d1.prepare(`SELECT id, name FROM products ORDER BY id`).all<{ id: number; name: string }>()).results.map((r) => r.name);
      expect(names).toEqual(['รัง MetaFarm (รังเปล่า)', 'น้ำผึ้งที่เจ้าของแก้เอง', 'น้ำผึ้งชันโรงขนเงิน ปี 2569']); // slug อื่นไม่แตะ
    } finally {
      await old.close();
    }
  });
});
