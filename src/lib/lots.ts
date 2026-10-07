// ล็อตน้ำผึ้ง: รหัส ปริมาณคงเหลือ การเลือกล็อตตอนขาย และขนาดฉลาก (ไม่ผูกกับ runtime — ทดสอบได้)
import { z } from 'zod';
import { todayBangkok } from './validation.ts';

/** รหัสล็อต: H + ปี พ.ศ. + เดือนที่เก็บ + ลำดับในเดือน เช่น H2569-10-1 (สั้นพอพิมพ์บนฉลาก) */
export function lotPrefix(isoDate: string): string {
  return `H${Number(isoDate.slice(0, 4)) + 543}-${isoDate.slice(5, 7)}-`;
}
export function lotCode(isoDate: string, seq: number): string {
  return `${lotPrefix(isoDate)}${seq}`;
}
export function nextLotSeq(codes: string[], prefix: string): number {
  return codes.filter((c) => c.startsWith(prefix)).reduce((m, c) => Math.max(m, Number(c.slice(prefix.length)) || 0), 0) + 1;
}
export const isLotCode = (s: string) => /^H\d{4}-\d{2}-\d{1,3}$/.test(s);

/** น้ำผึ้งคงเหลือในล็อต (มล.) = ทั้งหมด − ที่บรรจุไปแล้ว */
export function remainingMl(totalMl: number, bottled: { qty: number; sizeMl: number | null }[]): number {
  return totalMl - bottled.reduce((s, b) => s + b.qty * (b.sizeMl ?? 0), 0);
}
/** บรรจุได้อีกกี่ขวดของขนาดนี้ */
export const maxBottles = (remaining: number, sizeMl: number) => (sizeMl > 0 ? Math.max(0, Math.floor(remaining / sizeMl)) : 0);

/**
 * เลือกล็อตให้ขวดที่ขาย: ล็อตเก่าก่อน (เก็บเร็วที่สุด) ที่ยังมีขวดขนาดนี้เหลือ (บรรจุ − ขายไปแล้ว)
 * คืน null ถ้าไม่มีล็อตไหนเหลือ (เช่นสต็อกที่ใส่มือก่อนเริ่มใช้ระบบล็อต)
 */
export function pickLot(lots: { id: number; harvestedTo: string; bottled: number; sold: number }[]): number | null {
  const ok = lots.filter((l) => l.bottled - l.sold > 0).sort((a, b) => a.harvestedTo.localeCompare(b.harvestedTo) || a.id - b.id);
  return ok[0]?.id ?? null;
}

// ---------- ฉลาก ----------

/** ขนาดแผ่นสติกเกอร์ A4 ที่ใช้บ่อย (มม.) — เพิ่มแบบได้ที่นี่ */
export const LABEL_SHEETS = {
  a4_40: { label: 'A4 · 40 ดวง (4×10) ดวงละ 52.5×29.7 มม.', cols: 4, rows: 10, w: 52.5, h: 29.7, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  a4_24: { label: 'A4 · 24 ดวง (3×8) ดวงละ 70×37 มม.', cols: 3, rows: 8, w: 70, h: 37, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0 },
  a4_21: { label: 'A4 · 21 ดวง (3×7) ดวงละ 70×42.3 มม.', cols: 3, rows: 7, w: 70, h: 42.3, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
} as const;
export type LabelSheet = keyof typeof LABEL_SHEETS;

// ---------- ฟอร์ม ----------

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v);
const date = z.preprocess(blank, z.iso.date('วันที่ไม่ถูกต้อง').refine((d) => d <= todayBangkok(), 'วันที่ต้องไม่เกินวันนี้'));

export const newLotSchema = z.object({
  eventIds: z.array(z.coerce.number().int().positive()).min(1, 'เลือกการเก็บน้ำหวานอย่างน้อย 1 ครั้ง'),
  note: z.preprocess(blank, z.string().max(500).optional()),
  idem: z.preprocess(blank, z.string().min(8).max(64).optional()),
});

export const bottlingSchema = z.object({
  variantId: z.coerce.number('เลือกขนาดขวด').int().positive('เลือกขนาดขวด'),
  qty: z.preprocess(blank, z.coerce.number('กรอกจำนวนขวด').int('ต้องเป็นจำนวนเต็ม').min(1, 'อย่างน้อย 1 ขวด').max(10_000)),
  bottledOn: date,
  unitCost: z.preprocess(blank, z.coerce.number('ต้องเป็นตัวเลข').int('ต้องเป็นจำนวนเต็มบาท').min(0, 'ต้องไม่ติดลบ').max(100_000).optional()),
  idem: z.preprocess(blank, z.string().min(8).max(64).optional()),
});
