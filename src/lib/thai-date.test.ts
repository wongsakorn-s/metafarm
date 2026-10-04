import { describe, expect, it } from 'vitest';
import { formatThaiDate, parseThaiDate } from './thai-date';

describe('parseThaiDate', () => {
  it.each([
    ['25 มีค. 2565', '2022-03-25'],
    ['14 มิย. 65 แยกไข่อ่อนไป', '2022-06-14'],
    ['29 ส.ค. 2565', '2022-08-29'],
    ["Queen's Birthday : 29 สค. 2565", '2022-08-29'],
    ["Queen's Birthday : 8 Aug. 2023", '2023-08-08'],
    ["Queen's Birthday : 2 Jun. 2024 ", '2024-06-02'],
    ['ขยายรัง_14 มิย. 2565', '2022-06-14'],
    ['ขยาย 26 กค. 2566', '2023-07-26'],
    ['4) 18 กค. 2566: 1 ใบ', '2023-07-18'],
    ['ครั้งที่ 1) : 24 กค. 2565', '2022-07-24'],
    ['22 มค. 2569', '2026-01-22'],
    ['1 พค. 2566', '2023-05-01'],
  ])('%s → %s', (input, expected) => {
    expect(parseThaiDate(input)).toEqual({ iso: expected, precision: 'day' });
  });

  it('รองรับวันที่ที่มีแค่เดือน', () => {
    expect(parseThaiDate('มีค. 2566')).toEqual({ iso: '2023-03-01', precision: 'month' });
    expect(parseThaiDate('เมย. 2566')).toEqual({ iso: '2023-04-01', precision: 'month' });
  });

  it.each([[''], ["Queen's Birthday :  "], ['ไข่อ่อนจาก AXX'], ['31 กพ. 2566'], [null]])(
    'คืน null เมื่อไม่มีวันที่ที่ถูกต้อง: %s',
    (input) => {
      expect(parseThaiDate(input)).toBeNull();
    },
  );
});

describe('formatThaiDate', () => {
  it('แสดงเป็น พ.ศ.', () => {
    expect(formatThaiDate('2022-08-29')).toBe('29 ส.ค. 2565');
    expect(formatThaiDate('2023-03-01', 'month')).toBe('มี.ค. 2566');
    expect(formatThaiDate(null)).toBe('???');
  });
});
