import { describe, expect, it } from 'vitest';
import { bestSellers, monthlyRevenue, parseYear, reportYears, summarize, topCustomers, type SaleLine } from './reports.ts';

const line = (o: Partial<SaleLine>): SaleLine => ({ orderCode: 'S2569-001', paidOn: '2026-03-10', customerId: 1, customer: 'ก', kind: 'variant', variantId: 1, label: 'น้ำผึ้ง 50 มล.', qty: 1, unitPrice: 100, unitCost: 40, ...o });

const lines: SaleLine[] = [
  line({ qty: 2 }), // ขาย 200 ต้นทุน 80
  line({ orderCode: 'S2569-002', paidOn: '2026-03-20', customerId: 2, customer: 'ข', variantId: 2, label: 'น้ำผึ้ง 120 มล.', unitPrice: 250, unitCost: null }),
  line({ orderCode: 'S2569-003', paidOn: '2026-07-01', kind: 'hive', variantId: null, label: 'รัง A12', unitPrice: 1500, unitCost: 0 }),
  line({ orderCode: 'S2569-004', paidOn: '2026-12-31', customerId: null, customer: null, qty: 3, unitCost: 33.5 }), // ขาย 300 ต้นทุน 100.5 → 101
];

describe('summarize', () => {
  it('รวมยอด แยกรายการที่ไม่มีต้นทุน', () => {
    expect(summarize(lines)).toEqual({ revenue: 2250, orders: 4, costedRevenue: 2000, cost: 181, profit: 1819, uncosted: { lines: 1, revenue: 250 } });
  });
  it('ไม่มีรายการ', () => {
    expect(summarize([])).toEqual({ revenue: 0, orders: 0, costedRevenue: 0, cost: 0, profit: 0, uncosted: { lines: 0, revenue: 0 } });
  });
});

describe('monthlyRevenue', () => {
  it('12 เดือนตามวันที่ชำระ', () => {
    const m = monthlyRevenue(lines);
    expect(m).toHaveLength(12);
    expect(m[2]).toBe(450);
    expect(m[6]).toBe(1500);
    expect(m[11]).toBe(300);
    expect(m.reduce((a, b) => a + b, 0)).toBe(2250);
  });
});

describe('bestSellers', () => {
  it('เรียงตามยอดขาย · กำไร null เมื่อมีรายการที่ไม่รู้ต้นทุน', () => {
    const b = bestSellers(lines);
    expect(b.map((x) => x.key)).toEqual(['hive', 'v1', 'v2']);
    expect(b[0]).toMatchObject({ label: 'รังชันโรง', qty: 1, revenue: 1500, profit: 1500 });
    expect(b[1]).toMatchObject({ qty: 5, revenue: 500, profit: 500 - 80 - 101 });
    expect(b[2]).toMatchObject({ qty: 1, revenue: 250, profit: null });
  });
});

describe('topCustomers', () => {
  it('รวมตามลูกค้า ข้ามที่ไม่ระบุ', () => {
    expect(topCustomers(lines)).toEqual([
      { id: 1, name: 'ก', orders: 2, revenue: 1700 },
      { id: 2, name: 'ข', orders: 1, revenue: 250 },
    ]);
    expect(topCustomers(lines, 1)).toHaveLength(1);
  });
});

describe('ปี', () => {
  it('reportYears: ปีปัจจุบันเสมอ ไม่ซ้ำ ใหม่ก่อน', () => {
    expect(reportYears([2025, 2026, 2024, 2025], 2026)).toEqual([2026, 2025, 2024]);
    expect(reportYears([], 2026)).toEqual([2026]);
    expect(reportYears([2030, Number.NaN], 2026)).toEqual([2026]);
  });
  it('parseYear', () => {
    expect(parseYear('2025', 2026)).toBe(2025);
    expect(parseYear(null, 2026)).toBe(2026);
    expect(parseYear('2569', 2026)).toBe(2026);
    expect(parseYear('abc', 2026)).toBe(2026);
  });
});
