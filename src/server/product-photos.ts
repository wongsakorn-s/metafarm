// รูปสินค้า (หลังบ้าน /admin/products) — อัปโหลด ลบ เรียงลำดับ · รูปแรกซิงก์ไป products.image_key (รูปปกในการ์ด/รายการ)
// หน้าสาธารณะอ่านผ่าน getPublicProducts ใน src/server/public.ts
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { auditLogs, productPhotos, products } from '../db/schema.ts';
import { detectImageType, MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, stripMetadata, imageKeysOf } from '../lib/media.ts';
import { productPhotoKey, productPhotoLimit } from '../lib/product-photos.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';
import { putVariants, type Skipped } from './media.ts';

export type ProductPhotoRow = typeof productPhotos.$inferSelect;

const audit = (db: Db, user: SessionUser, action: string, productId: number, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity: 'product', entityId: productId, diff: diff ?? null });

/** รูปปก = รูปแรก (เลขมากสุด; รูปที่เพิ่มทีหลังต่อท้าย) — ใช้ในชุดคำสั่งเดียวกับการเปลี่ยนรูป เพื่อไม่ให้รูปปกกับรายการรูปไม่ตรงกัน */
const syncCover = (db: Db, productId: number) =>
  db.update(products).set({
    imageKey: sql`(select r2_key from product_photos where product_id = ${productId} order by sort_order desc, id desc limit 1)`,
    updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  }).where(eq(products.id, productId));

/** รูปของทุกสินค้า (หลังบ้าน) รูปแรกก่อน */
export async function listProductPhotos(db: Db): Promise<ProductPhotoRow[]> {
  return db.select().from(productPhotos).orderBy(asc(productPhotos.productId), desc(productPhotos.sortOrder), desc(productPhotos.id));
}

export async function uploadProductPhotos(
  db: Db,
  bucket: R2Bucket,
  user: SessionUser,
  productId: number,
  files: File[],
  opts: { batch?: string; thumbs?: File[]; mediums?: File[] } = {},
): Promise<{ added: number; skipped: Skipped[]; error?: string }> {
  const p = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { id: true, slug: true, category: true } });
  if (!p) return { added: 0, skipped: [], error: 'ไม่พบสินค้านี้' };
  const max = productPhotoLimit(p.category);
  const skipped: Skipped[] = [];
  let added = 0;
  const batchId = opts.batch && /^[0-9a-f-]{36}$/.test(opts.batch) ? opts.batch : null;
  const [stat] = await db.select({ n: sql<number>`count(*)`, low: sql<number>`coalesce(min(${productPhotos.sortOrder}), 1)` }).from(productPhotos).where(eq(productPhotos.productId, p.id));
  let slots = max - (stat?.n ?? 0);
  // รูปใหม่ต่อท้ายรายการ (เลขน้อยสุด) — รูปปกไม่เปลี่ยนเมื่อเพิ่มรูป ต้องการเปลี่ยนให้ลากเรียงเอง
  let order = (stat?.low ?? 1) - 1;
  const exists = async (key: string) => (await db.select({ id: productPhotos.id }).from(productPhotos).where(eq(productPhotos.r2Key, key)).limit(1)).length > 0;

  for (const [i, file] of files.entries()) {
    const name = file.name || `ไฟล์ที่ ${i + 1}`;
    if (i >= MAX_FILES_PER_REQUEST) { skipped.push({ name, reason: `ครั้งละไม่เกิน ${MAX_FILES_PER_REQUEST} ไฟล์` }); continue; }
    if (file.size === 0) { skipped.push({ name, reason: 'ไฟล์ว่าง' }); continue; }
    if (file.size > MAX_UPLOAD_BYTES) { skipped.push({ name, reason: `ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) { skipped.push({ name, reason: 'ไม่ใช่รูป JPEG/PNG/WebP' }); continue; }

    const key = productPhotoKey(p.slug, batchId ? `${batchId}-${i}` : crypto.randomUUID(), type.ext);
    if (batchId && (await exists(key))) { added++; continue; } // บันทึกไว้แล้วจากครั้งก่อน
    if (slots <= 0) { skipped.push({ name, reason: `สินค้านี้ใส่ได้ไม่เกิน ${max} รูป — ลบรูปเก่าก่อน` }); continue; }

    await bucket.put(key, stripMetadata(bytes), { httpMetadata: { contentType: type.mime } });
    await putVariants(bucket, key, opts.thumbs?.[i], opts.mediums?.[i]);
    try {
      await db.batch([
        db.insert(productPhotos).values({ productId: p.id, r2Key: key, sortOrder: order, createdBy: user.id }),
        syncCover(db, p.id),
        audit(db, user, 'product.photo.add', p.id, { key }),
      ]);
    } catch (e) {
      if (batchId && (await exists(key))) { added++; continue; } // คำขอชุดเดิมที่มาพร้อมกันบันทึกไปแล้ว — ไฟล์เป็นของแถวนั้น ห้ามลบ
      await bucket.delete(imageKeysOf(key)).catch(() => {});
      throw e;
    }
    added++; slots--; order--;
  }
  return { added, skipped };
}

type OrderRow = { id: number; sortOrder: number };
const photoRows = (db: Db, productId: number): Promise<OrderRow[]> =>
  db.select({ id: productPhotos.id, sortOrder: productPhotos.sortOrder }).from(productPhotos)
    .where(eq(productPhotos.productId, productId)).orderBy(desc(productPhotos.sortOrder), desc(productPhotos.id));

/** เรียงเลขใหม่ทั้งสินค้า (บนสุด = เลขมากสุด) — เขียนทุกรูปทุกครั้ง ไม่มีเลขซ้ำแม้สองเครื่องเรียงพร้อมกัน (ดู gallery.ts) */
async function applyOrder(db: Db, user: SessionUser, productId: number, rows: OrderRow[], order: number[], action: string, diff: unknown) {
  const target = order.map((photoId, i) => ({ photoId, n: order.length - i }));
  const byId = new Map(rows.map((r) => [r.id, r.sortOrder]));
  if (target.every((x) => byId.get(x.photoId) === x.n)) return;
  const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
  const stmts = [
    ...target.map((x) => db.update(productPhotos).set({ sortOrder: x.n, updatedAt: now }).where(eq(productPhotos.id, x.photoId))),
    syncCover(db, productId),
    audit(db, user, action, productId, diff),
  ];
  await db.batch(stmts as unknown as [(typeof stmts)[0], ...(typeof stmts)[number][]]);
}

/** ลากวางเรียงรูป: ids = ลำดับใหม่ (บนสุดก่อน) · รูปที่ไม่อยู่ในรายการ (เพิ่งอัปโหลด) ขึ้นบนสุด · id ของสินค้าอื่น/ที่ลบแล้วถูกข้าม */
export async function reorderProductPhotos(db: Db, user: SessionUser, productId: number, ids: number[]): Promise<{ ok: boolean; error?: string }> {
  const rows = await photoRows(db, productId);
  const known = new Set(rows.map((r) => r.id));
  const wanted = [...new Set(ids)].filter((id) => known.has(id));
  if (!wanted.length) return { ok: false, error: 'ไม่พบรูปในรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  const rest = rows.map((r) => r.id).filter((id) => !wanted.includes(id));
  await applyOrder(db, user, productId, rows, [...rest, ...wanted], 'product.photo.reorder', { count: wanted.length });
  return { ok: true };
}

/** เลื่อนทีละตำแหน่ง/ไปบนสุด — ใช้เมื่อไม่มี JavaScript */
export async function moveProductPhoto(db: Db, user: SessionUser, photoId: number, dir: 'up' | 'down' | 'top'): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.productPhotos.findFirst({ where: eq(productPhotos.id, photoId), columns: { id: true, productId: true } });
  if (!row) return { ok: false, error: 'ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)' };
  const rows = await photoRows(db, row.productId);
  const from = rows.findIndex((r) => r.id === photoId);
  const to = dir === 'top' ? 0 : dir === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length || to === from) return { ok: true };
  const order = rows.map((r) => r.id);
  order.splice(to, 0, order.splice(from, 1)[0]!);
  await applyOrder(db, user, row.productId, rows, order, 'product.photo.move', { id: photoId, dir, from: from + 1, to: to + 1 });
  return { ok: true };
}

/** ลบรูป (รูปเต็ม + รูปย่อ) — รูปที่สำรองไว้แล้วยังอยู่ใน metafarm-backups */
export async function deleteProductPhoto(db: Db, bucket: R2Bucket, user: SessionUser, photoId: number): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.productPhotos.findFirst({ where: eq(productPhotos.id, photoId) });
  if (!row) return { ok: true }; // ลบไปแล้ว (กดซ้ำ)
  await db.batch([
    db.delete(productPhotos).where(and(eq(productPhotos.id, row.id))),
    syncCover(db, row.productId),
    audit(db, user, 'product.photo.delete', row.productId, { key: row.r2Key }),
  ]);
  await bucket.delete(imageKeysOf(row.r2Key)).catch(() => {});
  return { ok: true };
}
