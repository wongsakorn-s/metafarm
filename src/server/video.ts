// วิดีโอ: รับไฟล์เป็นสตรีม → R2 → ตรวจซ้ำ (MP4/H.264/ไม่มีพิกัด) · ผูกกับรัง (hive_media) หรือหน้าแรก (settings)
// ไม่อ่านไฟล์เข้าหน่วยความจำ (Worker มี 128 MB) — ตรวจโดยอ่านเป็นช่วงจาก R2
import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { auditLogs, hiveMedia, settings } from '../db/schema.ts';
import { checkVideo, hasLocation, MAX_VIDEO_BYTES, VIDEO_MIME, type Reader } from '../lib/video.ts';
import { parseYoutubeId } from '../lib/media.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

type Hive = { id: number; code: string };

export type Received = { ok: true; key: string; bytes: number; durationSec: number | null } | { ok: false; status: number; error: string };

/** อ่านช่วงไบต์จาก R2 (ไม่เกินท้ายไฟล์) */
const r2Reader = (bucket: R2Bucket, key: string, size: number): Reader => async (offset, length) => {
  const len = Math.min(length, size - offset);
  if (len <= 0) return new Uint8Array();
  const o = await bucket.get(key, { range: { offset, length: len } });
  return o ? new Uint8Array(await o.arrayBuffer()) : new Uint8Array();
};

function pipeFixed(src: ReadableStream, length: number): ReadableStream {
  const { readable, writable } = new FixedLengthStream(length);
  src.pipeTo(writable).catch(() => {}); // ส่งไม่ครบ/ไม่ตรงความยาว → readable error → put ล้มเหลว
  return readable;
}

/**
 * รับวิดีโอจาก body ของคำขอ PUT โดยตรง (ไม่ผ่าน formData) แล้วเก็บเป็น `videos/<target>/<uuid>.mp4`
 * ไฟล์ที่ตรวจไม่ผ่านถูกลบออกจาก R2 ทันที
 */
export async function receiveVideo(bucket: R2Bucket, request: Request, target: string): Promise<Received> {
  const length = Number(request.headers.get('content-length'));
  if (!request.body || !Number.isFinite(length) || length <= 0) return { ok: false, status: 411, error: 'ไม่พบไฟล์ที่ส่งมา' };
  if (length > MAX_VIDEO_BYTES) return { ok: false, status: 413, error: `ไฟล์ใหญ่เกิน ${MAX_VIDEO_BYTES / 1048576} MB — ลดคุณภาพ/ตัดคลิปให้สั้นลง (แนะนำ 720p)` };

  const key = `videos/${target}/${crypto.randomUUID()}.mp4`;
  const discard = async (status: number, error: string): Promise<Received> => {
    await bucket.delete(key).catch(() => {});
    return { ok: false, status, error };
  };
  try {
    // FixedLengthStream = R2 รับสตรีมที่ระบุความยาวชัด ๆ และไบต์ที่ส่งมาไม่ตรง Content-Length = ล้มเหลว (ไม่เก็บไฟล์ขาด) · ใน Node (vitest) ไม่มี จึงอ่านทั้งก้อน — ใช้เฉพาะไฟล์เล็กในเทสต์
    const body = typeof FixedLengthStream === 'function' ? pipeFixed(request.body, length) : await request.arrayBuffer();
    await bucket.put(key, body, { httpMetadata: { contentType: VIDEO_MIME, cacheControl: 'public, max-age=86400' } });
  } catch {
    return discard(502, 'บันทึกไฟล์ไม่สำเร็จ — ลองอีกครั้ง');
  }
  const head = await bucket.head(key);
  if (!head || head.size !== length) return discard(422, 'ไฟล์มาไม่ครบ (สัญญาณหลุดระหว่างส่ง) — ลองอีกครั้ง');

  const read = r2Reader(bucket, key, head.size);
  const check = await checkVideo(head.size, read);
  if (!check.ok) return discard(422, check.error);
  if (hasLocation(await read(check.moov.offset, check.moov.size))) {
    return discard(422, 'วิดีโอยังมีพิกัด GPS ฝังอยู่ (ไม่ได้ผ่านหน้าอัปโหลดที่ลบพิกัดให้) — เปิดหน้านี้ใหม่แล้วอัปโหลดอีกครั้ง');
  }
  return { ok: true, key, bytes: head.size, durationSec: check.durationSec };
}

const audit = (db: Db, user: SessionUser, action: string, entity: string, entityId: number | null, diff: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity, entityId, diff });

/** ผูกไฟล์ที่อัปโหลดแล้วเป็นวิดีโอของรัง (แทนวิดีโอเดิม — ไฟล์เดิมใน R2 ถูกลบ) */
export async function attachHiveVideo(db: Db, bucket: R2Bucket, user: SessionUser, hive: Hive, key: string, durationSec: number | null): Promise<void> {
  const old = await db.select({ key: hiveMedia.r2Key }).from(hiveMedia).where(and(eq(hiveMedia.hiveId, hive.id), eq(hiveMedia.kind, 'video')));
  try {
    await db.batch([
      db.delete(hiveMedia).where(and(eq(hiveMedia.hiveId, hive.id), eq(hiveMedia.kind, 'video'))),
      db.insert(hiveMedia).values({ hiveId: hive.id, kind: 'video', r2Key: key, sortOrder: 0 }),
      audit(db, user, 'media.video.upload', 'hive', hive.id, { key, durationSec }),
    ]);
  } catch (e) {
    await bucket.delete(key).catch(() => {});
    throw e;
  }
  const stale = old.map((o) => o.key).filter((k): k is string => !!k && k !== key);
  if (stale.length) await bucket.delete(stale).catch(() => {});
}

// ---------- วิดีโอแนะนำฟาร์ม (หน้าแรก) ----------

export type HomeVideo = { key: string; youtubeId?: undefined } | { youtubeId: string; key?: undefined } | null;

const upsert = (db: Db, key: string, value: string) =>
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` } });

async function homeVideoKey(db: Db): Promise<string | null> {
  const [r] = await db.select({ v: settings.value }).from(settings).where(eq(settings.key, 'home.videoKey'));
  return r?.v || null;
}

/** ตั้งวิดีโอหน้าแรก: ไฟล์ที่เพิ่งอัปโหลด (key) · ลิงก์ YouTube · หรือว่าง = เอาออก */
export async function setHomeVideo(
  db: Db, bucket: R2Bucket, user: SessionUser, v: { key: string; durationSec?: number | null } | { youtube: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  let key = '';
  let youtube = '';
  if ('key' in v) key = v.key;
  else if (v.youtube.trim()) {
    const id = parseYoutubeId(v.youtube.trim());
    if (!id) return { ok: false, error: 'ลิงก์ YouTube ไม่ถูกต้อง (วางลิงก์ youtube.com/watch?v=… หรือ youtu.be/…)' };
    youtube = id;
  }
  const old = await homeVideoKey(db);
  const stmts: BatchItem<'sqlite'>[] = [
    upsert(db, 'home.videoKey', key),
    upsert(db, 'home.videoYoutube', youtube),
    audit(db, user, key ? 'settings.homeVideo.upload' : youtube ? 'settings.homeVideo.youtube' : 'settings.homeVideo.remove', 'settings', null, { key: key || null, youtubeId: youtube || null, durationSec: 'key' in v ? (v.durationSec ?? null) : null }),
  ];
  try {
    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (e) {
    if (key) await bucket.delete(key).catch(() => {});
    throw e;
  }
  if (old && old !== key) await bucket.delete(old).catch(() => {});
  return { ok: true };
}
