import type { APIRoute } from 'astro';
import { getMedia } from '../../server/db.ts';

export const prerender = false;

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// เสิร์ฟรูปจาก R2 — ตอนนี้ต้องล็อกอิน (middleware ตรวจแล้ว) เพราะยังไม่มีหน้าสาธารณะที่ใช้รูป
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  const type = TYPES[key.split('.').pop()?.toLowerCase() ?? ''];
  if (!type || key.includes('..')) return new Response('Not found', { status: 404 });

  const obj = await getMedia().get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', ETag: obj.httpEtag },
  });
};
