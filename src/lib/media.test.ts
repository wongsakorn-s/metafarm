import { describe, expect, it } from 'vitest';
import { detectImageType, LIMITS, mediaKey, parseYoutubeId, remainingSlots, uploadSummary, youtubeWatchUrl } from './media.ts';

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
  it('รูปขาย 3 รูป วิดีโอ 1 คลิป ตามที่เจ้าของฟาร์มกำหนด', () => {
    expect(LIMITS.sale).toBe(3);
    expect(LIMITS.video).toBe(1);
    expect(remainingSlots('sale', 1)).toBe(2);
    expect(remainingSlots('sale', 3)).toBe(0);
    expect(remainingSlots('sale', 9)).toBe(0);
  });
  it('mediaKey', () => expect(mediaKey('A25', 'sale', 'abc', 'webp')).toBe('hives/A25/sale-abc.webp'));
  it('uploadSummary', () => {
    expect(uploadSummary(2, [])).toBe('เพิ่มแล้ว 2 รูป');
    expect(uploadSummary(1, [{ name: 'a.jpg', reason: 'เต็มแล้ว' }])).toBe('เพิ่มแล้ว 1 รูป · ข้าม 1 ไฟล์ (a.jpg: เต็มแล้ว)');
    expect(uploadSummary(0, [])).toBe('ไม่ได้เลือกไฟล์');
  });
});
