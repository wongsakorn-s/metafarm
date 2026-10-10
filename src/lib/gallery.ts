// หน้า Gallery: หมวดรูป ชื่อภาษาไทย และกติกา (ไม่ผูกกับ runtime — ทดสอบได้)
import { z } from 'zod';
import { GALLERY_CATEGORIES } from '../db/schema.ts';
import type { IconName } from './icons.ts';
import type { ImageType } from './media.ts';

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];
export { GALLERY_CATEGORIES };

/** หมวดตามที่เจ้าของฟาร์มขอ (คอมเมนต์ 2026-10-10) เรียงตามลำดับที่แสดง */
export const galleryCategory: Record<GalleryCategory, { label: string; icon: IconName; hint: string }> = {
  farm: { label: 'ชันโรงของ MetaFarm', icon: 'hive', hint: 'รังและชันโรงขนเงินในสวนปาล์มของเรา' },
  hive_delivery: { label: 'ส่งมอบรังชันโรง', icon: 'truck', hint: 'รังที่ส่งต่อให้ผู้เลี้ยง' },
  honey_delivery: { label: 'ส่งมอบน้ำผึ้ง', icon: 'honey', hint: 'น้ำผึ้งชันโรงที่ส่งถึงลูกค้า' },
  woodshop: { label: 'ห้องงานไม้', icon: 'wood', hint: 'การทำรังไม้สักของฟาร์ม' },
};

export const isGalleryCategory = (s: unknown): s is GalleryCategory => typeof s === 'string' && (GALLERY_CATEGORIES as readonly string[]).includes(s);

/** รูปต่อหมวดสูงสุด — หน้าเดียวโหลดไม่หนักเกินไปบนมือถือ */
export const GALLERY_MAX_PER_CATEGORY = 60;
/** หมวดที่ยังไม่มีรูป แสดงกรอบรูปชั่วคราวกี่ช่อง */
export const GALLERY_PLACEHOLDERS = 3;

/** คีย์ใน R2: gallery/<หมวด>/<id>.<ext> — id มาจากรหัสชุดอัปโหลด (กันบันทึกซ้ำเมื่อส่งซ้ำ) หรือ UUID */
export function galleryKey(category: GalleryCategory, id: string, ext: ImageType['ext']): string {
  return `gallery/${category}/${id}.${ext}`;
}

export const captionSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
  z.string().max(200, 'คำบรรยายยาวเกิน 200 ตัวอักษร').optional(),
);
