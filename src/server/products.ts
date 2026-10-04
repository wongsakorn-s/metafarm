import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { auditLogs, productVariants, products } from '../db/schema.ts';
import type { publishSchema, variantSchema } from '../lib/validation.ts';
import type { SessionUser } from './auth.ts';
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
export async function updateVariant(db: Db, user: SessionUser, d: z.output<typeof variantSchema>): Promise<Result> {
  const v = await db.query.productVariants.findFirst({ where: eq(productVariants.id, d.variantId) });
  if (!v) return { ok: false, error: 'ไม่พบตัวเลือกสินค้านี้' };
  const stmts: BatchItem<'sqlite'>[] = [
    db.update(productVariants).set({ priceThb: d.priceThb, stockQty: d.stockQty, priceConfirmed: true, ...touch }).where(eq(productVariants.id, v.id)),
    audit(db, user, 'product.variant.update', v.productId, { variantId: v.id, price: { from: v.priceThb, to: d.priceThb }, stock: { from: v.stockQty, to: d.stockQty } }),
  ];
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
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
