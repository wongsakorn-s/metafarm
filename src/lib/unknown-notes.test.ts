import { describe, expect, it } from 'vitest';
import { resolveUnknownNotes, unknownTopics, type HiveKnowledge } from './unknown-notes.ts';

const base: HiveKnowledge = { status: 'active', queenBornOn: null, acquiredOn: null, hasQueenSource: false, hasBroodSource: false };

describe('unknownTopics', () => {
  it('ดึงเฉพาะบรรทัด ???', () => {
    expect(unknownTopics('ขยายรัง : 8 มิย. 2567\n??? วันเกิดนางพญา\n??? สถานะรัง')).toEqual(['วันเกิดนางพญา', 'สถานะรัง']);
    expect(unknownTopics(null)).toEqual([]);
  });
});

describe('resolveUnknownNotes', () => {
  const notes = 'หมายเหตุเดิม\n??? สถานะรัง\n??? วันเกิดนางพญา\n??? รังแม่ (ไข่อ่อน)';

  it('ลบเฉพาะบรรทัดที่เติมข้อมูลแล้ว และไม่แตะบรรทัดอื่น', () => {
    expect(resolveUnknownNotes(notes, { ...base, status: 'unknown', queenBornOn: '2024-06-21' })).toBe('หมายเหตุเดิม\n??? สถานะรัง\n??? รังแม่ (ไข่อ่อน)');
    expect(resolveUnknownNotes(notes, { ...base, status: 'unknown', hasBroodSource: true })).toBe('หมายเหตุเดิม\n??? สถานะรัง\n??? วันเกิดนางพญา');
  });

  it('สถานะ unknown ยังไม่ถือว่าทราบ', () => {
    expect(resolveUnknownNotes('??? สถานะรัง', { ...base, status: 'unknown' })).toBe('??? สถานะรัง');
    expect(resolveUnknownNotes('??? สถานะรัง', { ...base, status: 'collapsed' })).toBeNull();
  });

  it('"ไข่อ่อนและไข่นาง" ต้องรู้ทั้งสองรัง', () => {
    const n = '??? รังแม่ (ไข่อ่อนและไข่นาง)';
    expect(resolveUnknownNotes(n, { ...base, hasQueenSource: true })).toBe(n);
    expect(resolveUnknownNotes(n, { ...base, hasQueenSource: true, hasBroodSource: true })).toBeNull();
  });

  it('หัวข้อที่ไม่รู้จักและข้อความปกติถูกเก็บไว้', () => {
    expect(resolveUnknownNotes('??? เรื่องอื่น\nข้อความ', { ...base, queenBornOn: '2024-01-01' })).toBe('??? เรื่องอื่น\nข้อความ');
    expect(resolveUnknownNotes(null, base)).toBeNull();
    expect(resolveUnknownNotes('', base)).toBeNull();
  });
});
