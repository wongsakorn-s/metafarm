import type { APIRoute } from 'astro';
import { normalizeHiveCode } from '../../../../lib/hive-code.ts';
import { jsonResult, sameOrigin } from '../../../../lib/http.ts';
import { getDb, getMedia } from '../../../../server/db.ts';
import { getHiveDetail } from '../../../../server/hives.ts';
import { attachHiveVideo, receiveVideo } from '../../../../server/video.ts';

export const prerender = false;

// อัปโหลดวิดีโอรัง: PUT ไฟล์ MP4 (H.264) เป็น body ตรง ๆ จาก src/scripts/video-upload.ts — ล็อกอินแล้วเท่านั้น (middleware)
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!sameOrigin(request)) return jsonResult({ ok: false, message: 'คำขอไม่ถูกต้อง' });
  const code = normalizeHiveCode(params.code) ?? '';
  const db = getDb();
  const detail = code ? await getHiveDetail(db, code) : null;
  if (!detail) return jsonResult({ ok: false, message: 'ไม่พบรังนี้' });

  const r = await receiveVideo(getMedia(), request, `hive-${detail.hive.code}`);
  if (!r.ok) return jsonResult({ ok: false, message: r.error });
  await attachHiveVideo(db, getMedia(), locals.user!, detail.hive, r.key, r.durationSec);
  const message = 'อัปโหลดวิดีโอแล้ว';
  return jsonResult({ ok: true, message, redirect: `/admin/hives/${detail.hive.code}/media?msg=${encodeURIComponent(message)}` });
};
