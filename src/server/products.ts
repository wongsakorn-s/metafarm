import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { auditLogs, productVariants, products } from '../db/schema.ts';
import type { newVariantSchema, productTextSchema, publishSchema, variantHiddenSchema, variantSchema } from '../lib/validation.ts';
import type { SessionUser } from './auth.ts';
import { CONFLICT_ERROR } from '../lib/concurrency.ts';
import { auditIfChanged, type Saved } from './versioned.ts';
import type { Db } from './db.ts';

type Result = { ok: true } | { ok: false; error: string };
const touch = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };

const audit = (db: Db, user: SessionUser, action: string, entityId: number, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity: 'product', entityId, diff: diff ?? null });

export async function listProductsAdmin(db: Db) {
  const prods = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id));
  const variants = prods.length ? await db.select().from(productVariants).where(inArray(productVariants.productId, prods.map((p) => p.id))).orderBy(asc(productVariants.sortOrder), asc(productVariants.id)) : [];
  return prods.map((p) => ({ ...p, variants: variants.filter((v) => v.productId === p.id) }));
}

/** บันทึกราคา/สต็อก — การบันทึกราคาถือว่าเจ้าของฟาร์มยืนยันราคาแล้ว (เว็บเลิกแสดงป้าย "ราคาตัวอย่าง") */
// สต็อกเป็นค่า "ตั้งทับ" — ถ้าออเดอร์ตัด/คืนสต็อกหลังเปิดหน้านี้ (updated_at เปลี่ยน) จะไม่ทับ แต่แจ้งให้ตรวจก่อน
export async function updateVariant(db: Db, user: SessionUser, d: z.output<typeof variantSchema>): Promise<Saved> {
  const v = await db.query.productVariants.findFirst({ where: eq(productVariants.id, d.variantId) });
  if (!v) return { ok: false, error: 'ไม่พบตัวเลือกสินค้านี้' };
  const [updated] = await db.batch([
    db.update(productVariants).set({ priceThb: d.priceThb, stockQty: d.stockQty, unitCost: d.unitCost ?? null, priceConfirmed: true, ...touch })
      .where(and(eq(productVariants.id, v.id), d.version ? eq(productVariants.updatedAt, d.version) : undefined)).returning({ id: productVariants.id }),
    auditIfChanged(db, user.id, 'product.variant.update', 'product', v.productId, { variantId: v.id, price: { from: v.priceThb, to: d.priceThb }, stock: { from: v.stockQty, to: d.stockQty } }),
  ]);
  if (updated.length === 0) return { ok: false, error: CONFLICT_ERROR, conflict: true };
  return { ok: true };
}

/**
 * เพิ่มขนาด/ตัวเลือกใหม่ (เช่นน้ำผึ้ง 175 มล.) — สต็อกเริ่ม 0 (น้ำผึ้งเพิ่มจากการบรรจุขวด) · ปีเก็บเกี่ยวตามตัวเลือกล่าสุดของสินค้านั้น
 * กดซ้ำ/ส่งซ้ำ: ชื่อ+ขนาดเดิมที่ยังแสดงอยู่ = ไม่เพิ่มซ้ำ (ตรวจในคำสั่ง insert เอง)
 */
export async function addVariant(db: Db, user: SessionUser, d: z.output<typeof newVariantSchema>): Promise<Result> {
  const p = await db.query.products.findFirst({ where: eq(products.id, d.productId), columns: { id: true, category: true } });
  if (!p) return { ok: false, error: 'ไม่พบสินค้านี้' };
  // น้ำผึ้งต้องมีขนาด มล. — การบรรจุขวดและปริมาณคงเหลือในล็อตคิดจากขนาดนี้
  if (p.category === 'honey' && !d.sizeMl) return { ok: false, error: 'น้ำผึ้งต้องระบุขนาด (มล.) เพื่อใช้บรรจุขวดจากล็อต' };
  const productId = p.id, sizeMl = d.sizeMl ?? null;
  const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
  const same = sql`select 1 from product_variants x where x.product_id = ${productId} and x.hidden = 0 and lower(x.label) = lower(${d.label}) and x.size_ml is ${sizeMl}`;
  await db.batch([
    // คอลัมน์ครบตามลำดับในตาราง (drizzle insert … select): id, product_id, label, size_ml, price_thb, price_confirmed, stock_qty, unit_cost,
    // harvest_year_be, sort_order, hidden, created_at, updated_at
    db.insert(productVariants).select(sql`select null, ${productId}, ${d.label}, ${sizeMl}, ${d.priceThb}, 1, 0, null,
      (select x.harvest_year_be from product_variants x where x.product_id = ${productId} and x.harvest_year_be is not null order by x.id desc limit 1),
      coalesce((select max(x.sort_order) from product_variants x where x.product_id = ${productId}), 0) + 1, 0, ${now}, ${now}
      where not exists (${same})`),
    auditIfChanged(db, user.id, 'product.variant.add', 'product', productId, { label: d.label, sizeMl, price: d.priceThb }),
  ]);
  return { ok: true };
}

/** ซ่อน/แสดงขนาด (ขนาดที่เลิกขาย) — ไม่ลบ เพราะออเดอร์และการบรรจุเก่าอ้างถึง */
export async function setVariantHidden(db: Db, user: SessionUser, d: z.output<typeof variantHiddenSchema>): Promise<Result> {
  const v = await db.query.productVariants.findFirst({ where: eq(productVariants.id, d.variantId), columns: { id: true, productId: true, label: true } });
  if (!v) return { ok: false, error: 'ไม่พบตัวเลือกสินค้านี้' };
  await db.batch([
    db.update(productVariants).set({ hidden: d.hidden, ...touch }).where(eq(productVariants.id, v.id)),
    audit(db, user, d.hidden ? 'product.variant.hide' : 'product.variant.show', v.productId, { variantId: v.id, label: v.label }),
  ]);
  return { ok: true };
}

/** แก้คำอธิบายสินค้า (ข้อความใต้ชื่อบนเว็บ) — ว่าง = ไม่แสดง */
export async function updateProductDescription(db: Db, user: SessionUser, d: z.output<typeof productTextSchema>): Promise<Result> {
  const p = await db.query.products.findFirst({ where: eq(products.id, d.productId), columns: { id: true, description: true } });
  if (!p) return { ok: false, error: 'ไม่พบสินค้านี้' };
  await db.batch([
    db.update(products).set({ description: d.description ?? null, ...touch }).where(eq(products.id, p.id)),
    audit(db, user, 'product.description', p.id, { from: p.description, to: d.description ?? null }),
  ]);
  return { ok: true };
}

export async function setProductPublished(db: Db, user: SessionUser, d: z.output<typeof publishSchema>): Promise<Result> {
  const p = await db.query.products.findFirst({ where: eq(products.id, d.productId), columns: { id: true, published: true } });
  if (!p) return { ok: false, error: 'ไม่พบสินค้านี้' };
  await db.batch([
    db.update(products).set({ published: d.published, ...touch }).where(eq(products.id, p.id)),
    audit(db, user, d.published ? 'product.publish' : 'product.unpublish', p.id),
  ]);
  return { ok: true };
}
