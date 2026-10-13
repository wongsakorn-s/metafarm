// รูปสินค้าหลายรูป: เพดานต่อสินค้า (เจ้าของขอ 2026-10-13: รังเปล่า 6 รูป · น้ำผึ้ง 3 รูป) — ไม่ผูกกับ runtime
import type { ImageType } from './media.ts';

export const PRODUCT_PHOTO_LIMIT = { hive_box: 6, honey: 3, other: 3 } as const;
export const productPhotoLimit = (category: string) => PRODUCT_PHOTO_LIMIT[category as keyof typeof PRODUCT_PHOTO_LIMIT] ?? 3;

/** คีย์ใน R2: products/<slug>/<id>.<ext> — id มาจากรหัสชุดอัปโหลด (ส่งซ้ำชุดเดิมไม่บันทึกรูปซ้ำ) */
export const productPhotoKey = (slug: string, id: string, ext: ImageType['ext']) => `products/${slug}/${id}.${ext}`;
