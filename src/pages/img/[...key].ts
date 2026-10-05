import type { APIRoute } from 'astro';
import { getDb, getMedia } from '../../server/db.ts';
import { isPublicMediaKey } from '../../server/public.ts';
import { imageTypeOfKey, serveImage } from '../../server/serve-image.ts';

export const prerender = false;

// รูปสาธารณะ: เสิร์ฟเฉพาะคีย์ที่อยู่ในฐานข้อมูลและเข้าเงื่อนไขเปิดสาธารณะ (ดู isPublicMediaKey)
// ไม่ได้เสิร์ฟตามพาธตรง ๆ จึงเดาชื่อไฟล์เพื่อดูรูปที่ยังไม่เปิดไม่ได้ (รวมถึง thumb/… — ขอได้ผ่าน ?w=thumb ของคีย์ที่เปิดแล้วเท่านั้น)
// cache 1 วัน (ไม่นานกว่านี้ เพราะรูปขายต้องหายจากเว็บหลังรังขายแล้ว)
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!imageTypeOfKey(key) || !(await isPublicMediaKey(getDb(), key))) return new Response('Not found', { status: 404 });
  return serveImage(getMedia(), key, request, 'public, max-age=86400');
};
