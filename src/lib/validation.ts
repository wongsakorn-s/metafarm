import { z } from 'zod';
import { BOX_TYPES, HIVE_ORIGINS, HIVE_STATUSES } from '../db/schema.ts';

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export const todayBangkok = (now = new Date()) =>
  new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** ช่องฟอร์มว่าง → undefined */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());

const date = z.preprocess(
  blank,
  z.iso.date('วันที่ไม่ถูกต้อง').refine((d) => d <= todayBangkok(), 'วันที่ต้องไม่เกินวันนี้'),
);
const int = (max: number) => z.preprocess(blank, z.coerce.number('ต้องเป็นตัวเลข').int('ต้องเป็นจำนวนเต็ม').min(0, 'ต้องไม่ติดลบ').max(max, `ต้องไม่เกิน ${max.toLocaleString()}`));
const hiveCode = z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string().regex(/^A\d{1,5}$/, 'รหัสรังต้องเป็นรูปแบบ A123'));
const note = opt(z.string().max(1000, 'ยาวเกิน 1,000 ตัวอักษร'));
const idem = opt(z.string().min(8).max(64));

export const honeyHarvestSchema = z
  .object({
    occurredOn: date,
    honeyMl: opt(int(100_000)),
    propolisG: opt(int(100_000)),
    pollenG: opt(int(100_000)),
    note,
    idem,
  })
  .refine((d) => (d.honeyMl ?? 0) + (d.propolisG ?? 0) + (d.pollenG ?? 0) > 0, {
    message: 'กรอกปริมาณอย่างน้อย 1 ช่อง (น้ำผึ้ง มล. / ชัน กรัม / เกสร กรัม)',
    path: ['honeyMl'],
  });

export const queenCellSchema = z.object({
  occurredOn: date,
  queenCells: int(1000).refine((n) => n >= 1, 'ต้องมีอย่างน้อย 1 ใบ'),
  targetCode: opt(hiveCode),
  note,
  idem,
});

export const broodSplitSchema = z.object({ occurredOn: date, targetCode: opt(hiveCode), note, idem });

export const noteSchema = z.object({ occurredOn: date, note: z.preprocess(blank, z.string('กรอกหมายเหตุ').max(1000)), idem, isPublic: z.preprocess((v) => v === 'on' || v === '1', z.boolean()) });

export const statusSchema = z
  .object({
    status: z.enum(HIVE_STATUSES),
    occurredOn: date,
    soldPrice: opt(int(1_000_000)),
    collapseReason: opt(z.string().max(300)),
    note,
    idem,
  })
  .refine((d) => d.status !== 'unknown', { message: 'เลือกสถานะที่ทราบแล้ว', path: ['status'] });

export const saleSchema = z
  .object({ forSale: z.preprocess((v) => v === 'on' || v === '1', z.boolean()), salePrice: opt(int(1_000_000)) })
  .refine((d) => !d.forSale || (d.salePrice ?? 0) > 0, { message: 'ตั้งขายต้องใส่ราคา', path: ['salePrice'] });

export const newHiveSchema = z.object({
  origin: z.enum(HIVE_ORIGINS).refine((o) => o !== 'unknown', 'เลือกที่มา'),
  originPlace: opt(z.string().max(100)),
  acquiredOn: opt(date),
  queenBornOn: opt(date),
  boxType: z.enum(BOX_TYPES).default('teak_2room'),
  queenSourceCode: opt(hiveCode),
  broodSourceCode: opt(hiveCode),
  purchasePrice: opt(int(1_000_000)),
  notes: opt(z.string().max(1000)),
  idem,
});

/** แก้ไขข้อมูลรัง: ช่องที่เว้นว่าง = ล้างค่า (ฟอร์มส่งทุกช่องเสมอ) */
export const editHiveSchema = z.object({
  origin: z.enum(HIVE_ORIGINS),
  originPlace: opt(z.string().max(100)),
  acquiredOn: opt(date),
  queenBornOn: opt(date),
  boxType: z.enum(BOX_TYPES),
  queenSourceCode: opt(hiveCode),
  broodSourceCode: opt(hiveCode),
  purchasePrice: opt(int(1_000_000)),
  collapseReason: opt(z.string().max(300)),
  publicNote: opt(z.string().max(500, 'ยาวเกิน 500 ตัวอักษร')),
  notes: opt(z.string().max(2000, 'ยาวเกิน 2,000 ตัวอักษร')),
});

export type FieldErrors = Record<string, string>;

/** แปลงผล Zod เป็นข้อความต่อช่อง (ใช้แสดงใต้ฟอร์ม) */
export function fieldErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const i of err.issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, form: FormData): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const r = schema.safeParse(Object.fromEntries(form));
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: fieldErrors(r.error) };
}
