// Gallery บน D1 + R2 ชั่วคราว: อัปโหลดลบ GPS · ส่งซ้ำไม่บันทึกซ้ำ · ลบแล้วรูปหายจากเว็บและ R2 · หน้าสาธารณะเห็นเฉพาะคอลัมน์ที่อนุญาต
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GALLERY_MAX_PER_CATEGORY } from '../lib/gallery.ts';
import { deleteGalleryPhoto, listGalleryAdmin, updateGalleryCaption, uploadGalleryPhotos } from './gallery.ts';
import { getGallery, isPublicMediaKey } from './public.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { t = await testDb(); }, 60_000);
afterAll(() => t?.close());

const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const exif = [...txt('Exif\0\0II'), 42, 0, 8, 0, 0, 0, 2, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, ...txt('GPS 12.95N 101.14E')];
const jpeg = new Uint8Array([0xff, 0xd8, ...seg(0xe1, exif), ...seg(0xdb, [0, ...Array<number>(64).fill(3)]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x55, 0xff, 0xd9]);
const photo = (name = 'delivery.jpg') => new File([jpeg], name, { type: 'image/jpeg' });

describe('อัปโหลด', () => {
  it('ลบพิกัด GPS ทั้งรูปเต็มและรูปย่อ · คำบรรยายติดทุกรูป · เปิดบนเว็บได้', async () => {
    const r = await uploadGalleryPhotos(t.db, t.media, t.owner, 'hive_delivery', [photo(), photo()], { thumbs: [photo('t.jpg')], caption: 'ส่งมอบรังที่ชลบุรี' });
    expect(r).toMatchObject({ added: 2, skipped: [] });
    const rows = (await listGalleryAdmin(t.db)).filter((x) => x.category === 'hive_delivery');
    expect(rows.map((x) => x.caption)).toEqual(['ส่งมอบรังที่ชลบุรี', 'ส่งมอบรังที่ชลบุรี']);
    const key = rows[0]!.r2Key;
    expect(key).toMatch(/^gallery\/hive_delivery\/[0-9a-f-]{36}\.jpg$/);
    for (const k of [rows[1]!.r2Key, `thumb/${rows[1]!.r2Key}`]) {
      const stored = new Uint8Array(await (await t.media.get(k))!.arrayBuffer());
      expect(Buffer.from(stored).includes('GPS', 0, 'latin1'), k).toBe(false);
    }
    expect(await isPublicMediaKey(t.db, key)).toBe(true);
    expect(await isPublicMediaKey(t.db, `thumb/${key}`)).toBe(false); // รูปย่อขอผ่าน ?w=thumb ของคีย์ที่เปิดเท่านั้น
  });

  it('ส่งชุดเดิมซ้ำพร้อมกัน (คิวรอส่ง) → บันทึกครั้งเดียว', async () => {
    const batch = crypto.randomUUID();
    const rs = await Promise.all([1, 2].map(() => uploadGalleryPhotos(t.db, t.media, t.owner, 'woodshop', [photo()], { batch })));
    expect(rs.every((r) => r.added === 1)).toBe(true);
    expect((await listGalleryAdmin(t.db)).filter((x) => x.category === 'woodshop')).toHaveLength(1);
  });

  it('ไฟล์ที่ไม่ใช่รูปถูกข้าม · หมวดเต็มแล้วไม่รับเพิ่ม', async () => {
    const r = await uploadGalleryPhotos(t.db, t.media, t.owner, 'farm', [new File(['<svg/>'], 'x.svg')]);
    expect(r).toMatchObject({ added: 0, skipped: [{ name: 'x.svg' }] });
    const values = Array.from({ length: GALLERY_MAX_PER_CATEGORY }, (_, i) => `('farm', 'gallery/farm/fill-${i}.jpg', ${i})`).join(', ');
    await t.d1.prepare(`INSERT INTO gallery_photos (category, r2_key, sort_order) VALUES ${values}`).run();
    const full = await uploadGalleryPhotos(t.db, t.media, t.owner, 'farm', [photo()]);
    expect(full.added).toBe(0);
    expect(full.skipped[0]!.reason).toMatch(/เต็ม/);
  });
});

describe('หน้าสาธารณะ + แก้/ลบ', () => {
  it('getGallery ให้แค่หมวด คีย์ และคำบรรยาย · ใหม่ก่อน', async () => {
    const all = await getGallery(t.db);
    expect(Object.keys(all[0]!).sort()).toEqual(['caption', 'category', 'key']);
    const farm = all.filter((p) => p.category === 'farm');
    expect(farm[0]!.key).toBe(`gallery/farm/fill-${GALLERY_MAX_PER_CATEGORY - 1}.jpg`);
  });

  it('แก้คำบรรยาย · ลบแล้วหายจากเว็บและ R2 (รวมรูปย่อ) · กดลบซ้ำไม่ error', async () => {
    const row = (await listGalleryAdmin(t.db)).find((x) => x.category === 'hive_delivery')!;
    await updateGalleryCaption(t.db, t.owner, row.id, 'ส่งมอบรังที่ระยอง');
    expect((await getGallery(t.db)).find((p) => p.key === row.r2Key)!.caption).toBe('ส่งมอบรังที่ระยอง');
    expect((await deleteGalleryPhoto(t.db, t.media, t.owner, row.id)).ok).toBe(true);
    expect(await isPublicMediaKey(t.db, row.r2Key)).toBe(false);
    expect(await t.media.get(row.r2Key)).toBeNull();
    expect(await t.media.get(`thumb/${row.r2Key}`)).toBeNull();
    expect((await deleteGalleryPhoto(t.db, t.media, t.owner, row.id)).ok).toBe(true);
  });
});
