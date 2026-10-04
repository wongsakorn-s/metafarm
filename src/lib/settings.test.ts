import { describe, expect, it } from 'vitest';
import { contactSchema, contactToRows, courseSchema, courseToRows, DEFAULT_CONTACT, effectiveCourse, lineChatUrl, parseSettingRows, stripSampleMark, telHref } from './settings.ts';

const parse = <S extends { safeParse: (v: unknown) => any }>(s: S, o: Record<string, string>) => s.safeParse(o);

describe('parseSettingRows', () => {
  it('ไม่มีข้อมูล → ใช้ค่าเริ่มต้น (ตัวอย่าง) และยังไม่ยืนยัน', () => {
    const s = parseSettingRows([]);
    expect(s.contact).toEqual(DEFAULT_CONTACT);
    expect(s.contact.confirmed).toBe(false);
    expect(s.courses).toEqual({});
  });
  it('ค่าที่บันทึกแล้วชนะค่าเริ่มต้น แม้เป็นค่าว่าง (ว่าง = ซ่อนช่องทางนั้น ไม่กลับไปใช้ตัวอย่าง)', () => {
    const s = parseSettingRows([{ key: 'contact.lineId', value: '@farm' }, { key: 'contact.phone', value: '' }, { key: 'contact.confirmed', value: '1' }]);
    expect(s.contact).toMatchObject({ lineId: '@farm', phone: '', confirmed: true, facebookUrl: DEFAULT_CONTACT.facebookUrl });
  });
  it('อ่านค่าหลักสูตร', () => {
    const s = parseSettingRows([{ key: 'course.hive-splitting.priceThb', value: '1800' }, { key: 'course.hive-splitting.duration', value: '1 วัน' }, { key: 'course.hive-splitting.confirmed', value: '1' }, { key: 'junk.key', value: 'x' }]);
    expect(s.courses['hive-splitting']).toEqual({ priceThb: 1800, duration: '1 วัน', confirmed: true });
  });
});

describe('helpers', () => {
  it('lineChatUrl: OA ใส่ข้อความได้ ID ส่วนตัวเปิดโปรไฟล์ ว่าง = null', () => {
    expect(lineChatUrl({ lineId: '@farm' }, 'สนใจ A25')).toBe('https://line.me/R/oaMessage/%40farm/?%E0%B8%AA%E0%B8%99%E0%B9%83%E0%B8%88%20A25');
    expect(lineChatUrl({ lineId: '@farm' })).toBe('https://line.me/R/oaMessage/%40farm/');
    expect(lineChatUrl({ lineId: 'somchai.k' }, 'x')).toBe('https://line.me/ti/p/~somchai.k');
    expect(lineChatUrl({ lineId: '  ' })).toBeNull();
  });
  it('telHref', () => {
    expect(telHref('081-234-5678')).toBe('tel:0812345678');
    expect(telHref('+66 81 234 5678')).toBe('tel:+66812345678');
    expect(telHref('')).toBeNull();
    expect(telHref('12')).toBeNull();
  });
  it('ยืนยันแล้วคำว่า "(ตัวอย่าง)" ท้ายระยะเวลาถูกตัดออก (ทั้งตอนแสดงและตอนบันทึก)', () => {
    const base = { priceThb: 1500, duration: '1 วัน (ตัวอย่าง)', priceIsSample: true };
    expect(stripSampleMark('ครึ่งวัน (ตัวอย่าง)')).toBe('ครึ่งวัน');
    expect(stripSampleMark('1 วัน')).toBe('1 วัน');
    expect(effectiveCourse(base, { confirmed: true }).duration).toBe('1 วัน');
    expect(effectiveCourse(base, { confirmed: false }).duration).toBe('1 วัน (ตัวอย่าง)');
    const r = parse(courseSchema, { slug: 'hive-splitting', priceThb: '1500', duration: '1 วัน (ตัวอย่าง)', confirmed: 'on' });
    expect(courseToRows(r.data).find((x) => x.key.endsWith('.duration'))?.value).toBe('1 วัน');
    const u = parse(courseSchema, { slug: 'hive-splitting', priceThb: '1500', duration: '1 วัน (ตัวอย่าง)' });
    expect(courseToRows(u.data).find((x) => x.key.endsWith('.duration'))?.value).toBe('1 วัน (ตัวอย่าง)'); // ยังไม่ยืนยัน → คงไว้
  });
  it('effectiveCourse: ค่าที่แก้ชนะไฟล์ และติ๊กยืนยันแล้วเลิกเป็นตัวอย่าง', () => {
    const base = { priceThb: 1500, duration: '1 วัน (ตัวอย่าง)', priceIsSample: true };
    expect(effectiveCourse(base, undefined)).toEqual(base);
    expect(effectiveCourse(base, { priceThb: 2000, duration: '2 วัน', confirmed: false })).toEqual({ priceThb: 2000, duration: '2 วัน', priceIsSample: true });
    expect(effectiveCourse(base, { priceThb: 2000, confirmed: true })).toEqual({ priceThb: 2000, duration: '1 วัน', priceIsSample: false });
  });
});

describe('contactSchema', () => {
  const ok = { lineId: '@metafarm', phone: '081-234-5678', facebookUrl: 'https://www.facebook.com/metafarm', mapUrl: 'https://maps.app.goo.gl/abc123', confirmed: 'on' };
  it('รับค่าที่ถูกต้องและแปลงเป็นแถว', () => {
    const r = parse(contactSchema, ok);
    expect(r.success).toBe(true);
    expect(contactToRows(r.data).find((x) => x.key === 'contact.confirmed')?.value).toBe('1');
  });
  it('ช่องว่างได้ (ซ่อนช่องทาง) แต่ยืนยันต้องมี LINE หรือเบอร์', () => {
    expect(parse(contactSchema, { lineId: '', phone: '', facebookUrl: '', mapUrl: '' }).success).toBe(true);
    expect(parse(contactSchema, { lineId: '', phone: '', facebookUrl: '', mapUrl: '', confirmed: 'on' }).success).toBe(false);
    expect(parse(contactSchema, { ...ok, lineId: '' }).success).toBe(true); // มีเบอร์ก็พอ
  });
  it.each([
    [{ lineId: 'ไลน์ฉัน' }], [{ lineId: 'a' }], [{ phone: 'abc' }], [{ phone: '12-34' }],
    [{ facebookUrl: 'http://facebook.com/x' }], [{ facebookUrl: 'https://evil.example/facebook.com' }], [{ facebookUrl: 'javascript:alert(1)' }], [{ facebookUrl: 'https://facebook.com.evil.example/x' }],
    [{ mapUrl: 'https://evil.example/maps' }], [{ mapUrl: 'data:text/html,<script>' }],
  ])('ปฏิเสธค่าที่ไม่ปลอดภัย/ไม่ถูกต้อง %j', (bad) => {
    expect(parse(contactSchema, { ...ok, ...bad }).success).toBe(false);
  });
  it('รับลิงก์ Google Maps หลายแบบ', () => {
    for (const u of ['https://maps.app.goo.gl/x1', 'https://www.google.com/maps/place/xyz', 'https://maps.google.com/?q=1,2', 'https://goo.gl/maps/abc'])
      expect(parse(contactSchema, { ...ok, mapUrl: u }).success).toBe(true);
  });
});

describe('courseSchema', () => {
  it('ราคาเป็นจำนวนเต็ม ≥ 1 และต้องมีระยะเวลา', () => {
    const r = parse(courseSchema, { slug: 'hive-splitting', priceThb: '1800', duration: '1 วัน', confirmed: 'on' });
    expect(r.success).toBe(true);
    expect(courseToRows(r.data)).toEqual([{ key: 'course.hive-splitting.priceThb', value: '1800' }, { key: 'course.hive-splitting.duration', value: '1 วัน' }, { key: 'course.hive-splitting.confirmed', value: '1' }]);
    for (const bad of [{ priceThb: '0' }, { priceThb: '-5' }, { priceThb: '12.5' }, { priceThb: '' }, { duration: '' }, { slug: '../x' }])
      expect(parse(courseSchema, { slug: 'hive-splitting', priceThb: '100', duration: '1 วัน', ...bad }).success).toBe(false);
  });
});
