import { describe, expect, it } from 'vitest';
import { csvCell, csvResponse, toCsv } from './csv.ts';

describe('csvCell', () => {
  it('ค่าว่าง/ตัวเลข/บูลีน', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(1200)).toBe('1200');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('ใช่');
    expect(csvCell(false)).toBe('');
  });
  it('ครอบเครื่องหมายคำพูดเมื่อมี , " หรือขึ้นบรรทัดใหม่', () => {
    expect(csvCell('น้ำผึ้ง, 50 มล.')).toBe('"น้ำผึ้ง, 50 มล."');
    expect(csvCell('ขวด "เล็ก"')).toBe('"ขวด ""เล็ก"""');
    expect(csvCell('บ้านเลขที่ 1\nถนน')).toBe('"บ้านเลขที่ 1\nถนน"');
  });
  it('กันสูตรแฝงในข้อความ', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+66812345678')).toBe("'+66812345678");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('ปกติ')).toBe('ปกติ');
  });
});

describe('toCsv', () => {
  it('มี BOM, CRLF, หัวตาราง', () => {
    const out = toCsv(['รหัส', 'ยอด'], [['S2569-001', 350], ['S2569-002', null]]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿รหัส,ยอด\r\nS2569-001,350\r\nS2569-002,\r\n');
  });
});

describe('csvResponse', () => {
  it('ตั้งหัวดาวน์โหลด', async () => {
    const r = csvResponse('ออเดอร์.csv', 'a', 'orders.csv');
    expect(r.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('Content-Disposition')).toBe(`attachment; filename="orders.csv"; filename*=UTF-8''${encodeURIComponent('ออเดอร์.csv')}`);
    expect(await r.text()).toBe('a');
  });
});
