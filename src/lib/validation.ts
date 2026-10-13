import { z } from 'zod';
import { BOX_TYPES, HIVE_ORIGINS, HIVE_STATUSES } from '../db/schema.ts';
import { HIVE_CODE_RE, normalizeHiveCode } from './hive-code.ts';

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
// รหัสรัง: ตัวอักษร + เลข (A25, B12, G108) — แปลงด้วย normalizeHiveCode (ตัวเล็ก/ขีด/0 นำหน้า) · ดู src/lib/hive-code.ts
const CODE_MSG = 'รหัสรังเป็นตัวอักษรอังกฤษตามด้วยเลข เช่น A25, B12, G108';
const hiveCode = z.preprocess((v) => (typeof v === 'string' ? (normalizeHiveCode(v) ?? v.trim()) : v), z.string().regex(HIVE_CODE_RE, CODE_MSG));
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
  .object({
    forSale: z.preprocess((v) => v === 'on' || v === '1', z.boolean()),
    salePrice: opt(int(1_000_000)),
    /** การตั้งขายที่ฟอร์มเห็นตอนเปิดหน้า "<0|1>:<ราคา>" — อีกคนเปลี่ยนไปก่อน = ไม่ทับ (saleSeen ใน src/lib/orders.ts) */
    seen: opt(z.string().max(40)),
  })
  .refine((d) => !d.forSale || (d.salePrice ?? 0) > 0, { message: 'ตั้งขายต้องใส่ราคา', path: ['salePrice'] });

/** รหัสรังที่ตั้งเอง (ตรงกับป้ายบนตัวรัง) — ต้องมีตัวอักษรนำหน้า (พิมพ์แค่เลขแยก A12 กับ B12 ไม่ได้) */
const newHiveCode = z.preprocess(
  (v) => (typeof v === 'string' ? (normalizeHiveCode(v) ?? v.trim()) : v),
  z.string().regex(HIVE_CODE_RE, `${CODE_MSG} (ใส่ตัวอักษรนำหน้าด้วย)`),
);

export const newHiveSchema = z.object({
  /** ว่าง หรือเท่ากับรหัสที่ระบบเสนอ (suggested) = ใช้รหัสถัดไปอัตโนมัติ */
  code: opt(newHiveCode),
  suggested: opt(z.string().max(10)),
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

/** กรอกข้อมูลที่ยังไม่ครบ (???) — ทุกช่องไม่บังคับ ส่งมาเฉพาะที่รู้ */
export const fillSchema = z.object({
  queenBornOn: opt(date),
  acquiredOn: opt(date),
  queenSourceCode: opt(hiveCode),
  broodSourceCode: opt(hiveCode),
  status: z.preprocess(blank, z.enum(['active', 'sold', 'collapsed']).optional()),
});

/** แก้ราคา/สต็อกของตัวเลือกสินค้า */
export const variantSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  priceThb: int(1_000_000).refine((n) => n >= 1, 'ราคาต้องมากกว่า 0'),
  stockQty: int(100_000),
  /** ต้นทุนต่อชิ้น — ว่างได้ (ยังไม่รู้) */
  unitCost: opt(int(1_000_000)),
  /** updated_at ของแถวที่ฟอร์มเห็น — สต็อกเปลี่ยนจากออเดอร์ระหว่างนั้นก็นับว่าชน */
  version: opt(z.string().max(40)),
});

/** เพิ่มขนาด/ตัวเลือกสินค้า (เช่นน้ำผึ้ง 175 มล.) — ราคาที่เจ้าของกรอกเองถือว่ายืนยันแล้ว */
export const newVariantSchema = z.object({
  productId: z.coerce.number().int().positive(),
  label: z.preprocess(blank, z.string('กรอกชื่อตัวเลือก เช่น "ขวด 175 มล."').min(1).max(60, 'ยาวเกิน 60 ตัวอักษร')),
  sizeMl: opt(z.coerce.number('ต้องเป็นตัวเลข').int('ต้องเป็นจำนวนเต็ม').min(1, 'ต้องมากกว่า 0').max(10_000, 'ต้องไม่เกิน 10,000')),
  priceThb: int(1_000_000).refine((n) => n >= 1, 'ราคาต้องมากกว่า 0'),
});

/** คำอธิบายสินค้าใต้ชื่อบนเว็บ (เช่นเมื่อเหลือขนาดเดียว ข้อความ "มีสองขนาด" ต้องแก้ได้เอง) */
export const productTextSchema = z.object({
  productId: z.coerce.number().int().positive(),
  description: opt(z.string().max(300, 'ยาวเกิน 300 ตัวอักษร')),
});

export const variantHiddenSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  hidden: z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean()),
});

export const publishSchema = z.object({
  productId: z.coerce.number().int().positive(),
  published: z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean()),
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
  /** updated_at ที่ฟอร์มเห็นตอนเปิด (กันเขียนทับกัน — ดู src/lib/concurrency.ts) */
  version: opt(z.string().max(40)),
  /** คู่ค้า (เจ้าของ/แอดมินเท่านั้น): none = ไม่ระบุ · เลข = เลือกคู่ค้า · new = เพิ่มใหม่ */
  supplierChoice: opt(z.string().regex(/^(new|none|\d{1,9})$/)),
  /** คู่ค้าที่ฟอร์มแสดงตอนเปิด + เวอร์ชัน (updated_at) — ช่องแก้ไขด้านล่างใช้กับรายนี้เสมอ แม้เปลี่ยนตัวเลือกแล้ว */
  supplierEditId: opt(int(999_999_999)),
  supplierVersion: opt(z.string().max(40)),
  supplierName: opt(z.string().max(100)),
  supplierPhone: opt(z.string().max(40)),
  supplierArea: opt(z.string().max(100)),
  supplierNotes: opt(z.string().max(500, 'ยาวเกิน 500 ตัวอักษร')),
  newSupplierName: opt(z.string().max(100)),
  newSupplierPhone: opt(z.string().max(40)),
  newSupplierArea: opt(z.string().max(100)),
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
