// ชั้นข้อมูลสำหรับหน้าสาธารณะ — ทุก query เลือกคอลัมน์แบบ allowlist (ห้ามใช้ select() เปล่า ๆ)
//
// ห้ามเปิดเผย (🔒): purchase_price, supplier*, for_sale, sale_price, sold_price, sold_on, customer*,
//                   notes, collapse_reason, ปริมาณน้ำผึ้ง/ชัน, บันทึกดิบจาก Excel ใน hive_events.note
// ตรวจโดย `bun run check:leaks` (สแกนทุกหน้าสมุดพกหาข้อมูลลับ) — แก้ไฟล์นี้แล้วควรรันซ้ำ
import { alias } from 'drizzle-orm/sqlite-core';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { galleryPhotos, hiveEvents, hiveMedia, hives, honeyLots, lotSources, productPhotos, productVariants, products, settings, species } from '../db/schema.ts';
import { provinceOf } from '../lib/place.ts';
import type { Db } from './db.ts';
import { byCode } from './hives.ts';

export const PUBLIC_EVENT_TYPES = ['honey_harvest', 'queen_cell_taken', 'brood_split'] as const;

export interface PublicEvent {
  type: (typeof PUBLIC_EVENT_TYPES)[number] | 'note';
  occurredOn: string;
  precision: 'day' | 'month' | 'year';
  /** รหัสรังลูกที่เกิดจากเหตุการณ์นี้ (ถ้ามี) */
  targetCode: string | null;
  /** เฉพาะ type = 'note' ที่เจ้าของฟาร์มติ๊ก "แสดงในสมุดพก" */
  text: string | null;
}

/** วิดีโอที่แสดงสาธารณะ: ไฟล์ใน R2 (เสิร์ฟผ่าน /video/*) หรือ YouTube */
/** รังที่ฟาร์มขยายเอง (เพาะนางพญา/ขยายรัง) — แสดงวันเกิดนางพญา · เจ้าของเปลี่ยนรังเพาะนางพญาเป็น "ขยายรังโดย MetaFarm" แล้ว (2026-10-17) วันเกิดนางพญาต้องยังแสดง */
const bredHere = (origin: string) => origin === 'queen_bred' || origin === 'split';

export type PublicVideo = { key: string; youtubeId?: undefined } | { youtubeId: string; key?: undefined };
const publicVideo = (m: { key: string | null; youtubeId: string | null } | undefined): PublicVideo | null =>
  m?.key ? { key: m.key } : m?.youtubeId ? { youtubeId: m.youtubeId } : null;

export interface PublicHive {
  code: string;
  species: string;
  origin: 'purchased' | 'queen_bred' | 'split' | 'natural' | 'unknown';
  /** จังหวัดที่ซื้อมา (เฉพาะรังที่ซื้อ) */
  province: string | null;
  acquiredOn: string | null;
  acquiredOnPrecision: 'day' | 'month' | 'year' | null;
  queenBornOn: string | null;
  queenSource: string | null;
  broodSource: string | null;
  /** active = ยังอยู่, sold = ขายแล้ว, collapsed = รังล่ม */
  status: 'active' | 'sold' | 'collapsed' | 'unknown';
  publicNote: string | null;
  updatedAt: string;
  photos: { key: string; alt: string | null }[];
  video: PublicVideo | null;
  children: { code: string; viaQueen: boolean; viaBrood: boolean }[];
  events: PublicEvent[];
}

export async function getPublicHive(db: Db, code: string): Promise<PublicHive | null> {
  const queenSrc = alias(hives, 'queen_src');
  const broodSrc = alias(hives, 'brood_src');

  const row = await db
    .select({
      id: hives.id,
      code: hives.code,
      species: species.nameTh,
      origin: hives.origin,
      originPlace: hives.originPlace,
      acquiredOn: hives.acquiredOn,
      acquiredOnPrecision: hives.acquiredOnPrecision,
      queenBornOn: hives.queenBornOn,
      status: hives.status,
      publicNote: hives.publicNote,
      updatedAt: hives.updatedAt,
      queenSource: queenSrc.code,
      broodSource: broodSrc.code,
    })
    .from(hives)
    .innerJoin(species, eq(species.id, hives.speciesId))
    .leftJoin(queenSrc, eq(queenSrc.id, hives.queenSourceHiveId))
    .leftJoin(broodSrc, eq(broodSrc.id, hives.broodSourceHiveId))
    .where(eq(hives.code, code))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return null;

  const target = alias(hives, 'target');
  const [photos, video, children, events] = await Promise.all([
    db
      .select({ key: hiveMedia.r2Key, alt: hiveMedia.alt })
      .from(hiveMedia)
      .where(and(eq(hiveMedia.hiveId, row.id), eq(hiveMedia.kind, 'passport')))
      .orderBy(asc(hiveMedia.sortOrder), asc(hiveMedia.id))
      .limit(6), // สมุดพกแสดงรูปได้สูงสุด 6 (เท่ากับจำนวนที่อัปโหลดได้)
    db
      .select({ key: hiveMedia.r2Key, youtubeId: hiveMedia.youtubeId })
      .from(hiveMedia)
      .where(and(eq(hiveMedia.hiveId, row.id), eq(hiveMedia.kind, 'video')))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ code: hives.code, viaQueen: sql<boolean>`${hives.queenSourceHiveId} = ${row.id}`, viaBrood: sql<boolean>`${hives.broodSourceHiveId} = ${row.id}` })
      .from(hives)
      .where(or(eq(hives.queenSourceHiveId, row.id), eq(hives.broodSourceHiveId, row.id)))
      .orderBy(...byCode()),
    db
      .select({
        type: hiveEvents.type,
        occurredOn: hiveEvents.occurredOn,
        precision: hiveEvents.occurredOnPrecision,
        targetCode: target.code,
        // ข้อความหมายเหตุ: เฉพาะเหตุการณ์ชนิด note (ที่เจ้าของฟาร์มเลือกแสดง) — เหตุการณ์อื่นไม่ส่ง note ออกไปเลย
        text: sql<string | null>`case when ${hiveEvents.type} = 'note' then ${hiveEvents.note} else null end`,
      })
      .from(hiveEvents)
      .leftJoin(target, eq(target.id, hiveEvents.targetHiveId))
      .where(and(eq(hiveEvents.hiveId, row.id), eq(hiveEvents.isPublic, true), inArray(hiveEvents.type, [...PUBLIC_EVENT_TYPES, 'note'])))
      .orderBy(desc(hiveEvents.occurredOn), desc(hiveEvents.id)),
  ]);

  return {
    code: row.code,
    species: row.species,
    origin: row.origin,
    province: row.origin === 'purchased' ? provinceOf(row.originPlace) : null,
    acquiredOn: row.acquiredOn,
    acquiredOnPrecision: row.acquiredOnPrecision,
    queenBornOn: bredHere(row.origin) ? row.queenBornOn : null,
    queenSource: row.queenSource,
    broodSource: row.broodSource,
    status: row.status,
    publicNote: row.publicNote,
    updatedAt: row.updatedAt,
    photos: photos.filter((p): p is { key: string; alt: string | null } => !!p.key),
    video: publicVideo(video),
    children,
    events: events as PublicEvent[],
  };
}

// ---------- สินค้า ----------

export interface PublicVariant {
  id: number;
  label: string;
  sizeMl: number | null;
  priceThb: number;
  /** ราคายังเป็นตัวอย่าง (เจ้าของฟาร์มยังไม่ได้ยืนยันในหลังบ้าน) */
  priceIsSample: boolean;
  /** มี/ไม่มี เท่านั้น — ไม่เปิดเผยจำนวนสต็อกจริง */
  inStock: boolean;
  harvestYearBe: number | null;
}
export interface PublicProduct {
  slug: string;
  name: string;
  category: 'hive_box' | 'honey' | 'other';
  description: string | null;
  /** รูปสินค้าจริง (ถ้าเจ้าของฟาร์มอัปโหลดแล้ว) ไม่งั้นเป็น null */
  imageKey: string | null;
  /** รูปสินค้าทั้งหมด รูปแรกก่อน (รูปแรก = imageKey) */
  photos: { key: string }[];
  variants: PublicVariant[];
}

/** สินค้าที่เปิดแสดง (published) พร้อมตัวเลือกขนาด/ราคา */
export async function getPublicProducts(db: Db, slug?: string): Promise<PublicProduct[]> {
  const prods = await db
    .select({ id: products.id, slug: products.slug, name: products.name, category: products.category, description: products.description, imageKey: products.imageKey })
    .from(products)
    .where(and(eq(products.published, true), slug ? eq(products.slug, slug) : undefined))
    .orderBy(asc(products.sortOrder), asc(products.id));
  if (prods.length === 0) return [];
  const photoRows = await db
    .select({ productId: productPhotos.productId, key: productPhotos.r2Key })
    .from(productPhotos)
    .where(inArray(productPhotos.productId, prods.map((p) => p.id)))
    .orderBy(desc(productPhotos.sortOrder), desc(productPhotos.id));
  const variants = await db
    .select({
      productId: productVariants.productId,
      id: productVariants.id,
      label: productVariants.label,
      sizeMl: productVariants.sizeMl,
      priceThb: productVariants.priceThb,
      priceConfirmed: productVariants.priceConfirmed,
      inStock: sql<boolean>`${productVariants.stockQty} > 0`,
      harvestYearBe: productVariants.harvestYearBe,
    })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, prods.map((p) => p.id)), eq(productVariants.hidden, false))) // ขนาดที่ซ่อน (เลิกขาย) ไม่แสดง
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
  return prods
    .map(({ id, ...p }) => ({
      ...p,
      photos: photoRows.filter((x) => x.productId === id).map((x) => ({ key: x.key })),
      variants: variants
        .filter((v) => v.productId === id)
        .map((v) => ({ id: v.id, label: v.label, sizeMl: v.sizeMl, priceThb: v.priceThb, priceIsSample: !v.priceConfirmed, inStock: !!v.inStock, harvestYearBe: v.harvestYearBe })),
    }))
    // สินค้าที่ยังไม่มีตัวเลือก/ราคา ไม่แสดง (ไม่งั้น "ราคาเริ่มต้น" = Math.min() ของว่าง = ∞)
    .filter((p) => p.variants.length > 0);
}

export interface SaleHiveCard {
  code: string;
  priceThb: number;
  species: string;
  origin: PublicHive['origin'];
  province: string | null;
  acquiredOn: string | null;
  acquiredOnPrecision: PublicHive['acquiredOnPrecision'];
  queenBornOn: string | null;
  /** รูปหน้าปก: รูปขายรูปแรก ถ้าไม่มีใช้รูปสมุดพกรูปแรก */
  coverKey: string | null;
}
export interface SaleHiveDetail extends SaleHiveCard {
  /** รูปที่แสดงในหน้ารังที่ขาย (รูปสำหรับขายตามลำดับที่เรียง รูปแรก = รูปปก; ไม่มีเลย = 3 รูปแรกของสมุดพก) */
  photos: { key: string; alt: string | null }[];
  video: PublicVideo | null;
  queenSource: string | null;
  broodSource: string | null;
  publicNote: string | null;
}

// รังที่เปิดขาย = ตั้งขาย + ยังอยู่ + มีราคา เท่านั้น
const forSaleNow = and(eq(hives.forSale, true), eq(hives.status, 'active'), sql`${hives.salePrice} > 0`);

export async function getSaleHives(db: Db): Promise<SaleHiveCard[]> {
  const rows = await db
    .select({
      code: hives.code,
      priceThb: hives.salePrice,
      species: species.nameTh,
      origin: hives.origin,
      originPlace: hives.originPlace,
      acquiredOn: hives.acquiredOn,
      acquiredOnPrecision: hives.acquiredOnPrecision,
      queenBornOn: hives.queenBornOn,
      coverKey: sql<string | null>`coalesce(
        (select r2_key from hive_media m where m.hive_id = hives.id and m.kind = 'sale' and m.r2_key is not null order by m.sort_order, m.id limit 1),
        (select r2_key from hive_media m where m.hive_id = hives.id and m.kind = 'passport' and m.r2_key is not null order by m.sort_order, m.id limit 1))`,
    })
    .from(hives)
    .innerJoin(species, eq(species.id, hives.speciesId))
    .where(forSaleNow)
    .orderBy(asc(hives.salePrice), asc(hives.id));
  return rows.map(({ originPlace, priceThb, ...r }) => ({
    ...r,
    priceThb: priceThb ?? 0,
    province: r.origin === 'purchased' ? provinceOf(originPlace) : null,
    queenBornOn: bredHere(r.origin) ? r.queenBornOn : null,
  }));
}

export async function getSaleHive(db: Db, code: string): Promise<SaleHiveDetail | null> {
  const queenSrc = alias(hives, 'queen_src');
  const broodSrc = alias(hives, 'brood_src');
  const row = await db
    .select({
      id: hives.id,
      code: hives.code,
      priceThb: hives.salePrice,
      species: species.nameTh,
      origin: hives.origin,
      originPlace: hives.originPlace,
      acquiredOn: hives.acquiredOn,
      acquiredOnPrecision: hives.acquiredOnPrecision,
      queenBornOn: hives.queenBornOn,
      publicNote: hives.publicNote,
      queenSource: queenSrc.code,
      broodSource: broodSrc.code,
    })
    .from(hives)
    .innerJoin(species, eq(species.id, hives.speciesId))
    .leftJoin(queenSrc, eq(queenSrc.id, hives.queenSourceHiveId))
    .leftJoin(broodSrc, eq(broodSrc.id, hives.broodSourceHiveId))
    .where(and(eq(hives.code, code), forSaleNow))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return null;

  const media = await db
    .select({ kind: hiveMedia.kind, key: hiveMedia.r2Key, youtubeId: hiveMedia.youtubeId, alt: hiveMedia.alt })
    .from(hiveMedia)
    .where(eq(hiveMedia.hiveId, row.id))
    .orderBy(asc(hiveMedia.sortOrder), asc(hiveMedia.id));
  // รูปในหน้าขาย = รูปสำหรับขายของรังนี้ตามลำดับที่เจ้าของเรียงไว้ (สูงสุด 6) · ยังไม่มีรูปสำหรับขายเลย = 3 รูปแรกของสมุดพก (หน้าจะได้ไม่ว่าง)
  const ofKind = (kind: string) => media.filter((m) => m.kind === kind && m.key).map((m) => ({ key: m.key!, alt: m.alt }));
  const sale = ofKind('sale').slice(0, 6);
  const photos = sale.length ? sale : ofKind('passport').slice(0, 3);

  return {
    code: row.code,
    priceThb: row.priceThb ?? 0,
    species: row.species,
    origin: row.origin,
    province: row.origin === 'purchased' ? provinceOf(row.originPlace) : null,
    acquiredOn: row.acquiredOn,
    acquiredOnPrecision: row.acquiredOnPrecision,
    queenBornOn: bredHere(row.origin) ? row.queenBornOn : null,
    coverKey: photos[0]?.key ?? null,
    photos,
    video: publicVideo(media.find((m) => m.kind === 'video')),
    queenSource: row.queenSource,
    broodSource: row.broodSource,
    publicNote: row.publicNote,
  };
}

/** รายการ URL สาธารณะที่ให้ search engine เก็บได้ (sitemap) — คืนเฉพาะรหัสรัง/slug ไม่มีข้อมูลอื่น */
export async function getSitemapData(db: Db) {
  const [allHives, sale, prods] = await Promise.all([
    db.select({ code: hives.code }).from(hives).orderBy(...byCode()),
    getSaleHives(db),
    getPublicProducts(db),
  ]);
  return { hiveCodes: allHives.map((h) => h.code), saleCodes: sale.map((h) => h.code), productSlugs: prods.map((p) => p.slug) };
}

/** ตัวเลขภาพรวมฟาร์มสำหรับหน้าแรก (ไม่มีข้อมูลการเงิน) */
export async function getFarmStats(db: Db) {
  const [r] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`coalesce(sum(${hives.status} = 'active'), 0)`,
      queenBred: sql<number>`coalesce(sum(${hives.origin} = 'queen_bred'), 0)`,
    })
    .from(hives);
  return { total: r?.total ?? 0, active: r?.active ?? 0, queenBred: r?.queenBred ?? 0 };
}

/**
 * รูปหัวหน้าแรก: รูปสมุดพกรูปแรก (เปิดสาธารณะอยู่แล้ว) ของรังที่เจ้าของเลือกในหลังบ้าน (site.heroHive)
 * ไม่เลือก / รังนั้นไม่มีรูป = null → หน้าแรกใช้โลโก้ (ไม่สุ่มรูปเอง — รูปล่าสุดอาจไม่สวยหรือเป็นรูปทดสอบ)
 */
export async function getHeroPhoto(db: Db, code: string): Promise<{ key: string; code: string } | null> {
  if (!code) return null;
  const [r] = await db
    .select({ key: hiveMedia.r2Key, code: hives.code })
    .from(hiveMedia)
    .innerJoin(hives, eq(hives.id, hiveMedia.hiveId))
    .where(and(eq(hiveMedia.kind, 'passport'), eq(hives.code, code), sql`${hiveMedia.r2Key} is not null`))
    .orderBy(asc(hiveMedia.sortOrder), asc(hiveMedia.id))
    .limit(1);
  return r?.key ? { key: r.key, code: r.code } : null;
}

/**
 * รังตัวอย่างให้กดดูสมุดพกได้โดยไม่ต้องรู้รหัส (หน้า /passport) — สุ่มทุกครั้งที่โหลด (เจ้าของขอ 2026-10-10)
 * เฉพาะรังที่ "รูปและข้อมูลครบ": ยังอยู่ · มีรูปสมุดพก · รู้ที่มา วันที่ได้รัง และวันเกิดนางพญา · ไม่มีหัวข้อ ??? ค้าง
 * (ตรงกับรายการ "ข้อมูลที่ยังไม่ครบ" ในหลังบ้าน — เติมครบแล้วรังจะขึ้นที่นี่เอง)
 * รูปของแต่ละรัง: รูปที่ถ่ายจากหลังบ้าน (…/passport-<uuid>-n.webp) ก่อน ใหม่สุดก่อน · รูปเล็กจาก Excel ใช้เมื่อไม่มีรูปใหม่
 * อ้างแถวรังด้านนอกด้วย "hives.id" ตรง ๆ — ดู sql-correlation.test.ts
 */
export async function getSampleHives(db: Db, limit = 8): Promise<{ code: string; key: string }[]> {
  const photo = sql<string>`(select m.r2_key from hive_media m where m.hive_id = hives.id and m.kind = 'passport' and m.r2_key is not null
    order by (m.r2_key like '%/passport-%') desc, m.id desc limit 1)`;
  const rows = await db
    .select({ code: hives.code, key: photo })
    .from(hives)
    .where(and(
      eq(hives.status, 'active'),
      sql`hives.origin != 'unknown' and hives.acquired_on is not null and hives.queen_born_on is not null`,
      sql`(hives.notes is null or hives.notes not like '%???%')`,
      sql`exists (select 1 from hive_media m where m.hive_id = hives.id and m.kind = 'passport' and m.r2_key is not null)`,
    ))
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.filter((r): r is { code: string; key: string } => !!r.key);
}

/**
 * ค้นหารหัสรัง — คืนเฉพาะรหัส
 * พิมพ์แค่เลข ("12") = รังเลข 12 ทุกชุดตัวอักษร (A12, B12) · อย่างอื่น = รหัสที่ขึ้นต้นด้วยคำค้น
 */
export async function searchHiveCodes(db: Db, q: string, limit = 12): Promise<string[]> {
  const term = q.replace(/[%_\\\s-]/g, '').toUpperCase();
  if (!term) return [];
  const where = /^\d{1,5}$/.test(term)
    ? sql`cast(substr(hives.code, length(rtrim(hives.code, '0123456789')) + 1) as integer) = ${Number(term)}`
    : like(hives.code, `${term}%`);
  const rows = await db.select({ code: hives.code }).from(hives).where(where).orderBy(...byCode()).limit(limit);
  return rows.map((r) => r.code);
}

/**
 * รูปที่เปิดสาธารณะได้: รูปสมุดพก (passport) ทุกรัง
 * และรูปขาย (sale) เฉพาะรังที่ตั้งขายอยู่และยังไม่ขาย — รูปอื่น/คีย์ที่เดาเอาเองจะไม่ผ่าน
 */
// ---------- Gallery (/gallery) ----------

/** รูปในหน้า Gallery: เฉพาะหมวด คีย์รูป และคำบรรยาย (ไม่มีผู้อัปโหลด/เวลา) · ใหม่ก่อนในแต่ละหมวด */
export interface PublicGalleryPhoto { category: (typeof galleryPhotos.$inferSelect)['category']; key: string; caption: string | null }
export async function getGallery(db: Db): Promise<PublicGalleryPhoto[]> {
  return db
    .select({ category: galleryPhotos.category, key: galleryPhotos.r2Key, caption: galleryPhotos.caption })
    .from(galleryPhotos)
    .orderBy(galleryPhotos.category, desc(galleryPhotos.sortOrder), desc(galleryPhotos.id));
}

export async function isPublicMediaKey(db: Db, key: string): Promise<boolean> {
  // รูป Gallery: เปิดทุกรูปที่ยังอยู่ในตาราง (ลบแล้ว = 404)
  if (key.startsWith('gallery/')) {
    const g = await db.select({ one: sql<number>`1` }).from(galleryPhotos).where(eq(galleryPhotos.r2Key, key)).limit(1);
    return g.length > 0;
  }
  // รูปสินค้า: เปิดเฉพาะสินค้าที่แสดงบนเว็บ (published) และเป็นรูปปัจจุบันของสินค้านั้น
  if (key.startsWith('products/')) {
    const p = await db.select({ one: sql<number>`1` }).from(products).where(and(eq(products.imageKey, key), eq(products.published, true))).limit(1);
    if (p.length > 0) return true;
    const q = await db.select({ one: sql<number>`1` }).from(productPhotos).innerJoin(products, eq(products.id, productPhotos.productId)).where(and(eq(productPhotos.r2Key, key), eq(products.published, true))).limit(1);
    return q.length > 0;
  }
  const row = await db
    .select({ one: sql<number>`1` })
    .from(hiveMedia)
    .innerJoin(hives, eq(hives.id, hiveMedia.hiveId))
    .where(and(eq(hiveMedia.r2Key, key), or(eq(hiveMedia.kind, 'passport'), and(eq(hiveMedia.kind, 'sale'), eq(hives.forSale, true), eq(hives.status, 'active')))))
    .limit(1);
  return row.length > 0;
}

/** วิดีโอไฟล์ที่เปิดสาธารณะได้: วิดีโอของรัง (แสดงในสมุดพก) หรือวิดีโอแนะนำฟาร์มที่ตั้งไว้ในหน้าแรก */
export async function isPublicVideoKey(db: Db, rawKey: string): Promise<boolean> {
  const key = rawKey.replace(/\.jpg$/, '.mp4'); // ภาพปกเปิดได้เมื่อวิดีโอของมันเปิดได้
  const hive = await db.select({ one: sql<number>`1` }).from(hiveMedia).where(and(eq(hiveMedia.r2Key, key), eq(hiveMedia.kind, 'video'))).limit(1);
  if (hive.length > 0) return true;
  const home = await db.select({ one: sql<number>`1` }).from(settings).where(and(eq(settings.key, 'home.videoKey'), eq(settings.value, key))).limit(1);
  return home.length > 0;
}

// ---------- ล็อตน้ำผึ้ง (หน้า /lot/[code] จาก QR บนขวด) ----------

/**
 * ข้อมูลล็อตสำหรับลูกค้าที่สแกน QR: รหัส ช่วงวันที่เก็บ และรังที่ให้น้ำผึ้ง (ลิงก์ไปสมุดพก)
 * ⚠️ ห้ามเพิ่ม: ต้นทุน จำนวนที่ขาย ลูกค้า หรือปริมาณรวม — ข้อมูลหลังบ้าน
 */
export interface PublicLot { code: string; harvestedFrom: string; harvestedTo: string; hives: string[] }
export async function getPublicLot(db: Db, code: string): Promise<PublicLot | null> {
  const [lot] = await db.select({ id: honeyLots.id, code: honeyLots.code, harvestedFrom: honeyLots.harvestedFrom, harvestedTo: honeyLots.harvestedTo }).from(honeyLots).where(eq(honeyLots.code, code)).limit(1);
  if (!lot) return null;
  const rows = await db.selectDistinct({ code: hives.code, id: hives.id }).from(lotSources)
    .innerJoin(hiveEvents, eq(hiveEvents.id, lotSources.eventId)).innerJoin(hives, eq(hives.id, hiveEvents.hiveId))
    .where(eq(lotSources.lotId, lot.id)).orderBy(...byCode());
  return { code: lot.code, harvestedFrom: lot.harvestedFrom, harvestedTo: lot.harvestedTo, hives: rows.map((r) => r.code) };
}
