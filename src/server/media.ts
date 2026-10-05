import { and, asc, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { auditLogs, hiveMedia, hives, products } from '../db/schema.ts';
import {
  detectImageType,
  LIMITS,
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_BYTES,
  mediaKey,
  parseYoutubeId,
  remainingSlots,
  type ImageKind,
} from '../lib/media.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

type Hive = typeof hives.$inferSelect;
export type MediaRow = typeof hiveMedia.$inferSelect;
export type Skipped = { name: string; reason: string };

export async function listMedia(db: Db, hiveId: number): Promise<MediaRow[]> {
  return db.select().from(hiveMedia).where(eq(hiveMedia.hiveId, hiveId)).orderBy(asc(hiveMedia.kind), asc(hiveMedia.sortOrder), asc(hiveMedia.id));
}

const audit = (db: Db, user: SessionUser, action: string, hiveId: number, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity: 'hive', entityId: hiveId, diff: diff ?? null });

/** อัปโหลดรูป: ตรวจชนิดจากไบต์จริง, ขนาด, และจำนวนสูงสุดต่อชนิด */
export async function uploadImages(
  db: Db,
  bucket: R2Bucket,
  user: SessionUser,
  hive: Hive,
  kind: ImageKind,
  files: File[],
  /** รหัสชุดอัปโหลดจากเบราว์เซอร์ — ส่งชุดเดิมซ้ำ (เน็ตหลุดหลังเซิร์ฟเวอร์ได้รับแล้ว) จะไม่บันทึกรูปซ้ำ */
  batch?: string,
): Promise<{ added: number; skipped: Skipped[] }> {
  const skipped: Skipped[] = [];
  let added = 0;
  const batchId = batch && /^[0-9a-f-]{36}$/.test(batch) ? batch : null;

  const existing = (await listMedia(db, hive.id)).filter((m) => m.kind === kind);
  let slots = remainingSlots(kind, existing.length);
  let order = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  for (const [i, file] of files.entries()) {
    const name = file.name || `ไฟล์ที่ ${i + 1}`;
    if (i >= MAX_FILES_PER_REQUEST) { skipped.push({ name, reason: `ครั้งละไม่เกิน ${MAX_FILES_PER_REQUEST} ไฟล์` }); continue; }
    if (file.size === 0) { skipped.push({ name, reason: 'ไฟล์ว่าง' }); continue; }
    if (file.size > MAX_UPLOAD_BYTES) { skipped.push({ name, reason: `ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }); continue; }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) { skipped.push({ name, reason: 'ไม่ใช่รูป JPEG/PNG/WebP' }); continue; }

    const key = mediaKey(hive.code, kind, batchId ? `${batchId}-${i}` : crypto.randomUUID(), type.ext);
    if (batchId && (await db.select({ id: hiveMedia.id }).from(hiveMedia).where(eq(hiveMedia.r2Key, key)).limit(1)).length) {
      added++; // บันทึกไว้แล้วจากครั้งก่อน — นับว่าสำเร็จ ไม่ใช้ช่องเพิ่ม
      continue;
    }
    if (slots <= 0) { skipped.push({ name, reason: `เต็มแล้ว (สูงสุด ${LIMITS[kind]} รูป)` }); continue; }
    await bucket.put(key, bytes, { httpMetadata: { contentType: type.mime } });
    try {
      await db.batch([
        db.insert(hiveMedia).values({ hiveId: hive.id, kind, r2Key: key, alt: `รูปรัง ${hive.code}`, sortOrder: order }),
        audit(db, user, 'media.add', hive.id, { kind, key }),
      ]);
    } catch (e) {
      // คำขอชุดเดิมที่มาพร้อมกันบันทึกคีย์นี้ไปแล้ว (ชน unique r2_key) → ไฟล์ใน R2 เป็นของแถวนั้น ห้ามลบ
      if (batchId && (await db.select({ id: hiveMedia.id }).from(hiveMedia).where(eq(hiveMedia.r2Key, key)).limit(1)).length) {
        added++;
        continue;
      }
      await bucket.delete(key).catch(() => {}); // ไม่ทิ้งไฟล์ค้างใน R2 ถ้าบันทึกฐานข้อมูลไม่สำเร็จ
      throw e;
    }
    added++; slots--; order++;
  }
  return { added, skipped };
}

export async function deleteMedia(db: Db, bucket: R2Bucket, user: SessionUser, hive: Hive, mediaId: number): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.hiveMedia.findFirst({ where: and(eq(hiveMedia.id, mediaId), eq(hiveMedia.hiveId, hive.id)) });
  if (!row) return { ok: false, error: 'ไม่พบรูปนี้ในรังนี้' };
  await db.batch([
    db.delete(hiveMedia).where(eq(hiveMedia.id, row.id)),
    audit(db, user, 'media.delete', hive.id, { kind: row.kind, key: row.r2Key, youtubeId: row.youtubeId }),
  ]);
  if (row.r2Key) await bucket.delete(row.r2Key).catch(() => {});
  return { ok: true };
}

/** ตั้ง/เปลี่ยน/ลบวิดีโอ YouTube (มีได้ 1 คลิป) — ส่งค่าว่างเพื่อลบ */
export async function setVideo(db: Db, user: SessionUser, hive: Hive, urlOrId: string): Promise<{ ok: boolean; error?: string }> {
  const input = urlOrId.trim();
  const id = input ? parseYoutubeId(input) : null;
  if (input && !id) return { ok: false, error: 'ลิงก์ YouTube ไม่ถูกต้อง (วางลิงก์ youtube.com/watch?v=… หรือ youtu.be/…)' };
  const stmts: BatchItem<'sqlite'>[] = [
    db.delete(hiveMedia).where(and(eq(hiveMedia.hiveId, hive.id), eq(hiveMedia.kind, 'video'))),
    ...(id ? [db.insert(hiveMedia).values({ hiveId: hive.id, kind: 'video' as const, youtubeId: id, sortOrder: 0 })] : []),
    audit(db, user, id ? 'media.video.set' : 'media.video.remove', hive.id, { youtubeId: id }),
  ];
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { ok: true };
}

/** ตั้ง/เปลี่ยนรูปสินค้า (1 รูปต่อสินค้า) — ตรวจชนิดจากไบต์จริงและขนาดเหมือนรูปรัง รูปเก่าถูกลบทิ้ง */
export async function setProductImage(db: Db, bucket: R2Bucket, user: SessionUser, productId: number, file: File): Promise<{ ok: boolean; error?: string }> {
  const p = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { id: true, slug: true, imageKey: true } });
  if (!p) return { ok: false, error: 'ไม่พบสินค้านี้' };
  if (file.size === 0) return { ok: false, error: 'ไฟล์ว่าง' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: 'ไม่ใช่รูป JPEG/PNG/WebP' };

  const key = `products/${p.slug}/${crypto.randomUUID()}.${type.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type.mime } });
  try {
    await db.batch([
      db.update(products).set({ imageKey: key }).where(eq(products.id, p.id)),
      db.insert(auditLogs).values({ userId: user.id, action: 'product.image.set', entity: 'product', entityId: p.id, diff: { key } }),
    ]);
  } catch (e) {
    await bucket.delete(key).catch(() => {});
    throw e;
  }
  if (p.imageKey) await bucket.delete(p.imageKey).catch(() => {});
  return { ok: true };
}

export async function removeProductImage(db: Db, bucket: R2Bucket, user: SessionUser, productId: number): Promise<{ ok: boolean; error?: string }> {
  const p = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { id: true, imageKey: true } });
  if (!p) return { ok: false, error: 'ไม่พบสินค้านี้' };
  if (!p.imageKey) return { ok: true };
  await db.batch([
    db.update(products).set({ imageKey: null }).where(eq(products.id, p.id)),
    db.insert(auditLogs).values({ userId: user.id, action: 'product.image.remove', entity: 'product', entityId: p.id, diff: { key: p.imageKey } }),
  ]);
  await bucket.delete(p.imageKey).catch(() => {});
  return { ok: true };
}

/** สรุปความพร้อมของรังที่ตั้งขาย (ใช้เตือนในหน้ารัง) */
export function saleReadiness(media: MediaRow[]) {
  const n = (k: string) => media.filter((m) => m.kind === k).length;
  return { passport: n('passport'), sale: n('sale'), video: n('video') };
}
