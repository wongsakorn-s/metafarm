import { describe, expect, it } from 'vitest';
import { acquiredLabel, speciesLabel } from './labels.ts';

describe('ป้ายบนหน้าสาธารณะ (เจ้าของขอ 2026-10-13)', () => {
  it('ชื่อสายพันธุ์: ตัดคำว่า "ชันโรง" ออก · ชื่ออื่นไม่เปลี่ยน · ไม่เหลือค่าว่าง', () => {
    expect(speciesLabel('ชันโรงขนเงิน')).toBe('ขนเงิน');
    expect(speciesLabel('ชันโรง ถ้วยดำ')).toBe('ถ้วยดำ');
    expect(speciesLabel('ขนเงิน')).toBe('ขนเงิน');
    expect(speciesLabel('ชันโรง')).toBe('ชันโรง');
  });
  it('ป้ายวันที่เริ่มต้น: ซื้อมา / เพาะนางพญาเอง-แยกรัง / อื่น ๆ', () => {
    expect(acquiredLabel('purchased')).toBe('ได้มาเมื่อ');
    expect(acquiredLabel('queen_bred')).toBe('แยกขยายรัง');
    expect(acquiredLabel('split')).toBe('แยกขยายรัง');
    expect(acquiredLabel('natural')).toBe('เริ่มรังเมื่อ');
    expect(acquiredLabel('unknown')).toBe('เริ่มรังเมื่อ');
  });
});
