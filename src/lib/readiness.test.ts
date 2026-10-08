import { describe, expect, it } from 'vitest';
import { buildChecklist, type ReadinessInput } from './readiness.ts';

const ready: ReadinessInput = { heroChosen: true, contactConfirmed: true, unconfirmedPrices: 0, unconfirmedCourses: 0, productsWithoutImage: 0, activeHivesWithoutPhoto: 0, incompleteHives: 0, saleHivesNotReady: 0 };

describe('buildChecklist', () => {
  it('ทุกอย่างพร้อม → 100% ไม่มีงานค้างระดับ must', () => {
    const r = buildChecklist(ready);
    expect(r).toMatchObject({ done: 8, total: 8, percent: 100, mustLeft: 0 });
    expect(r.items.every((x) => x.done)).toBe(true);
  });

  it('สถานะปัจจุบันของโปรเจกต์ (ตัวอย่างทั้งหมด) → ติดตามจำนวนที่ค้างได้', () => {
    const r = buildChecklist({ contactConfirmed: false, unconfirmedPrices: 3, unconfirmedCourses: 2, productsWithoutImage: 2, activeHivesWithoutPhoto: 22, incompleteHives: 9, saleHivesNotReady: 0 });
    expect(r.done).toBe(1); // เหลือแค่ "รังที่ตั้งขาย" ที่ผ่านเพราะยังไม่มีรังตั้งขาย
    expect(r.mustLeft).toBe(2); // ช่องทางติดต่อ + ราคา
    expect(r.items.find((x) => x.id === 'hivePhotos')).toMatchObject({ done: false, count: 22, href: '/admin/photos' });
    expect(r.items.find((x) => x.id === 'incomplete')?.href).toBe('/admin/todo');
    expect(r.percent).toBe(13); // 1 ใน 8 รายการ
  });

  it('แต่ละรายการมีลิงก์ไปแก้ และข้อความอธิบายตรงกับจำนวน', () => {
    const r = buildChecklist({ ...ready, activeHivesWithoutPhoto: 5, incompleteHives: 1 });
    for (const it of r.items) expect(it.href.startsWith('/admin/')).toBe(true);
    expect(r.items.find((x) => x.id === 'hivePhotos')?.detail).toContain('5 รัง');
    expect(r.items.find((x) => x.id === 'incomplete')?.detail).toContain('1 รัง');
    expect(r.items.find((x) => x.id === 'contact')?.level).toBe('must');
  });
});
