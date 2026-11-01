import type { APIRoute } from 'astro';
import { jsonResult, sameOrigin } from '../../../../lib/http.ts';
import { getDb, getMedia } from '../../../../server/db.ts';
import { eq } from 'drizzle-orm';
import { products } from '../../../../db/schema.ts';
import { attachProductVideo, receivePoster, receiveVideo } from '../../../../server/video.ts';

export const prerender = false;

// อัปโหลดวิดีโอสินค้า: PUT ไฟล์ MP4 (H.264) เป็น body ตรง ๆ จาก src/scripts/video-upload.ts
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!sameOrigin(request)) return jsonResult({ ok: false, message: 'คำขอไม่ถูกต้อง' });
  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) return jsonResult({ ok: false, message: 'ไม่พบสินค้านี้' });
  const db = getDb();
  const prod = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!prod) return jsonResult({ ok: false, message: 'ไม่พบสินค้านี้' });

  const posterFor = new URL(request.url).searchParams.get('poster');
  if (posterFor) {
    const owns = prod.videoKey === posterFor;
    const p = await receivePoster(getMedia(), request, posterFor, owns);
    return jsonResult({ ok: p.ok, message: p.error ?? 'ok' });
  }

  const r = await receiveVideo(getMedia(), request, `product-${productId}`);
  if (!r.ok) return jsonResult({ ok: false, message: r.error });
  const attached = await attachProductVideo(db, getMedia(), locals.user!, productId, r.key, r.durationSec);
  if (!attached.ok) return jsonResult({ ok: false, message: attached.error ?? 'บันทึกไม่สำเร็จ' });
  const message = 'อัปโหลดวิดีโอสินค้าแล้ว';
  return jsonResult({ ok: true, message, key: r.key, redirect: `/admin/products?msg=${encodeURIComponent(message)}#p-${productId}` });
};

