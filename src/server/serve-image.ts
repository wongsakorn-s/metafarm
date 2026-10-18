// เสิร์ฟรูปจาก R2 (ใช้ทั้ง /img สาธารณะ และ /media หลังบ้าน)
import { etagMatches } from '../lib/http.ts';
import { mediumKeyOf, thumbKeyOf } from '../lib/media.ts';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** ชนิดไฟล์จากนามสกุลคีย์ (null = ไม่ใช่รูปที่เสิร์ฟ หรือคีย์อันตราย) */
export function imageTypeOfKey(key: string): string | null {
  if (!key || key.includes('..')) return null;
  return TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/**
 * คีย์ในที่เก็บมี UUID อยู่ในชื่อ เนื้อไฟล์จึงไม่เปลี่ยน — ให้เบราว์เซอร์เก็บไว้นาน และตอบ 304 ถ้ามีอยู่แล้ว
 * ?w=thumb → รูปย่อ · ?w=med → รูปขนาดกลาง · ถ้าไม่มี (รูปเก่า) ใช้รูปเต็ม
 */
export async function serveImage(bucket: R2Bucket, key: string, request: Request, cacheControl: string): Promise<Response> {
  const type = imageTypeOfKey(key);
  if (!type) return new Response('Not found', { status: 404 });
  const w = new URL(request.url).searchParams.get('w');
  const variant = w === 'thumb' ? thumbKeyOf(key) : w === 'med' ? mediumKeyOf(key) : null;
  const obj = (variant ? await bucket.get(variant) : null) ?? (await bucket.get(key));
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': obj.httpMetadata?.contentType ?? type,
    'Cache-Control': cacheControl,
    ETag: obj.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (etagMatches(request.headers.get('if-none-match'), obj.httpEtag)) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}
