import { describe, expect, it } from 'vitest';
import { bareNumber, compareHiveCodes, isHiveCode, normalizeHiveCode, splitHiveCode, suggestNextCode } from './hive-code.ts';

describe('normalizeHiveCode', () => {
  it('ตัวอักษรอื่นนอกจาก A ได้ · ตัวเล็ก/ช่องว่าง/ขีด/0 นำหน้า', () => {
    expect(normalizeHiveCode('A25')).toBe('A25');
    expect(normalizeHiveCode('b12')).toBe('B12');
    expect(normalizeHiveCode(' G-0108 ')).toBe('G108');
    expect(normalizeHiveCode('ab 7')).toBe('AB7');
    expect(normalizeHiveCode('MFA12')).toBe('MFA12');
  });
  it('รูปแบบที่ไม่ใช่รหัสรัง → null (พิมพ์แค่เลขก็ null — ให้หาจากเลข)', () => {
    for (const s of ['', '25', 'A0', 'A000', 'ABCD1', 'A123456', 'A12B', 'ก12', '12A', null, undefined]) expect(normalizeHiveCode(s as string), String(s)).toBeNull();
  });
});

describe('isHiveCode / bareNumber / splitHiveCode', () => {
  it('ตรวจรูปแบบมาตรฐาน', () => {
    expect(isHiveCode('G108')).toBe(true);
    expect(isHiveCode('g108')).toBe(false);
    expect(isHiveCode('A025')).toBe(false);
  });
  it('เลขล้วน', () => {
    expect(bareNumber(' 25 ')).toBe(25);
    expect(bareNumber('0')).toBeNull();
    expect(bareNumber('A25')).toBeNull();
  });
  it('แยกตัวอักษร/เลข', () => {
    expect(splitHiveCode('AB108')).toEqual({ prefix: 'AB', num: 108 });
  });
});

describe('compareHiveCodes', () => {
  it('เรียงแบบคนอ่าน (A2 ก่อน A10 · ชุด A ก่อน B)', () => {
    expect(['B1', 'A10', 'A2', 'G108', 'A1'].sort(compareHiveCodes)).toEqual(['A1', 'A2', 'A10', 'B1', 'G108']);
  });
});

describe('suggestNextCode', () => {
  it('ชุดเดียวกับรังที่เพิ่มล่าสุด ต่อจากเลขสูงสุดของชุดนั้น', () => {
    expect(suggestNextCode('A147', ['A1', 'A147', 'B12'])).toBe('A148');
    expect(suggestNextCode('B12', ['A1', 'A147', 'B12', 'B3'])).toBe('B13');
    expect(suggestNextCode('A5', ['A5', 'A200'])).toBe('A201');
    expect(suggestNextCode(null, [])).toBe('A1');
  });
});
