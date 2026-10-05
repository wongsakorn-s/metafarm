import type { APIRoute } from 'astro';
import { getMedia } from '../../server/db.ts';
import { serveImage } from '../../server/serve-image.ts';

export const prerender = false;

// รูปหลังบ้าน (middleware ตรวจล็อกอินแล้ว) — เก็บในเบราว์เซอร์ของผู้ใช้เท่านั้น (private) 30 วัน
// ประหยัดเน็ตมือถือในสวน: หน้ารายการรังไม่ต้องโหลดรูปเดิมซ้ำทุกครั้ง
export const GET: APIRoute = async ({ params, request }) => serveImage(getMedia(), params.key ?? '', request, 'private, max-age=2592000, immutable');
