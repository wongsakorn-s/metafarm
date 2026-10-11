// รูปหน้า Gallery (หลังบ้าน /admin/gallery) — อัปโหลด ลบ แก้คำบรรยาย · หน้าสาธารณะอ่านผ่าน getGallery ใน src/server/public.ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { auditLogs, galleryPhotos } from '../db/schema.ts';
import { GALLERY_MAX_PER_CATEGORY, galleryCategory, galleryKey, type GalleryCategory } from '../lib/gallery.ts';
import { detectImageType, MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, stripMetadata, thumbKeyOf } from '../lib/media.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';
import { validThumb, type Skipped } from './media.ts';

export type GalleryRow = typeof galleryPhotos.$inferSelect;

const audit = (db: Db, user: SessionUser, action: string, entityId: number | null, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity: 'gallery', entityId, diff: diff ?? null });

/** ทุกรูป (หลังบ้าน) ใหม่ก่อนในแต่ละหมวด */
export async function listGalleryAdmin(db: Db): Promise<GalleryRow[]> {
  return db.select().from(galleryPhotos).orderBy(galleryPhotos.category, desc(galleryPhotos.sortOrder), desc(galleryPhotos.id));
}

/**
 * อัปโหลดรูปเข้าหมวด: ตรวจชนิดจากไบต์จริง ขนาด และจำนวนต่อหมวด · ลบ GPS/ข้อมูลกล้องก่อนเก็บ (รูปขึ้นหน้าสาธารณะ)
 * batch = รหัสชุดจากเบราว์เซอร์ — ส่งชุดเดิมซ้ำ (เน็ตหลุด/คิวรอส่ง) ไม่บันทึกรูปซ้ำ (คีย์ {batch}-{i})
 */
export async function uploadGalleryPhotos(
  db: Db,
  bucket: R2Bucket,
  user: SessionUser,
  category: GalleryCategory,
  files: File[],
  opts: { batch?: string; thumbs?: File[]; caption?: string } = {},
): Promise<{ added: number; skipped: Skipped[] }> {
  const skipped: Skipped[] = [];
  let added = 0;
  const batchId = opts.batch && /^[0-9a-f-]{36}$/.test(opts.batch) ? opts.batch : null;
  const [stat] = await db.select({ n: sql<number>`count(*)`, top: sql<number>`coalesce(max(${galleryPhotos.sortOrder}), 0)` }).from(galleryPhotos).where(eq(galleryPhotos.category, category));
  let slots = GALLERY_MAX_PER_CATEGORY - (stat?.n ?? 0);
  let order = (stat?.top ?? 0) + 1;
  const exists = async (key: string) => (await db.select({ id: galleryPhotos.id }).from(galleryPhotos).where(eq(galleryPhotos.r2Key, key)).limit(1)).length > 0;

  for (const [i, file] of files.entries()) {
    const name = file.name || `ไฟล์ที่ ${i + 1}`;
    if (i >= MAX_FILES_PER_REQUEST) { skipped.push({ name, reason: `ครั้งละไม่เกิน ${MAX_FILES_PER_REQUEST} ไฟล์` }); continue; }
    if (file.size === 0) { skipped.push({ name, reason: 'ไฟล์ว่าง' }); continue; }
    if (file.size > MAX_UPLOAD_BYTES) { skipped.push({ name, reason: `ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) { skipped.push({ name, reason: 'ไม่ใช่รูป JPEG/PNG/WebP' }); continue; }

    const key = galleryKey(category, batchId ? `${batchId}-${i}` : crypto.randomUUID(), type.ext);
    if (batchId && (await exists(key))) { added++; continue; } // บันทึกไว้แล้วจากครั้งก่อน
    if (slots <= 0) { skipped.push({ name, reason: `หมวดนี้เต็มแล้ว (สูงสุด ${GALLERY_MAX_PER_CATEGORY} รูป — ลบรูปเก่าก่อน)` }); continue; }

    await bucket.put(key, stripMetadata(bytes), { httpMetadata: { contentType: type.mime } });
    const thumb = await validThumb(opts.thumbs?.[i]);
    if (thumb) await bucket.put(thumbKeyOf(key), thumb.bytes, { httpMetadata: { contentType: thumb.mime } });
    try {
      await db.batch([
        db.insert(galleryPhotos).values({ category, r2Key: key, caption: opts.caption ?? null, sortOrder: order, createdBy: user.id }),
        audit(db, user, 'gallery.add', null, { category, key }),
      ]);
    } catch (e) {
      // คำขอชุดเดิมที่มาพร้อมกันบันทึกคีย์นี้ไปแล้ว → ไฟล์ใน R2 เป็นของแถวนั้น ห้ามลบ
      if (batchId && (await exists(key))) { added++; continue; }
      await bucket.delete([key, thumbKeyOf(key)]).catch(() => {});
      throw e;
    }
    added++; slots--; order++;
  }
  return { added, skipped };
}

export type MoveDir = 'up' | 'down' | 'top';

type OrderRow = { id: number; sortOrder: number };

/** รูปทั้งหมวดตามลำดับที่แสดง (บนสุดก่อน) */
const categoryRows = (db: Db, category: GalleryCategory): Promise<OrderRow[]> =>
  db.select({ id: galleryPhotos.id, sortOrder: galleryPhotos.sortOrder }).from(galleryPhotos)
    .where(eq(galleryPhotos.category, category)).orderBy(desc(galleryPhotos.sortOrder), desc(galleryPhotos.id));

/**
 * เรียงเลขใหม่ทั้งหมวดตามลำดับ order (บนสุด = เลขมากสุด) ในรอบเดียว — เขียนเฉพาะรูปที่เลขเปลี่ยน
 * เรียงทั้งหมวดทุกครั้ง จึงไม่มีเลขซ้ำ/หาย แม้สองเครื่องจัดลำดับพร้อมกัน (คนหลังชนะ แต่ลำดับยังสมบูรณ์)
 */
async function applyOrder(db: Db, user: SessionUser, category: GalleryCategory, rows: OrderRow[], order: number[], action: string, diff: unknown) {
  const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
  const byId = new Map(rows.map((r) => [r.id, r.sortOrder]));
  const changed = order.map((photoId, i) => ({ photoId, n: order.length - i })).filter((x) => byId.get(x.photoId) !== x.n);
  if (!changed.length) return;
  const stmts = [
    ...changed.map((x) => db.update(galleryPhotos).set({ sortOrder: x.n, updatedAt: now }).where(eq(galleryPhotos.id, x.photoId))),
    audit(db, user, action, null, { category, ...(diff as object) }),
  ];
  await db.batch(stmts as unknown as [(typeof stmts)[0], ...(typeof stmts)[number][]]);
}

/**
 * ลากวางเรียงรูปทั้งหมวด: ids = ลำดับใหม่ที่หน้าเว็บส่งมา (บนสุดก่อน)
 * รูปที่ไม่อยู่ในรายการ (อัปโหลดเข้ามาระหว่างที่จัดลำดับอยู่) ขึ้นไว้บนสุด · id ของหมวดอื่น/ที่ถูกลบแล้วถูกข้าม
 */
export async function reorderGalleryPhotos(db: Db, user: SessionUser, category: GalleryCategory, ids: number[]): Promise<{ ok: boolean; error?: string }> {
  const rows = await categoryRows(db, category);
  const known = new Set(rows.map((r) => r.id));
  const wanted = [...new Set(ids)].filter((id) => known.has(id));
  if (!wanted.length) return { ok: false, error: 'ไม่พบรูปในรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  const rest = rows.map((r) => r.id).filter((id) => !wanted.includes(id));
  await applyOrder(db, user, category, rows, [...rest, ...wanted], 'gallery.reorder', { count: wanted.length });
  return { ok: true };
}

/** เลื่อนทีละตำแหน่ง/ไปบนสุด — ใช้เมื่อไม่มี JavaScript (ปุ่มใน noscript) */
export async function moveGalleryPhoto(db: Db, user: SessionUser, id: number, dir: MoveDir): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.galleryPhotos.findFirst({ where: eq(galleryPhotos.id, id), columns: { id: true, category: true } });
  if (!row) return { ok: false, error: 'ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)' };
  const rows = await categoryRows(db, row.category);
  const from = rows.findIndex((r) => r.id === id);
  const to = dir === 'top' ? 0 : dir === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length || to === from) return { ok: true }; // อยู่ปลายทางแล้ว (กดซ้ำ/อีกเครื่องเลื่อนไปก่อน)
  const order = rows.map((r) => r.id);
  order.splice(to, 0, order.splice(from, 1)[0]!);
  await applyOrder(db, user, row.category, rows, order, 'gallery.move', { id, dir, from: from + 1, to: to + 1 });
  return { ok: true };
}

export async function updateGalleryCaption(db: Db, user: SessionUser, id: number, caption: string | undefined): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.galleryPhotos.findFirst({ where: eq(galleryPhotos.id, id), columns: { id: true } });
  if (!row) return { ok: false, error: 'ไม่พบรูปนี้' };
  await db.batch([
    db.update(galleryPhotos).set({ caption: caption ?? null, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` }).where(eq(galleryPhotos.id, row.id)),
    audit(db, user, 'gallery.caption', row.id, { caption: caption ?? null }),
  ]);
  return { ok: true };
}

/** ลบรูป (ทั้งรูปเต็มและรูปย่อ) — รูปที่สำรองไว้แล้วยังอยู่ใน metafarm-backups */
export async function deleteGalleryPhoto(db: Db, bucket: R2Bucket, user: SessionUser, id: number): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.galleryPhotos.findFirst({ where: eq(galleryPhotos.id, id) });
  if (!row) return { ok: true }; // ลบไปแล้ว (กดซ้ำ)
  await db.batch([
    db.delete(galleryPhotos).where(and(eq(galleryPhotos.id, row.id))),
    audit(db, user, 'gallery.delete', row.id, { category: row.category, key: row.r2Key, caption: row.caption, label: galleryCategory[row.category].label }),
  ]);
  await bucket.delete([row.r2Key, thumbKeyOf(row.r2Key)]).catch(() => {});
  return { ok: true };
}
