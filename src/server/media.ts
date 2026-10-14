import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { auditLogs, hiveMedia, hives, products } from '../db/schema.ts';
import {
  detectImageType,
  LIMITS,
  MAX_THUMB_BYTES,
  thumbKeyOf,
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_BYTES,
  mediaKey,
  parseYoutubeId,
  remainingSlots,
  stripMetadata,
  type ImageKind,
} from '../lib/media.ts';
import { posterKeyOf } from '../lib/video.ts';
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
  /** รูปย่อจากเบราว์เซอร์ ลำดับเดียวกับ files (ไม่บังคับ — ไม่มี/ไม่ถูกต้องก็ข้าม หน้าเว็บจะใช้รูปเต็มแทน) */
  thumbs: File[] = [],
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
    // ลบพิกัด GPS/ข้อมูลกล้องก่อนเก็บ (รูปรังขึ้นหน้าสาธารณะ)
    await bucket.put(key, stripMetadata(bytes), { httpMetadata: { contentType: type.mime } });
    const thumb = await validThumb(thumbs[i]);
    if (thumb) await bucket.put(thumbKeyOf(key), thumb.bytes, { httpMetadata: { contentType: thumb.mime } });
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
      await bucket.delete([key, thumbKeyOf(key)]).catch(() => {}); // ไม่ทิ้งไฟล์ค้างใน R2 ถ้าบันทึกฐานข้อมูลไม่สำเร็จ
      throw e;
    }
    added++; slots--; order++;
  }
  return { added, skipped };
}

export async function validThumb(f: File | undefined): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!(f instanceof File) || f.size === 0 || f.size > MAX_THUMB_BYTES) return null;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const type = detectImageType(bytes);
  return type ? { bytes: stripMetadata(bytes), mime: type.mime } : null;
}

export async function deleteMedia(db: Db, bucket: R2Bucket, user: SessionUser, hive: Hive, mediaId: number): Promise<{ ok: boolean; error?: string }> {
  const row = await db.query.hiveMedia.findFirst({ where: and(eq(hiveMedia.id, mediaId), eq(hiveMedia.hiveId, hive.id)) });
  if (!row) return { ok: false, error: 'ไม่พบรูปนี้ในรังนี้' };
  await db.batch([
    db.delete(hiveMedia).where(eq(hiveMedia.id, row.id)),
    audit(db, user, 'media.delete', hive.id, { kind: row.kind, key: row.r2Key, youtubeId: row.youtubeId }),
  ]);
  if (row.r2Key) await bucket.delete([row.r2Key, thumbKeyOf(row.r2Key), posterKeyOf(row.r2Key)]).catch(() => {});
  return { ok: true };
}

/** ตั้ง/เปลี่ยน/ลบวิดีโอ YouTube (มีได้ 1 คลิป) — ส่งค่าว่างเพื่อลบ · ไฟล์วิดีโอเดิมใน R2 (ถ้ามี) ถูกลบด้วย */
export async function setVideo(db: Db, bucket: R2Bucket, user: SessionUser, hive: Hive, urlOrId: string): Promise<{ ok: boolean; error?: string }> {
  const input = urlOrId.trim();
  const id = input ? parseYoutubeId(input) : null;
  if (input && !id) return { ok: false, error: 'ลิงก์ YouTube ไม่ถูกต้อง (วางลิงก์ youtube.com/watch?v=… หรือ youtu.be/…)' };
  const old = await db.select({ key: hiveMedia.r2Key }).from(hiveMedia).where(and(eq(hiveMedia.hiveId, hive.id), eq(hiveMedia.kind, 'video')));
  const stmts: BatchItem<'sqlite'>[] = [
    db.delete(hiveMedia).where(and(eq(hiveMedia.hiveId, hive.id), eq(hiveMedia.kind, 'video'))),
    ...(id ? [db.insert(hiveMedia).values({ hiveId: hive.id, kind: 'video' as const, youtubeId: id, sortOrder: 0 })] : []),
    audit(db, user, id ? 'media.video.set' : 'media.video.remove', hive.id, { youtubeId: id }),
  ];
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  const stale = old.map((o) => o.key).filter((k): k is string => !!k);
  if (stale.length) await bucket.delete(stale.flatMap((k) => [k, posterKeyOf(k)])).catch(() => {});
  return { ok: true };
}
/** สรุปความพร้อมของรังที่ตั้งขาย (ใช้เตือนในหน้ารัง) */
export function saleReadiness(media: MediaRow[]) {
  const n = (k: string) => media.filter((m) => m.kind === k).length;
  return { passport: n('passport'), sale: n('sale'), video: n('video') };
}

// ---------- เรียงลำดับ (รูปสมุดพกกับรูปสำหรับขายเรียงแยกกัน) ----------

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const photoRows = (db: Db, hiveId: number, kind: ImageKind) =>
  db.select({ id: hiveMedia.id, sortOrder: hiveMedia.sortOrder }).from(hiveMedia)
    .where(and(eq(hiveMedia.hiveId, hiveId), eq(hiveMedia.kind, kind), isNotNull(hiveMedia.r2Key))).orderBy(asc(hiveMedia.sortOrder), asc(hiveMedia.id));

/** เรียงเลขใหม่ทั้งชุดตามลำดับที่ส่งมา (0,1,2…) — เขียนทุกรูปทุกครั้ง ไม่มีเลขซ้ำแม้สองเครื่องเรียงพร้อมกัน (ดู gallery.ts) */
async function applyOrder(db: Db, user: SessionUser, hive: Hive, rows: { id: number; sortOrder: number }[], order: number[], action: string, diff: unknown) {
  const byId = new Map(rows.map((r) => [r.id, r.sortOrder]));
  if (order.every((id, i) => byId.get(id) === i)) return;
  const stmts = [
    ...order.map((id, i) => db.update(hiveMedia).set({ sortOrder: i, updatedAt: now }).where(eq(hiveMedia.id, id))),
    audit(db, user, action, hive.id, diff),
  ];
  await db.batch(stmts as unknown as [(typeof stmts)[0], ...(typeof stmts)[number][]]);
}

/** ลากวางเรียงรูป: ids = ลำดับใหม่ (รูปแรกก่อน) · รูปที่ไม่อยู่ในรายการ (เพิ่งอัปโหลด) ต่อท้าย · id ของรังอื่น/ที่ลบแล้วถูกข้าม */
export async function reorderHiveMedia(db: Db, user: SessionUser, hive: Hive, kind: ImageKind, ids: number[]): Promise<{ ok: boolean; error?: string }> {
  const rows = await photoRows(db, hive.id, kind);
  const known = new Set(rows.map((r) => r.id));
  const wanted = [...new Set(ids)].filter((id) => known.has(id));
  if (!wanted.length) return { ok: false, error: 'ไม่พบรูปในรายการ — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  const rest = rows.map((r) => r.id).filter((id) => !wanted.includes(id));
  await applyOrder(db, user, hive, rows, [...wanted, ...rest], 'media.reorder', { kind, count: wanted.length });
  return { ok: true };
}

/** เลื่อนทีละตำแหน่ง/ไปบนสุด — ใช้เมื่อไม่มี JavaScript */
export async function moveHiveMedia(db: Db, user: SessionUser, hive: Hive, mediaId: number, dir: 'up' | 'down' | 'top'): Promise<{ ok: boolean; error?: string }> {
  const target = await db.query.hiveMedia.findFirst({ where: and(eq(hiveMedia.id, mediaId), eq(hiveMedia.hiveId, hive.id)), columns: { kind: true } });
  if (!target || (target.kind !== 'passport' && target.kind !== 'sale')) return { ok: false, error: 'ไม่พบรูปนี้ในรังนี้' };
  const rows = await photoRows(db, hive.id, target.kind);
  const from = rows.findIndex((r) => r.id === mediaId);
  if (from < 0) return { ok: false, error: 'ไม่พบรูปนี้ในรังนี้' };
  const to = dir === 'top' ? 0 : dir === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length || to === from) return { ok: true };
  const order = rows.map((r) => r.id);
  order.splice(to, 0, order.splice(from, 1)[0]!);
  await applyOrder(db, user, hive, rows, order, 'media.move', { kind: target.kind, id: mediaId, dir, from: from + 1, to: to + 1 });
  return { ok: true };
}
