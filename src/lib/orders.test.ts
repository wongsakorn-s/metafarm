import { describe, expect, it } from 'vitest';
import { canMove, customerSchema, holdBlocks, newOrderSchema, nextSeq, orderCode, orderSummaryText, orderTotal, parseOrderItems } from './orders.ts';

describe('รหัสออเดอร์', () => {
  it('S + ปี พ.ศ. + ลำดับ 3 หลัก', () => {
    expect(orderCode('2026-10-07', 1)).toBe('S2569-001');
    expect(orderCode('2027-01-02', 12)).toBe('S2570-012');
  });
  it('ลำดับถัดไปจากรหัสที่มี (ข้ามรหัสที่ลบไปได้)', () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq(['S2569-001', 'S2569-007'])).toBe(8);
  });
});

describe('สถานะ', () => {
  it('รอชำระ → ชำระแล้ว → ส่งแล้ว · ยกเลิกได้ก่อนส่ง · ส่งแล้ว/ยกเลิกแล้วเปลี่ยนไม่ได้', () => {
    expect(canMove('awaiting_payment', 'paid')).toBe(true);
    expect(canMove('awaiting_payment', 'fulfilled')).toBe(false);
    expect(canMove('paid', 'cancelled')).toBe(true);
    expect(canMove('fulfilled', 'cancelled')).toBe(false);
    expect(canMove('cancelled', 'paid')).toBe(false);
  });
});

describe('ยอดและข้อความสรุป', () => {
  const items = [{ label: 'น้ำผึ้ง 50 มล.', qty: 2, unitPrice: 250 }, { label: 'รังสมบูรณ์ A25', qty: 1, unitPrice: 1590 }];
  it('ยอดรวม = สินค้า + ค่าส่ง', () => {
    expect(orderTotal(items, 60)).toBe(2150);
  });
  it('ข้อความ LINE: รอชำระมีช่องทางชำระ · ชำระแล้วไม่มี', () => {
    const o = { code: 'S2569-001', shipFee: 60, shipMethod: 'thaipost' as const };
    const waiting = orderSummaryText({ ...o, status: 'awaiting_payment' }, items, 'MetaFarm', 'กสิกร 123-4-56789-0');
    expect(waiting).toContain('น้ำผึ้ง 50 มล. × 2 = 500 บาท');
    expect(waiting).toContain('รวมทั้งหมด 2,150 บาท');
    expect(waiting).toContain('กสิกร 123-4-56789-0');
    const paid = orderSummaryText({ ...o, status: 'paid', trackingNo: 'EF123TH' }, items, 'MetaFarm', 'กสิกร 123');
    expect(paid).not.toContain('กสิกร');
    expect(paid).toContain('ได้รับชำระเงินแล้ว');
    expect(paid).toContain('EF123TH');
  });
});

describe('ฟอร์มออเดอร์', () => {
  it('อ่านรายการ: จำนวน 0/ว่างข้าม · รังที่ติ๊ก · ราคาผิดแจ้งที่ช่อง', () => {
    const r = parseOrderItems({ qty_v1: '2', price_v1: '250', qty_v2: '0', price_v2: '550', qty_v3: '', hive_25: 'on', price_h25: '1590', hive_26: 'on', price_h26: 'abc' });
    expect(r.items).toEqual([{ kind: 'variant', id: 1, qty: 2, unitPrice: 250 }, { kind: 'hive', id: 25, qty: 1, unitPrice: 1590 }]);
    expect(r.errors).toEqual({ price_h26: 'ราคาไม่ถูกต้อง' });
  });
  const base = { customerMode: 'new', customer: { name: 'คุณเอ' }, channel: 'line', orderedOn: '2026-10-01', shipMethod: 'pickup', shipFee: '', paidNow: '', items: [{ kind: 'variant', id: 1, qty: 1, unitPrice: 250 }] };
  it('ลูกค้าใหม่ต้องมีชื่อ · ชำระแล้วต้องระบุช่องทาง · ต้องมีสินค้า', () => {
    expect(newOrderSchema.safeParse(base).success).toBe(true);
    expect(newOrderSchema.safeParse({ ...base, customer: {} }).success).toBe(false);
    expect(newOrderSchema.safeParse({ ...base, paidNow: 'on' }).success).toBe(false);
    expect(newOrderSchema.safeParse({ ...base, paidNow: 'on', payMethod: 'promptpay' }).success).toBe(true);
    expect(newOrderSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(newOrderSchema.safeParse({ ...base, customerMode: 'existing' }).success).toBe(false);
  });
  it('เบอร์ลูกค้าตรวจรูปแบบ', () => {
    expect(customerSchema.safeParse({ name: 'ก', phone: '081-234-5678' }).success).toBe(true);
    expect(customerSchema.safeParse({ name: 'ก', phone: '12' }).success).toBe(false);
  });
});

describe('holdBlocks (รังที่ผูกกับออเดอร์)', () => {
  const awaiting = { code: 'S2569-004', status: 'awaiting_payment' as const };
  const paid = { code: 'S2569-004', status: 'paid' as const };
  it('ไม่ได้ผูก/ออเดอร์ยกเลิกแล้ว → ทำได้ทุกอย่าง', () => {
    expect(holdBlocks(null, { status: 'sold' }, true)).toBeNull();
    expect(holdBlocks({ code: 'S1', status: 'cancelled' }, 'sale', true)).toBeNull();
  });
  it('รอชำระ: บันทึกขายเอง/ตั้งขายซ้ำไม่ได้ · ล่มได้', () => {
    expect(holdBlocks(awaiting, { status: 'sold' }, true)).toContain('S2569-004');
    expect(holdBlocks(awaiting, 'sale', true)).toContain('ตั้งขายซ้ำไม่ได้');
    expect(holdBlocks(awaiting, { status: 'collapsed' }, false)).toBeNull();
  });
  it('ชำระแล้ว/ส่งแล้ว: เปลี่ยนสถานะเองไม่ได้', () => {
    expect(holdBlocks(paid, { status: 'active' }, true)).toContain('ยกเลิกออเดอร์');
    expect(holdBlocks({ ...paid, status: 'fulfilled' }, { status: 'collapsed' }, true)).toContain('ส่งของแล้ว');
  });
  it('พนักงานไม่เห็นรหัสออเดอร์', () => {
    for (const h of [awaiting, paid]) expect(holdBlocks(h, { status: 'sold' }, false)).not.toMatch(/S\d{4}-/);
  });
});
