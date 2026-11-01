import type { APIRoute } from 'astro';
import { jsonResult, sameOrigin } from '../../../lib/http.ts';
import { getDb, getMedia } from '../../../server/db.ts';
import { and, eq } from 'drizzle-orm';
import { galleryPhotos } from '../../../db/schema.ts';
import { isGalleryCategory } from '../../../lib/gallery.ts';
import { attachGalleryVideo } from '../../../server/gallery.ts';
import { receivePoster, receiveVideo } from '../../../server/video.ts';

export const prerender = false;

// อัปโหลดวิดีโอเข้าแกลเลอรี: PUT ไฟล์ MP4 (H.264) เป็น body ตรง ๆ จาก src/scripts/video-upload.ts
export const PUT: APIRoute = async ({ request, locals }) => {
  if (!sameOrigin(request)) return jsonResult({ ok: false, message: 'คำขอไม่ถูกต้อง' });
  const url = new URL(request.url);
  const db = getDb();
  const bucket = getMedia();

  const posterFor = url.searchParams.get('poster');
  if (posterFor) {
    const own = await db
      .select({ id: galleryPhotos.id })
      .from(galleryPhotos)
      .where(and(eq(galleryPhotos.r2Key, posterFor), eq(galleryPhotos.mediaType, 'video')))
      .limit(1);
    const p = await receivePoster(bucket, request, posterFor, own.length > 0);
    return jsonResult({ ok: p.ok, message: p.error ?? 'ok' });
  }

  const category = url.searchParams.get('category');
  if (!isGalleryCategory(category)) return jsonResult({ ok: false, message: 'เลือกหมวดรูป/วิดีโอ' });
  const caption = url.searchParams.get('caption') || undefined;

  const r = await receiveVideo(bucket, request, 'gallery');
  if (!r.ok) return jsonResult({ ok: false, message: r.error });
  const attached = await attachGalleryVideo(db, bucket, locals.user!, category, r.key, caption);
  if (!attached.ok) return jsonResult({ ok: false, message: attached.error ?? 'บันทึกไม่สำเร็จ' });
  const message = 'อัปโหลดวิดีโอแล้ว';
  return jsonResult({ ok: true, message, key: r.key, redirect: `/admin/gallery?msg=${encodeURIComponent(message)}&c=${category}#${category}` });
};
