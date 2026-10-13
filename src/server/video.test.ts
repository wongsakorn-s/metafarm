// วิดีโอบน D1 + R2 ชั่วคราว: รับสตรีม · ตรวจ codec/พิกัด · ผูกกับรัง/หน้าแรก · เสิร์ฟแบบ Range · เปิดสาธารณะเฉพาะที่ผูกไว้
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getHiveDetail } from './hives.ts';
import { getPublicHive, isPublicVideoKey } from './public.ts';
import { getSettings } from './settings.ts';
import { parseRange, serveVideo } from './serve-video.ts';
import { setVideo } from './media.ts';
import { attachHiveVideo, receiveVideo, setHomeVideo } from './video.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.prepare(`INSERT INTO hives (code, species_id, origin, box_type) VALUES ('A1', 1, 'queen_bred', 'teak_2room')`).run();
}, 60_000);
afterAll(() => t?.close());

const enc = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xff);
const be = (n: number, len = 4) => Array.from({ length: len }, (_, i) => (n >>> (8 * (len - 1 - i))) & 0xff);
const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat();
  return [...be(body.length + 8), ...enc(type), ...body];
};
const trak = (entry: string) =>
  box('trak', box('mdia', box('hdlr', [0, 0, 0, 0], be(0), enc('vide'), Array<number>(12).fill(0)), box('minf', box('stbl', box('stsd', [0, 0, 0, 0], be(1), box(entry, Array<number>(20).fill(0)))))));
const gps = '+13.7563+100.5018+005.000/';
const mp4 = (entry = 'avc1', withGps = false) =>
  new Uint8Array([
    ...box('ftyp', enc('isom'), be(512), enc('isomiso2avc1mp41')),
    ...box('mdat', Array<number>(5000).fill(7)),
    ...box('moov', box('mvhd', [0, 0, 0, 0], be(0), be(0), be(1000), be(45_000), Array<number>(80).fill(0)), trak(entry), withGps ? box('udta', box('©xyz', be(gps.length, 2), be(0x15c7, 2), enc(gps))) : []),
  ]);
const put = (bytes: Uint8Array) => new Request('http://localhost/admin/x/video', { method: 'PUT', body: bytes as unknown as BodyInit, headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } });

describe('รับวิดีโอ', () => {
  it('MP4 H.264 ไม่มีพิกัด → เก็บใน R2 ที่ videos/<target>/<uuid>.mp4', async () => {
    const r = await receiveVideo(t.media, put(mp4()), 'hive-A1');
    expect(r).toMatchObject({ ok: true, durationSec: 45 });
    if (r.ok) {
      expect(r.key).toMatch(/^videos\/hive-A1\/[0-9a-f-]{36}\.mp4$/);
      expect((await t.media.head(r.key))?.size).toBe(mp4().length);
    }
  });

  it('HEVC / มีพิกัด / ไม่ใช่วิดีโอ / ไม่มีความยาว → ปฏิเสธและไม่ทิ้งไฟล์ใน R2', async () => {
    const before = (await t.media.list({ prefix: 'videos/' })).objects.length;
    expect(await receiveVideo(t.media, put(mp4('hvc1')), 'x')).toMatchObject({ ok: false, error: expect.stringContaining('เข้ากันได้มากที่สุด') });
    expect(await receiveVideo(t.media, put(mp4('avc1', true)), 'x')).toMatchObject({ ok: false, error: expect.stringContaining('พิกัด') });
    expect(await receiveVideo(t.media, put(new Uint8Array(5000).fill(1)), 'x')).toMatchObject({ ok: false });
    expect(await receiveVideo(t.media, new Request('http://localhost/', { method: 'PUT' }), 'x')).toMatchObject({ ok: false, status: 411 });
    expect((await t.media.list({ prefix: 'videos/' })).objects.length).toBe(before);
  });
});

describe('ผูกกับรัง/หน้าแรก และสิทธิ์เปิดดู', () => {
  it('วิดีโอรัง: ผูกแล้วเปิดสาธารณะ · อัปโหลดใหม่ลบไฟล์เก่า · YouTube แทนแล้วลบไฟล์ · คีย์ที่ไม่ได้ผูก = ไม่เปิด', async () => {
    const hive = (await getHiveDetail(t.db, 'A1'))!.hive;
    const a = await receiveVideo(t.media, put(mp4()), 'hive-A1');
    const b = await receiveVideo(t.media, put(mp4()), 'hive-A1');
    if (!a.ok || !b.ok) throw new Error('upload');
    expect(await isPublicVideoKey(t.db, a.key)).toBe(false);
    await attachHiveVideo(t.db, t.media, t.owner, hive, a.key, a.durationSec);
    expect((await getPublicHive(t.db, 'A1'))?.video).toEqual({ key: a.key });
    expect(await isPublicVideoKey(t.db, a.key)).toBe(true);
    await attachHiveVideo(t.db, t.media, t.owner, hive, b.key, b.durationSec);
    expect(await t.media.head(a.key)).toBeNull();
    expect(await isPublicVideoKey(t.db, a.key)).toBe(false);
    expect(await setVideo(t.db, t.media, t.owner, hive, 'https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: true });
    expect(await t.media.head(b.key)).toBeNull();
    expect((await getPublicHive(t.db, 'A1'))?.video).toEqual({ youtubeId: 'dQw4w9WgXcQ' });
  });

  it('วิดีโอหน้าแรก: อัปโหลด → settings.homeVideo · YouTube แทน/เอาออก ลบไฟล์เดิม', async () => {
    const r = await receiveVideo(t.media, put(mp4()), 'home');
    if (!r.ok) throw new Error('upload');
    expect(await setHomeVideo(t.db, t.media, t.owner, { key: r.key })).toEqual({ ok: true });
    expect((await getSettings(t.db)).homeVideo).toEqual({ key: r.key });
    expect(await isPublicVideoKey(t.db, r.key)).toBe(true);
    expect(await setHomeVideo(t.db, t.media, t.owner, { youtube: 'not a link' })).toMatchObject({ ok: false });
    expect(await setHomeVideo(t.db, t.media, t.owner, { youtube: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual({ ok: true });
    expect((await getSettings(t.db)).homeVideo).toEqual({ youtubeId: 'dQw4w9WgXcQ' });
    expect(await t.media.head(r.key)).toBeNull();
    expect(await setHomeVideo(t.db, t.media, t.owner, { youtube: '' })).toEqual({ ok: true });
    expect((await getSettings(t.db)).homeVideo).toBeNull();
  });
});

describe('เสิร์ฟแบบ Range', () => {
  it('parseRange', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=1000-', 1000)).toBeNull();
    expect(parseRange('bytes=5-2', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });

  it('200 เต็มไฟล์ · 206 ช่วง · 416 นอกไฟล์ · HEAD · คีย์แปลก 404', async () => {
    const r = await receiveVideo(t.media, put(mp4()), 'home');
    if (!r.ok) throw new Error('upload');
    const total = r.bytes;
    const get = (range?: string, method = 'GET') => serveVideo(t.media, r.key, new Request(`http://localhost/video/${r.key}`, { method, headers: range ? { range } : {} }));
    const full = await get();
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect((await full.arrayBuffer()).byteLength).toBe(total);
    const part = await get('bytes=10-19');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 10-19/${total}`);
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(mp4().slice(10, 20));
    expect((await get(`bytes=${total + 5}-`)).status).toBe(416);
    expect((await get(undefined, 'HEAD')).headers.get('content-length')).toBe(String(total));
    expect((await serveVideo(t.media, '../etc/passwd', new Request('http://localhost/'))).status).toBe(404);
    await t.media.delete(r.key);
  });
});
