// ชั้นข้อมูลสำหรับหน้าสาธารณะ — ทุก query เลือกคอลัมน์แบบ allowlist (ห้ามใช้ select() เปล่า ๆ)
//
// ห้ามเปิดเผย (🔒): purchase_price, supplier*, for_sale, sale_price, sold_price, sold_on, customer*,
//                   notes, collapse_reason, ปริมาณน้ำผึ้ง/ชัน, บันทึกดิบจาก Excel ใน hive_events.note
// ตรวจโดย `npm run check:leaks` (สแกนทุกหน้าสมุดพกหาข้อมูลลับ) — แก้ไฟล์นี้แล้วควรรันซ้ำ
import { alias } from 'drizzle-orm/sqlite-core';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { hiveEvents, hiveMedia, hives, honeyLots, lotSources, productVariants, products, species } from '../db/schema.ts';
import { provinceOf } from '../lib/place.ts';
import type { Db } from './db.ts';

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
  /** active = ยังอยู่, sold = ขายแล้ว, collapsed = ปิดรัง (ล่ม) */
  status: 'active' | 'sold' | 'collapsed' | 'unknown';
  publicNote: string | null;
  updatedAt: string;
  photos: { key: string; alt: string | null }[];
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
  const [photos, children, events] = await Promise.all([
    db
      .select({ key: hiveMedia.r2Key, alt: hiveMedia.alt })
      .from(hiveMedia)
      .where(and(eq(hiveMedia.hiveId, row.id), eq(hiveMedia.kind, 'passport')))
      .orderBy(asc(hiveMedia.sortOrder), asc(hiveMedia.id))
      .limit(4),
    db
      .select({ code: hives.code, viaQueen: sql<boolean>`${hives.queenSourceHiveId} = ${row.id}`, viaBrood: sql<boolean>`${hives.broodSourceHiveId} = ${row.id}` })
      .from(hives)
      .where(or(eq(hives.queenSourceHiveId, row.id), eq(hives.broodSourceHiveId, row.id)))
      .orderBy(asc(hives.id)),
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
    queenBornOn: row.origin === 'queen_bred' ? row.queenBornOn : null,
    queenSource: row.queenSource,
    broodSource: row.broodSource,
    status: row.status,
    publicNote: row.publicNote,
    updatedAt: row.updatedAt,
    photos: photos.filter((p): p is { key: string; alt: string | null } => !!p.key),
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
    .where(inArray(productVariants.productId, prods.map((p) => p.id)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
  return prods
    .map(({ id, ...p }) => ({
      ...p,
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
  salePhotos: { key: string; alt: string | null }[];
  passportPhotos: { key: string; alt: string | null }[];
  videoId: string | null;
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
    queenBornOn: r.origin === 'queen_bred' ? r.queenBornOn : null,
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
  const photos = (kind: string) => media.filter((m) => m.kind === kind && m.key).map((m) => ({ key: m.key!, alt: m.alt }));
  const salePhotos = photos('sale').slice(0, 3);
  const passportPhotos = photos('passport').slice(0, 2);

  return {
    code: row.code,
    priceThb: row.priceThb ?? 0,
    species: row.species,
    origin: row.origin,
    province: row.origin === 'purchased' ? provinceOf(row.originPlace) : null,
    acquiredOn: row.acquiredOn,
    acquiredOnPrecision: row.acquiredOnPrecision,
    queenBornOn: row.origin === 'queen_bred' ? row.queenBornOn : null,
    coverKey: (salePhotos[0] ?? passportPhotos[0])?.key ?? null,
    salePhotos,
    passportPhotos,
    videoId: media.find((m) => m.kind === 'video')?.youtubeId ?? null,
    queenSource: row.queenSource,
    broodSource: row.broodSource,
    publicNote: row.publicNote,
  };
}

/** รายการ URL สาธารณะที่ให้ search engine เก็บได้ (sitemap) — คืนเฉพาะรหัสรัง/slug ไม่มีข้อมูลอื่น */
export async function getSitemapData(db: Db) {
  const [allHives, sale, prods] = await Promise.all([
    db.select({ code: hives.code }).from(hives).orderBy(asc(hives.id)),
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

/** ค้นหารหัสรัง (ค้นแบบตรงกับรหัส/ขึ้นต้นด้วย) — คืนเฉพาะรหัส */
export async function searchHiveCodes(db: Db, q: string, limit = 12): Promise<string[]> {
  const term = q.replace(/[%_\\]/g, '').trim().toUpperCase();
  if (!term) return [];
  const rows = await db.select({ code: hives.code }).from(hives).where(like(hives.code, `${term}%`)).orderBy(asc(hives.id)).limit(limit);
  return rows.map((r) => r.code);
}

/**
 * รูปที่เปิดสาธารณะได้: รูปสมุดพก (passport) ทุกรัง
 * และรูปขาย (sale) เฉพาะรังที่ตั้งขายอยู่และยังไม่ขาย — รูปอื่น/คีย์ที่เดาเอาเองจะไม่ผ่าน
 */
export async function isPublicMediaKey(db: Db, key: string): Promise<boolean> {
  // รูปสินค้า: เปิดเฉพาะสินค้าที่แสดงบนเว็บ (published) และเป็นรูปปัจจุบันของสินค้านั้น
  if (key.startsWith('products/')) {
    const p = await db.select({ one: sql<number>`1` }).from(products).where(and(eq(products.imageKey, key), eq(products.published, true))).limit(1);
    return p.length > 0;
  }
  const row = await db
    .select({ one: sql<number>`1` })
    .from(hiveMedia)
    .innerJoin(hives, eq(hives.id, hiveMedia.hiveId))
    .where(and(eq(hiveMedia.r2Key, key), or(eq(hiveMedia.kind, 'passport'), and(eq(hiveMedia.kind, 'sale'), eq(hives.forSale, true), eq(hives.status, 'active')))))
    .limit(1);
  return row.length > 0;
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
    .where(eq(lotSources.lotId, lot.id)).orderBy(asc(hives.id));
  return { code: lot.code, harvestedFrom: lot.harvestedFrom, harvestedTo: lot.harvestedTo, hives: rows.map((r) => r.code) };
}
