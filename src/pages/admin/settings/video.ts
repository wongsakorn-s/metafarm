import type { APIRoute } from 'astro';
import { jsonResult, sameOrigin } from '../../../lib/http.ts';
import { getDb, getMedia } from '../../../server/db.ts';
import { receiveVideo, setHomeVideo } from '../../../server/video.ts';

export const prerender = false;

// อัปโหลดวิดีโอแนะนำฟาร์ม (หน้าแรก): เจ้าของ/แอดมินเท่านั้น (อยู่ใต้ /admin/settings — middleware กันพนักงาน)
export const PUT: APIRoute = async ({ request, locals }) => {
  if (!sameOrigin(request)) return jsonResult({ ok: false, message: 'คำขอไม่ถูกต้อง' });
  const bucket = getMedia();
  const r = await receiveVideo(bucket, request, 'home');
  if (!r.ok) return jsonResult({ ok: false, message: r.error });
  const saved = await setHomeVideo(getDb(), bucket, locals.user!, { key: r.key, durationSec: r.durationSec });
  if (!saved.ok) return jsonResult({ ok: false, message: saved.error });
  const message = 'อัปโหลดวิดีโอแนะนำฟาร์มแล้ว';
  return jsonResult({ ok: true, message, redirect: `/admin/settings?msg=${encodeURIComponent(message)}#home-video` });
};
