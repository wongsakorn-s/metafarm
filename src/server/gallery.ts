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
