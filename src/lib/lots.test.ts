import { describe, expect, it } from 'vitest';
import { bottlingSchema, isLotCode, lotCode, lotPrefix, lotsLabel, maxBottles, nextLotSeq, remainingMl } from './lots.ts';

describe('รหัสล็อต', () => {
  it('H + พ.ศ. + เดือน + ลำดับ', () => {
    expect(lotCode('2026-10-03', 1)).toBe('H2569-10-1');
    expect(lotPrefix('2027-01-15')).toBe('H2570-01-');
    expect(isLotCode('H2569-10-1')).toBe(true);
    expect(isLotCode('h2569-10-1')).toBe(false);
  });
  it('ลำดับถัดไปนับเฉพาะเดือนเดียวกัน', () => {
    expect(nextLotSeq(['H2569-10-1', 'H2569-10-3', 'H2569-09-7'], 'H2569-10-')).toBe(4);
    expect(nextLotSeq([], 'H2569-10-')).toBe(1);
  });
});

describe('ปริมาณ', () => {
  it('คงเหลือ = ทั้งหมด − ที่บรรจุ · บรรจุได้อีกกี่ขวด', () => {
    const left = remainingMl(1000, [{ qty: 6, sizeMl: 50 }, { qty: 2, sizeMl: 120 }]);
    expect(left).toBe(460);
    expect(maxBottles(left, 120)).toBe(3);
    expect(maxBottles(left, 0)).toBe(0);
    expect(maxBottles(-10, 50)).toBe(0);
  });
});

describe('ล็อตของบรรทัดออเดอร์', () => {
  it('ล็อตเดียวไม่บอกจำนวน · หลายล็อตบอกจำนวนต่อล็อต · ไม่มีล็อต = ว่าง', () => {
    expect(lotsLabel([{ code: 'H2569-10-1', qty: 5 }])).toBe('ล็อต H2569-10-1');
    expect(lotsLabel([{ code: 'H2569-08-1', qty: 2 }, { code: 'H2569-10-1', qty: 3 }])).toBe('ล็อต H2569-08-1 ×2, H2569-10-1 ×3');
    expect(lotsLabel([])).toBe('');
  });
});

describe('ฟอร์มบรรจุขวด', () => {
  it('ต้องเลือกขนาดและจำนวน · ต้นทุนไม่บังคับ', () => {
    expect(bottlingSchema.safeParse({ variantId: '2', qty: '10', bottledOn: '2026-10-01', unitCost: '' }).success).toBe(true);
    expect(bottlingSchema.safeParse({ variantId: '', qty: '10', bottledOn: '2026-10-01' }).success).toBe(false);
    expect(bottlingSchema.safeParse({ variantId: '2', qty: '0', bottledOn: '2026-10-01' }).success).toBe(false);
  });
});
