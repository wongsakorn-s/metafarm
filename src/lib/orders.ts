// กฎและตัวช่วยของออเดอร์ (ไม่ผูกกับ runtime — ทดสอบได้)
import { z } from 'zod';
import { ORDER_CHANNELS, ORDER_STATUSES, PAY_METHODS, SHIP_METHODS } from '../db/schema.ts';
import { todayBangkok } from './validation.ts';

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusLabel: Record<OrderStatus, string> = {
  awaiting_payment: 'รอชำระ',
  paid: 'ชำระแล้ว · รอส่ง',
  fulfilled: 'ส่งแล้ว',
  cancelled: 'ยกเลิก',
};
/** สีป้ายสถานะ (ข้อความ + สีเสมอ ไม่ใช้สีอย่างเดียว) */
export const orderStatusClass: Record<OrderStatus, string> = {
  awaiting_payment: 'bg-honey-100 text-honey-700',
  paid: 'bg-palm-100 text-palm-900',
  fulfilled: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-red-50 text-danger',
};
export const channelLabel: Record<(typeof ORDER_CHANNELS)[number], string> = { line: 'LINE', facebook: 'Facebook / Messenger', phone: 'โทรศัพท์', farm: 'ที่ฟาร์ม', other: 'อื่น ๆ' };
export const payMethodLabel: Record<(typeof PAY_METHODS)[number], string> = { transfer: 'โอนเข้าบัญชี', promptpay: 'พร้อมเพย์ / QR', cash: 'เงินสด', other: 'อื่น ๆ' };
export const shipMethodLabel: Record<(typeof SHIP_METHODS)[number], string> = {
  pickup: 'มารับที่ฟาร์ม',
  farm_delivery: 'ฟาร์มไปส่งเอง',
  thaipost: 'ไปรษณีย์ไทย',
  courier: 'ขนส่งเอกชน (Kerry / Flash / J&T)',
  other: 'อื่น ๆ',
};

/** การเปลี่ยนสถานะที่ทำได้ — ส่งแล้วยกเลิกไม่ได้ (ต้องคุยกับลูกค้าก่อน แก้ด้วยมือ) */
export const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};
export const canMove = (from: OrderStatus, to: OrderStatus) => NEXT[from].includes(to);

/**
 * รังที่ผูกกับออเดอร์ (hive_holds) เปลี่ยนสถานะ/ตั้งขายด้วยมือได้แค่ไหน — คืนข้อความเมื่อทำไม่ได้, null = ทำได้
 * - รอชำระ: ห้ามบันทึก "ขายแล้ว" เอง (ต้องชำระที่ออเดอร์) และห้ามตั้งขายซ้ำ · ล่มระหว่างรอ = เรื่องจริง บันทึกได้ (ออเดอร์จะชำระไม่ได้)
 * - ชำระแล้ว/ส่งแล้ว: รังขายตามออเดอร์ — ห้ามเปลี่ยนสถานะเอง (เดิมเปลี่ยนกลับเป็น "ยังอยู่" แล้วขายซ้ำได้)
 * พนักงานไม่เห็นรหัสออเดอร์ (ข้อมูลขาย) จึงได้ข้อความกลาง ๆ
 */
export function holdBlocks(hold: { code: string; status: OrderStatus } | null, change: 'sale' | { status: string }, owner: boolean): string | null {
  if (!hold || hold.status === 'cancelled') return null;
  const ref = owner ? `ออเดอร์ ${hold.code}` : 'รายการขาย';
  const tail = owner ? '' : ' — แจ้งเจ้าของฟาร์ม';
  if (hold.status === 'awaiting_payment') {
    if (change === 'sale') return `รังนี้ถูกจองใน${ref}ที่รอชำระ — ตั้งขายซ้ำไม่ได้ (ยกเลิกออเดอร์แล้วรังกลับมาตั้งขายเอง)`;
    if (change.status === 'sold') return `รังนี้ถูกจองใน${ref}ที่รอชำระ — บันทึก "ชำระแล้ว" ที่ออเดอร์แทน${tail}`;
    return null;
  }
  return hold.status === 'paid' ? `รังนี้ขายตาม${ref}แล้ว — ถ้าต้องการคืนรัง ให้ยกเลิกออเดอร์${tail}` : `รังนี้ขายตาม${ref}และส่งของแล้ว — เปลี่ยนสถานะไม่ได้${tail}`;
}

/** รหัสออเดอร์: S + ปี พ.ศ. + ลำดับ 3 หลัก (S2569-001) */
export function orderCode(isoDate: string, seq: number): string {
  return `S${Number(isoDate.slice(0, 4)) + 543}-${String(seq).padStart(3, '0')}`;
}
/** ลำดับถัดไปจากรหัสที่มีอยู่ในปีนั้น (เช่น ['S2569-001','S2569-007'] → 8) */
export function nextSeq(existingCodes: string[]): number {
  return existingCodes.reduce((m, c) => Math.max(m, Number(/-(\d+)$/.exec(c)?.[1] ?? 0)), 0) + 1;
}

export interface LineItem { label: string; qty: number; unitPrice: number }
export const subtotal = (items: LineItem[]) => items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
export const orderTotal = (items: LineItem[], shipFee: number) => subtotal(items) + shipFee;

const baht = (n: number) => `${n.toLocaleString('th-TH')} บาท`;
/** ข้อความสรุปออเดอร์สำหรับคัดลอกไปวางในแชตกับลูกค้า (LINE / Messenger) */
export function orderSummaryText(o: { code: string; status: OrderStatus; shipFee: number; shipMethod: keyof typeof shipMethodLabel; trackingNo?: string | null }, items: LineItem[], farmName: string, paymentInfo?: string): string {
  const lines = [`สรุปออเดอร์ ${o.code} · ${farmName}`, ''];
  for (const i of items) lines.push(`• ${i.label}${i.qty > 1 ? ` × ${i.qty}` : ''} = ${baht(i.qty * i.unitPrice)}`);
  if (o.shipFee > 0) lines.push(`• ค่าส่ง = ${baht(o.shipFee)}`);
  lines.push('', `รวมทั้งหมด ${baht(orderTotal(items, o.shipFee))}`, `การรับสินค้า: ${shipMethodLabel[o.shipMethod]}`);
  if (o.trackingNo) lines.push(`เลขพัสดุ: ${o.trackingNo}`);
  if (o.status === 'awaiting_payment' && paymentInfo?.trim()) lines.push('', 'ช่องทางชำระเงิน', paymentInfo.trim());
  if (o.status !== 'awaiting_payment' && o.status !== 'cancelled') lines.push('', 'ได้รับชำระเงินแล้ว ขอบคุณครับ/ค่ะ');
  return lines.join('\n');
}

// ---------- ฟอร์ม ----------

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());
/** จำนวนเงินบาท · ช่องว่าง = 0 */
const money = (msg = 'ต้องเป็นจำนวนเต็มบาท ไม่ติดลบ') => z.preprocess((v) => blank(v) ?? 0, z.coerce.number(msg).int(msg).min(0, msg).max(10_000_000, 'มากเกินไป'));
const date = z.preprocess(blank, z.iso.date('วันที่ไม่ถูกต้อง').refine((d) => d <= todayBangkok(), 'วันที่ต้องไม่เกินวันนี้'));
const phone = opt(z.string().refine((s) => /^[0-9+\-\s()]{8,20}$/.test(s) && s.replace(/\D/g, '').length >= 8, 'เบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678)'));

export const customerSchema = z.object({
  name: z.preprocess(blank, z.string('กรอกชื่อลูกค้า').min(1, 'กรอกชื่อลูกค้า').max(100)),
  phone,
  lineName: opt(z.string().max(60)),
  address: opt(z.string().max(500)),
  notes: opt(z.string().max(1000)),
});

/**
 * ฟอร์มออเดอร์ใหม่ — รายการส่งมาเป็นช่องชื่อ qty_v<variantId>, price_v<variantId>, hive_<hiveId> (ติ๊ก), price_h<hiveId>
 * (แปลงเป็น items ก่อนตรวจด้วย parseOrderItems)
 */
export const newOrderSchema = z
  .object({
    customerMode: z.enum(['existing', 'new']),
    customerId: opt(z.coerce.number().int().positive()),
    customer: customerSchema.partial().optional(),
    channel: z.enum(ORDER_CHANNELS),
    orderedOn: date,
    shipMethod: z.enum(SHIP_METHODS),
    shipFee: money(),
    note: opt(z.string().max(1000)),
    paidNow: z.preprocess((v) => v === 'on' || v === '1', z.boolean()),
    payMethod: opt(z.enum(PAY_METHODS)),
    idem: opt(z.string().min(8).max(64)),
    items: z.array(z.object({ kind: z.enum(['variant', 'hive']), id: z.number().int().positive(), qty: z.number().int().min(1).max(10_000), unitPrice: z.number().int().min(0).max(10_000_000) })).min(1, 'เลือกสินค้าอย่างน้อย 1 รายการ'),
  })
  .superRefine((d, ctx) => {
    if (d.customerMode === 'existing' && !d.customerId) ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'เลือกลูกค้า หรือเลือก "ลูกค้าใหม่"' });
    if (d.customerMode === 'new' && !d.customer?.name) ctx.addIssue({ code: 'custom', path: ['customer.name'], message: 'กรอกชื่อลูกค้า' });
    if (d.paidNow && !d.payMethod) ctx.addIssue({ code: 'custom', path: ['payMethod'], message: 'เลือกช่องทางที่ลูกค้าชำระ' });
  });

/** อ่านรายการสินค้าจากฟอร์ม · คืน error ต่อช่อง ถ้าจำนวน/ราคาไม่ถูกต้อง */
export function parseOrderItems(form: Record<string, string>): { items: { kind: 'variant' | 'hive'; id: number; qty: number; unitPrice: number }[]; errors: Record<string, string> } {
  const items: { kind: 'variant' | 'hive'; id: number; qty: number; unitPrice: number }[] = [];
  const errors: Record<string, string> = {};
  const int = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s));
  for (const [k, v] of Object.entries(form)) {
    let m = /^qty_v(\d+)$/.exec(k);
    if (m) {
      const qty = int(v);
      if (v.trim() === '' || qty === 0) continue;
      const price = int(form[`price_v${m[1]}`]);
      if (!Number.isInteger(qty) || qty < 0) { errors[k] = 'จำนวนต้องเป็นจำนวนเต็ม'; continue; }
      if (!Number.isInteger(price) || price < 0) { errors[`price_v${m[1]}`] = 'ราคาไม่ถูกต้อง'; continue; }
      items.push({ kind: 'variant', id: Number(m[1]), qty, unitPrice: price });
      continue;
    }
    m = /^hive_(\d+)$/.exec(k);
    if (m && (v === 'on' || v === '1')) {
      const price = int(form[`price_h${m[1]}`]);
      if (!Number.isInteger(price) || price < 0) { errors[`price_h${m[1]}`] = 'ราคาไม่ถูกต้อง'; continue; }
      items.push({ kind: 'hive', id: Number(m[1]), qty: 1, unitPrice: price });
    }
  }
  return { items, errors };
}

export const payOrderSchema = z.object({ paidOn: date, payMethod: z.enum(PAY_METHODS) });
export const fulfillOrderSchema = z.object({ fulfilledOn: date, trackingNo: opt(z.string().max(60)) });
