import type { APIRoute } from 'astro';
import { getDb, getMedia } from '../../server/db.ts';
import { isPublicVideoKey } from '../../server/public.ts';
import { isVideoKey, serveVideo } from '../../server/serve-video.ts';

export const prerender = false;

// วิดีโอสาธารณะ: เสิร์ฟเฉพาะคีย์ที่อยู่ในฐานข้อมูล (วิดีโอรัง/วิดีโอแนะนำฟาร์มหน้าแรก) — ถอดออกแล้ว = 404 · รองรับ Range
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!isVideoKey(key) || !(await isPublicVideoKey(getDb(), key))) return new Response('Not found', { status: 404 });
  return serveVideo(getMedia(), key, request);
};
export const HEAD = GET;
