// ชั้นข้อมูลสำหรับหน้าสาธารณะ — ทุก query เลือกคอลัมน์แบบ allowlist (ห้ามใช้ select() เปล่า ๆ)
//
// ห้ามเปิดเผย (🔒): purchase_price, supplier*, for_sale, sale_price, sold_price, sold_on, customer*,
//                   notes, collapse_reason, ปริมาณน้ำผึ้ง/ชัน, บันทึกดิบจาก Excel ใน hive_events.note
// ตรวจโดย `npm run check:leaks` (สแกนทุกหน้าสมุดพกหาข้อมูลลับ) — แก้ไฟล์นี้แล้วควรรันซ้ำ
import { alias } from 'drizzle-orm/sqlite-core';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { hiveEvents, hiveMedia, hives, species } from '../db/schema.ts';
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
  const row = await db
    .select({ one: sql<number>`1` })
    .from(hiveMedia)
    .innerJoin(hives, eq(hives.id, hiveMedia.hiveId))
    .where(and(eq(hiveMedia.r2Key, key), or(eq(hiveMedia.kind, 'passport'), and(eq(hiveMedia.kind, 'sale'), eq(hives.forSale, true), eq(hives.status, 'active')))))
    .limit(1);
  return row.length > 0;
}
