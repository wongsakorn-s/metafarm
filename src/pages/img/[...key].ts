import type { APIRoute } from 'astro';
import { etagMatches } from '../../lib/http.ts';
import { getDb, getMedia } from '../../server/db.ts';
import { isPublicMediaKey } from '../../server/public.ts';

export const prerender = false;

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// รูปสาธารณะ: เสิร์ฟเฉพาะคีย์ที่อยู่ในฐานข้อมูลและเข้าเงื่อนไขเปิดสาธารณะ (ดู isPublicMediaKey)
// ไม่ได้เสิร์ฟตามพาธตรง ๆ จึงเดาชื่อไฟล์เพื่อดูรูปที่ยังไม่เปิดไม่ได้
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  const type = TYPES[key.split('.').pop()?.toLowerCase() ?? ''];
  if (!type || key.includes('..') || !(await isPublicMediaKey(getDb(), key))) return new Response('Not found', { status: 404 });

  const obj = await getMedia().get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': type,
    'Cache-Control': 'public, max-age=86400',
    ETag: obj.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (etagMatches(request.headers.get('if-none-match'), obj.httpEtag)) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
};
