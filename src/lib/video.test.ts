import { describe, expect, it } from 'vitest';
import { checkVideo, hasLocation, MAX_VIDEO_BYTES, readMoov, scrubLocation, type Reader } from './video.ts';

const enc = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xff);
const be = (n: number, len = 4) => Array.from({ length: len }, (_, i) => (n >>> (8 * (len - 1 - i))) & 0xff);
const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat();
  return [...be(body.length + 8), ...enc(type), ...body];
};
const mvhd = (scale: number, dur: number) => box('mvhd', [0, 0, 0, 0], be(0), be(0), be(scale), be(dur), Array<number>(80).fill(0));
const trak = (handler: 'vide' | 'soun', entry: string) =>
  box('trak', box('mdia', box('hdlr', [0, 0, 0, 0], be(0), enc(handler), Array<number>(12).fill(0)), box('minf', box('stbl', box('stsd', [0, 0, 0, 0], be(1), box(entry, Array<number>(20).fill(0)))))));
const ftyp = box('ftyp', enc('isom'), be(512), enc('isomiso2avc1mp41'));
const mdat = (n: number) => box('mdat', Array<number>(n).fill(7));
const file = (...parts: number[][]) => new Uint8Array(parts.flat());
const reader = (f: Uint8Array): Reader => async (o, l) => f.slice(o, o + l);
const check = (f: Uint8Array) => checkVideo(f.length, reader(f));

const gps = '+13.7563+100.5018+005.000/';
const xyz = box('udta', box('©xyz', be(gps.length, 2), be(0x15c7, 2), enc(gps)));
const apple = box('meta', box('ilst', box('data', be(1), be(0), enc(gps))));

describe('ตรวจวิดีโอ', () => {
  const good = (moovExtra: number[] = []) => box('moov', mvhd(1000, 45_500), trak('vide', 'avc1'), trak('soun', 'mp4a'), moovExtra);

  it('H.264 · moov อยู่ท้ายไฟล์ (มือถือส่วนใหญ่) · อ่านความยาวได้', async () => {
    const r = await check(file(ftyp, mdat(2000), good()));
    expect(r).toMatchObject({ ok: true, durationSec: 45.5 });
  });
  it('moov อยู่ต้นไฟล์ก็ได้ (faststart)', async () => {
    expect((await check(file(ftyp, good(), mdat(2000)))).ok).toBe(true);
  });
  it('HEVC → บอกวิธีตั้งค่า iPhone', async () => {
    const r = await check(file(ftyp, mdat(2000), box('moov', mvhd(1000, 1000), trak('vide', 'hvc1'))));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('เข้ากันได้มากที่สุด');
  });
  it('codec อื่น (เช่น vp09) และไฟล์ที่ไม่มีภาพ → ไม่รับ', async () => {
    expect((await check(file(ftyp, mdat(2000), box('moov', mvhd(1, 1), trak('vide', 'vp09'))))).ok).toBe(false);
    expect((await check(file(ftyp, mdat(2000), box('moov', mvhd(1, 1), trak('soun', 'mp4a'))))).ok).toBe(false);
  });
  it('ไม่ใช่ MP4 / ไฟล์ขาด / ไม่มี ftyp / ใหญ่เกิน → ไม่รับ', async () => {
    expect((await check(new Uint8Array(5000).fill(1))).ok).toBe(false);
    expect((await check(file(ftyp, mdat(2000)))).ok).toBe(false); // ไม่มี moov
    const cut = file(ftyp, mdat(2000), good());
    expect((await check(cut.slice(0, cut.length - 30))).ok).toBe(false);
    expect((await check(file(mdat(2000), good()))).ok).toBe(false);
    expect(await checkVideo(MAX_VIDEO_BYTES + 1, async () => new Uint8Array())).toMatchObject({ ok: false });
  });
});

describe('ลบพิกัด GPS', () => {
  const moovOf = (extra: number[]) => {
    const f = file(ftyp, mdat(100), box('moov', mvhd(1000, 1000), trak('vide', 'avc1'), extra));
    const start = f.length - box('moov', mvhd(1000, 1000), trak('vide', 'avc1'), extra).length;
    return f.slice(start);
  };
  it('กล่อง ©xyz และสตริง ISO 6709 ของ Apple → หายหมด ขนาดเท่าเดิม ยังอ่าน codec ได้', () => {
    for (const extra of [xyz, apple, [...xyz, ...apple]]) {
      const m = moovOf(extra);
      const size = m.length;
      expect(hasLocation(m)).toBe(true);
      expect(scrubLocation(m)).toBeGreaterThan(0);
      expect(m.length).toBe(size);
      expect(hasLocation(m)).toBe(false);
      expect(Buffer.from(m).toString('latin1')).not.toContain('13.7563');
      expect(readMoov(m.subarray(8)).videoCodecs).toEqual(['avc1']);
    }
  });
  it('ไม่มีพิกัด = ไม่แก้อะไร', () => {
    const m = moovOf([]);
    const copy = m.slice();
    expect(hasLocation(m)).toBe(false);
    expect(scrubLocation(m)).toBe(0);
    expect(m).toEqual(copy);
  });
});
