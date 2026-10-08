import { describe, expect, it } from 'vitest';
import { differingFields, shortStamp } from './concurrency.ts';

describe('differingFields', () => {
  const labels = { queenBornOn: 'วันเกิดนางพญา', originPlace: 'สถานที่ซื้อ', notes: 'หมายเหตุภายใน' };
  it('เฉพาะช่องที่ค่าต่างกัน (null = ว่าง · ตัดช่องว่าง · CRLF = LF)', () => {
    const mine = { queenBornOn: '2026-01-05', originPlace: ' ระยอง ', notes: 'a\r\nb', other: 'x' };
    const latest = { queenBornOn: '2026-02-01', originPlace: 'ระยอง', notes: 'a\nb', other: 'y' };
    expect(differingFields(mine, latest, labels)).toEqual([{ key: 'queenBornOn', label: 'วันเกิดนางพญา', mine: '2026-01-05', latest: '2026-02-01' }]);
  });
  it('ว่างกับ null ถือว่าเท่ากัน · ตัวเลขเทียบเป็นข้อความ', () => {
    expect(differingFields({ a: '', b: '250' }, { a: null, b: 250 }, { a: 'A', b: 'B' })).toEqual([]);
    expect(differingFields({ b: '250' }, { b: 300 }, { b: 'B' })).toEqual([{ key: 'b', label: 'B', mine: '250', latest: '300' }]);
  });
});

describe('shortStamp', () => {
  const now = new Date('2026-10-08T07:30:00Z'); // 14:30 เวลาไทย
  it('วันนี้: แสดงแค่เวลาไทย', () => {
    expect(shortStamp('2026-10-08T07:05:12.123Z', now)).toBe('14:05 น.');
  });
  it('คนละวัน (ตามเวลาไทย): มีวันที่', () => {
    expect(shortStamp('2026-10-07T16:59:00Z', now)).toBe('7 ต.ค. 23:59 น.');
    expect(shortStamp('2026-10-07T17:01:00Z', now)).toBe('00:01 น.');
  });
  it('ค่าผิดรูปแบบ', () => {
    expect(shortStamp('x', now)).toBe('');
  });
});
