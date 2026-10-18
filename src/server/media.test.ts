// อัปโหลดรูปผ่านฟังก์ชันจริง (D1 + R2 ชั่วคราว): รูปที่เก็บต้องไม่มีพิกัด GPS แต่ยังหมุนถูกทิศ
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exifOrientation } from '../lib/media.ts';
import { deleteMedia, uploadImages } from './media.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.prepare(`INSERT INTO hives (id, code, species_id, status) VALUES (1, 'A1', 1, 'active')`).run();
}, 60_000);
afterAll(() => t?.close());

const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
// EXIF (little-endian): หมุน 90° (6) + ตัวชี้ GPS + ข้อความพิกัด
const exif = [...txt('Exif\0\0II'), 42, 0, 8, 0, 0, 0, 2, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, ...txt('GPS 12.95N 101.14E')];
const jpeg = new Uint8Array([0xff, 0xd8, ...seg(0xe1, exif), ...seg(0xdb, [0, ...Array<number>(64).fill(3)]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x55, 0xff, 0xd9]);

describe('uploadImages', () => {
  it('เก็บรูปโดยลบพิกัด GPS (ทั้งรูปเต็มและรูปย่อ) · คงการหมุนรูป', async () => {
    const hive = (await t.db.query.hives.findFirst({ where: (h, { eq }) => eq(h.id, 1) }))!;
    const file = new File([jpeg], 'phone.jpg', { type: 'image/jpeg' });
    const r = await uploadImages(t.db, t.media, t.owner, hive, 'passport', [file], undefined, [new File([jpeg], 'phone-thumb.jpg', { type: 'image/jpeg' })], [new File([jpeg], 'phone-med.jpg', { type: 'image/jpeg' })]);
    expect(r).toMatchObject({ added: 1, skipped: [] });
    const key = (await t.d1.prepare(`SELECT r2_key k FROM hive_media WHERE hive_id = 1`).first<{ k: string }>())!.k;
    for (const k of [key, `thumb/${key}`, `med/${key}`]) {
      const stored = new Uint8Array(await (await t.media.get(k))!.arrayBuffer());
      expect(Buffer.from(stored).includes('GPS', 0, 'latin1'), k).toBe(false);
      expect(exifOrientation(stored.subarray(6, 2 + 36)), k).toBe(6);
      expect(stored.length, k).toBe(jpeg.length - (exif.length + 4) + 36);
    }
  });

  it('รูปกลางที่ไม่ใช่รูป หรือใหญ่เกิน 400 KB ถูกข้าม (รูปเต็มยังเก็บ) · ลบรูปแล้วรูปย่อ/รูปกลางหายด้วย', async () => {
    const hive = (await t.db.query.hives.findFirst({ where: (h, { eq }) => eq(h.id, 1) }))!;
    const fake = new File([new Uint8Array(100).fill(7)], 'x.jpg', { type: 'image/jpeg' });
    const big = new File([new Uint8Array(400 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    for (const [bad, label] of [[fake, 'not an image'], [big, 'too big']] as const) {
      const r = await uploadImages(t.db, t.media, t.owner, hive, 'sale', [new File([jpeg], `${label}.jpg`, { type: 'image/jpeg' })], undefined, [], [bad]);
      expect(r, label).toMatchObject({ added: 1, skipped: [] });
    }
    const rows = (await t.d1.prepare(`SELECT id, r2_key k FROM hive_media WHERE hive_id = 1 AND kind = 'sale'`).all<{ id: number; k: string }>()).results;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(await t.media.get(row.k)).not.toBeNull();
      expect(await t.media.get(`med/${row.k}`)).toBeNull();
    }
    const withMed = (await t.d1.prepare(`SELECT r2_key k FROM hive_media WHERE hive_id = 1 AND kind = 'passport'`).first<{ k: string }>())!.k;
    expect(await t.media.get(`med/${withMed}`)).not.toBeNull();
    const id = (await t.d1.prepare(`SELECT id FROM hive_media WHERE r2_key = ?`).bind(withMed).first<{ id: number }>())!.id;
    expect((await deleteMedia(t.db, t.media, t.owner, hive, id)).ok).toBe(true);
    for (const k of [withMed, `thumb/${withMed}`, `med/${withMed}`]) expect(await t.media.get(k), k).toBeNull();
  });
});
