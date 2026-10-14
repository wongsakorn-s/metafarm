import { describe, expect, it } from 'vitest';
import { detectImageType, exifOrientation, imageWidth, LIMITS, mediaKey, parseYoutubeId, remainingSlots, stripMetadata, uploadSummary, youtubeWatchUrl } from './media.ts';

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('detectImageType', () => {
  it('รู้จัก JPEG / PNG / WebP จากไบต์แรก', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: 'image/png', ext: 'png' });
    expect(detectImageType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'), 0))).toEqual({ mime: 'image/webp', ext: 'webp' });
  });
  it('ไม่รับ SVG, GIF, ข้อความ, ไฟล์ว่าง/สั้นเกิน, RIFF ที่ไม่ใช่ WebP', () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(bytes(...ascii('GIF89a')))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('hello.jpg'))).toBeNull();
    expect(detectImageType(bytes())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')))).toBeNull();
  });
});

describe('parseYoutubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    [id],
    [`https://www.youtube.com/watch?v=${id}`],
    [`https://www.youtube.com/watch?v=${id}&t=30s`],
    [`youtube.com/watch?v=${id}`],
    [`https://youtu.be/${id}?si=abc`],
    [`https://m.youtube.com/watch?v=${id}`],
    [`https://www.youtube.com/embed/${id}`],
    [`https://www.youtube.com/shorts/${id}`],
    [`  https://youtu.be/${id}  `],
  ])('%s → ได้รหัส', (input) => expect(parseYoutubeId(input)).toBe(id));

  it.each([[''], ['hello'], ['https://example.com/watch?v=dQw4w9WgXcQ'], ['https://youtube.com/watch?v=short'], ['https://www.youtube.com/'], ['javascript:alert(1)'], ['https://youtu.be/']])(
    '%s → null',
    (input) => expect(parseYoutubeId(input)).toBeNull(),
  );
  it('สร้างลิงก์ดูวิดีโอ', () => expect(youtubeWatchUrl(id)).toBe(`https://www.youtube.com/watch?v=${id}`));
});

describe('limits & keys', () => {
  it('รูปรัง 6 รูป (รูปหน้าขายเลือกจากชุดนี้) วิดีโอ 1 คลิป ตามที่เจ้าของฟาร์มกำหนด', () => {
    expect(LIMITS.passport).toBe(6);
    expect(LIMITS.video).toBe(1);
    expect(remainingSlots('passport', 1)).toBe(5);
    expect(remainingSlots('passport', 6)).toBe(0);
    expect(remainingSlots('passport', 9)).toBe(0);
  });
  it('mediaKey', () => expect(mediaKey('A25', 'passport', 'abc', 'webp')).toBe('hives/A25/passport-abc.webp'));
  it('uploadSummary', () => {
    expect(uploadSummary(2, [])).toBe('เพิ่มแล้ว 2 รูป');
    expect(uploadSummary(1, [{ name: 'a.jpg', reason: 'เต็มแล้ว' }])).toBe('เพิ่มแล้ว 1 รูป · ข้าม 1 ไฟล์ (a.jpg: เต็มแล้ว)');
    expect(uploadSummary(0, [])).toBe('ไม่ได้เลือกไฟล์');
  });
});

describe('stripMetadata (ลบพิกัด GPS และข้อมูลแฝงก่อนเก็บรูป)', () => {
  const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(s, 0, 'latin1');
  const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
  /** EXIF ที่มีการหมุนรูป + ตัวชี้ GPS + ข้อความพิกัด */
  const exif = (orient: number, le: boolean) => {
    const w16 = (v: number) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
    const w32 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff] : [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
    return [...txt('Exif\0\0'), ...txt(le ? 'II' : 'MM'), ...w16(42), ...w32(8), ...w16(2),
      ...w16(0x0112), ...w16(3), ...w32(1), ...w16(orient), 0, 0,
      ...w16(0x8825), ...w16(4), ...w32(1), ...w32(38),
      ...w32(0), ...txt('GPS 12.95N 101.14E')];
  };
  const tail = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd9];
  const jfif = seg(0xe0, [...txt('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const dqt = seg(0xdb, [0, ...Array<number>(64).fill(7)]);
  const jpeg = (orient: number, le = true) => new Uint8Array([0xff, 0xd8, ...jfif, ...seg(0xe1, exif(orient, le)), ...seg(0xe1, txt('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta GPSLatitude/>')), ...seg(0xed, txt('Photoshop 3.0\0IPTC')), ...seg(0xfe, txt('camera note')), ...dqt, ...tail]);

  it('JPEG: ลบ EXIF (GPS) / XMP / IPTC / ความเห็น · เก็บส่วนภาพครบทุกไบต์', () => {
    const out = stripMetadata(jpeg(1));
    for (const s of ['GPS', 'xmpmeta', 'IPTC', 'camera note', 'Exif']) expect(has(out, s), s).toBe(false);
    expect([...out]).toEqual([0xff, 0xd8, ...jfif, ...dqt, ...tail]);
  });

  it('JPEG ที่กล้องบันทึกตะแคง: เก็บไว้แค่การหมุนรูป (แสดงถูกทิศ) ทั้ง II และ MM', () => {
    for (const le of [true, false]) {
      expect(exifOrientation(new Uint8Array(exif(6, le)))).toBe(6);
      const out = stripMetadata(jpeg(6, le));
      expect(has(out, 'GPS')).toBe(false);
      const app1 = out.subarray(2 + jfif.length, 2 + jfif.length + 36);
      expect([app1[0], app1[1]]).toEqual([0xff, 0xe1]);
      expect(exifOrientation(app1.subarray(4))).toBe(6);
      expect(out.length).toBe(2 + jfif.length + 36 + dqt.length + tail.length);
    }
  });

  it('WebP: ตัดก้อน EXIF/XMP · ปิดธง · ขนาด RIFF ถูกต้อง', () => {
    const chunk = (tag: string, data: number[]) => [...txt(tag), data.length & 0xff, (data.length >> 8) & 0xff, 0, 0, ...data, ...(data.length & 1 ? [0] : [])];
    const vp8x = chunk('VP8X', [0x10 | 0x08 | 0x04, 0, 0, 0, 9, 0, 0, 9, 0, 0]);
    const img = chunk('VP8L', [0x2f, 1, 2, 3, 4]);
    const body = [...txt('WEBP'), ...vp8x, ...img, ...chunk('EXIF', exif(1, true)), ...chunk('XMP ', txt('<x:xmpmeta GPS/>'))];
    const out = stripMetadata(new Uint8Array([...txt('RIFF'), body.length & 0xff, (body.length >> 8) & 0xff, 0, 0, ...body]));
    expect(has(out, 'GPS')).toBe(false);
    expect(out[20]).toBe(0x10);
    expect(out.length).toBe(12 + vp8x.length + img.length);
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(detectImageType(out)?.ext).toBe('webp');
  });

  it('PNG: ตัดก้อนข้อความ/EXIF · เก็บภาพ', () => {
    const chunk = (type: string, data: number[]) => [0, 0, (data.length >> 8) & 0xff, data.length & 0xff, ...txt(type), ...data, 1, 2, 3, 4];
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const keep = [...chunk('IHDR', Array<number>(13).fill(1)), ...chunk('IDAT', [9, 9, 9])];
    const out = stripMetadata(new Uint8Array([...sig, ...keep.slice(0, 25), ...chunk('tEXt', txt('Comment\0GPS here')), ...chunk('eXIf', exif(1, true)), ...keep.slice(25), ...chunk('IEND', [])]));
    expect([...out]).toEqual([...sig, ...keep, ...chunk('IEND', [])]);
  });

  it('อ่านโครงสร้างไม่ได้ / ไม่ใช่รูป → คืนไฟล์เดิม', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00, 1, 2]);
    expect(stripMetadata(broken)).toBe(broken);
    const other = new Uint8Array(txt('GIF89a'));
    expect(stripMetadata(other)).toBe(other);
  });
});

describe('imageWidth', () => {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  it('JPEG (อ่านจาก SOF ข้าม APP/DQT) · PNG · WebP ทั้ง 3 แบบ', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xdb, 0, 3, 0, 0xff, 0xc2, 0, 11, 8, 0x01, 0x2c, 0x03, 0x20, 3, 0, 0, 0]);
    expect(imageWidth(jpeg)).toBe(800);
    const png = new Uint8Array([...sig, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x06, 0x40, 0, 0, 4, 0xb0]);
    expect(imageWidth(png)).toBe(1600);
    const riff = (chunk: string, body: number[]) => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...[...chunk].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...body]);
    expect(imageWidth(riff('VP8X', [0, 0, 0, 0, 0x3f, 0x06, 0, 0x2b, 0x04, 0]))).toBe(1600);
    expect(imageWidth(riff('VP8L', [0x2f, 0x1f, 0x03, 0, 0]))).toBe(800);
    expect(imageWidth(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02]))).toBe(800);
  });
  it('อ่านไม่ได้ → null', () => {
    expect(imageWidth(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(imageWidth(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
