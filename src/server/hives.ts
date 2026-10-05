import { alias } from 'drizzle-orm/sqlite-core';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { auditLogs, hiveEvents, hiveMedia, hives, species, suppliers } from '../db/schema.ts';
import type { z } from 'zod';
import { todayBangkok } from '../lib/validation.ts';
import type { broodSplitSchema, editHiveSchema, fillSchema, honeyHarvestSchema, newHiveSchema, noteSchema, queenCellSchema, saleSchema, statusSchema } from '../lib/validation.ts';
import { confirmUnknown, resolveUnknownNotes } from '../lib/unknown-notes.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

export const PAGE_SIZE = 40;
type Hive = typeof hives.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

const codeToId = (code: string) => Number(code.slice(1));
// คีย์กันบันทึกซ้ำ (กดสองครั้ง/ส่งซ้ำตอนเน็ตช้า) — ใส่ชนิดเหตุการณ์ด้วย เพื่อให้คีย์ของฟอร์มหนึ่งไม่ไปกลืนอีกฟอร์ม
const idemKey = (user: SessionUser, type: string, idem?: string) => (idem ? `ui:${user.id}:${type}:${idem}` : null);
/** ส่งซ้ำด้วยคีย์เดิม = บันทึกไปแล้ว → ตอบสำเร็จโดยไม่เขียนอะไรเพิ่ม (ไม่มี audit ซ้ำ ไม่เปลี่ยนสถานะซ้ำ) */
async function alreadySaved(db: Db, key: string | null): Promise<boolean> {
  if (!key) return false;
  const row = await db.select({ id: hiveEvents.id }).from(hiveEvents).where(eq(hiveEvents.idempotencyKey, key)).limit(1);
  return row.length > 0;
}
const audit = (db: Db, user: SessionUser, action: string, entityId: number, diff?: unknown, entity = 'hive') =>
  db.insert(auditLogs).values({ userId: user.id, action, entity, entityId, diff: diff ?? null });
const touch = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };

// ---------- อ่านข้อมูล ----------

export interface ListFilter {
  q?: string;
  status?: string;
  origin?: string;
  forSale?: boolean;
  /** รังที่ยังมีข้อมูล ??? ค้างอยู่ */
  incomplete?: boolean;
  page?: number;
}

const hasUnknownNote = sql`${hives.notes} LIKE '%???%'`;

export async function listHives(db: Db, f: ListFilter) {
  const q = f.q?.replace(/[%_\\]/g, '').trim();
  const conds: (SQL | undefined)[] = [
    q ? or(like(hives.code, `%${q}%`), like(hives.originPlace, `%${q}%`)) : undefined,
    f.status ? eq(hives.status, f.status as Hive['status']) : undefined,
    f.origin ? eq(hives.origin, f.origin as Hive['origin']) : undefined,
    f.forSale ? eq(hives.forSale, true) : undefined,
    f.incomplete ? hasUnknownNote : undefined,
  ];
  const where = and(...conds);
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        code: hives.code,
        origin: hives.origin,
        originPlace: hives.originPlace,
        status: hives.status,
        acquiredOn: hives.acquiredOn,
        acquiredOnPrecision: hives.acquiredOnPrecision,
        queenBornOn: hives.queenBornOn,
        forSale: hives.forSale,
        salePrice: hives.salePrice,
        photoKey: sql<string | null>`(select r2_key from hive_media m where m.hive_id = ${hives.id} and m.kind = 'passport' order by m.sort_order, m.id limit 1)`,
        lastEventOn: sql<string | null>`(select max(occurred_on) from hive_events e where e.hive_id = ${hives.id})`,
      })
      .from(hives)
      .where(where)
      .orderBy(desc(hives.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(hives).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getHiveDetail(db: Db, code: string) {
  const hive = await db.query.hives.findFirst({ where: eq(hives.code, code) });
  if (!hive) return null;

  const target = alias(hives, 'target');
  const queenSrc = alias(hives, 'queen_src');
  const broodSrc = alias(hives, 'brood_src');

  const [meta, events, media, children] = await Promise.all([
    db
      .select({
        species: species.nameTh,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        queenSource: queenSrc.code,
        broodSource: broodSrc.code,
      })
      .from(hives)
      .innerJoin(species, eq(species.id, hives.speciesId))
      .leftJoin(suppliers, eq(suppliers.id, hives.supplierId))
      .leftJoin(queenSrc, eq(queenSrc.id, hives.queenSourceHiveId))
      .leftJoin(broodSrc, eq(broodSrc.id, hives.broodSourceHiveId))
      .where(eq(hives.id, hive.id))
      .then((r) => r[0]!),
    db
      .select({ e: hiveEvents, targetCode: target.code })
      .from(hiveEvents)
      .leftJoin(target, eq(target.id, hiveEvents.targetHiveId))
      .where(eq(hiveEvents.hiveId, hive.id))
      .orderBy(desc(hiveEvents.occurredOn), desc(hiveEvents.id)),
    db.select().from(hiveMedia).where(eq(hiveMedia.hiveId, hive.id)).orderBy(asc(hiveMedia.kind), asc(hiveMedia.sortOrder), asc(hiveMedia.id)),
    db
      .select({ code: hives.code, status: hives.status, acquiredOn: hives.acquiredOn, viaQueen: sql<boolean>`${hives.queenSourceHiveId} = ${hive.id}`, viaBrood: sql<boolean>`${hives.broodSourceHiveId} = ${hive.id}` })
      .from(hives)
      .where(or(eq(hives.queenSourceHiveId, hive.id), eq(hives.broodSourceHiveId, hive.id)))
      .orderBy(asc(hives.id)),
  ]);

  const totals = events.reduce(
    (t, { e }) => ({ honeyMl: t.honeyMl + (e.honeyMl ?? 0), propolisG: t.propolisG + (e.propolisG ?? 0), queenCells: t.queenCells + (e.queenCells ?? 0) }),
    { honeyMl: 0, propolisG: 0, queenCells: 0 },
  );
  return { hive, ...meta, events, media, children, totals };
}

export async function getDashboard(db: Db) {
  const year = todayBangkok().slice(0, 4); // ปีตามเวลาไทย (Workers ใช้ UTC — ตี 0–7 วันที่ 1 ม.ค. จะยังเป็นปีเก่า)
  const [byStatus, byOrigin, [sale], recent, [honey], [incomplete]] = await Promise.all([
    db.select({ status: hives.status, n: sql<number>`count(*)` }).from(hives).groupBy(hives.status),
    db
      .select({
        origin: hives.origin,
        total: sql<number>`count(*)`,
        active: sql<number>`sum(${hives.status} = 'active')`,
        sold: sql<number>`sum(${hives.status} = 'sold')`,
        collapsed: sql<number>`sum(${hives.status} = 'collapsed')`,
      })
      .from(hives)
      .groupBy(hives.origin),
    db.select({ n: sql<number>`count(*)`, soldTotal: sql<number>`coalesce((select sum(sold_price) from hives where status='sold'),0)`, avgSold: sql<number>`coalesce((select avg(sold_price) from hives where status='sold' and sold_price > 0),0)` }).from(hives).where(and(eq(hives.forSale, true), eq(hives.status, 'active'))),
    db
      .select({ e: hiveEvents, code: hives.code })
      .from(hiveEvents)
      .innerJoin(hives, eq(hives.id, hiveEvents.hiveId))
      .orderBy(desc(hiveEvents.occurredOn), desc(hiveEvents.id))
      .limit(8),
    db
      .select({ ml: sql<number>`coalesce(sum(honey_ml),0)`, g: sql<number>`coalesce(sum(propolis_g),0)`, n: sql<number>`count(*)` })
      .from(hiveEvents)
      .where(and(eq(hiveEvents.type, 'honey_harvest'), sql`${hiveEvents.occurredOn} >= ${year + '-01-01'}`)),
    db.select({ n: sql<number>`count(*)` }).from(hives).where(hasUnknownNote),
  ]);
  return { byStatus, byOrigin, sale, recent, honey, year, incomplete: incomplete?.n ?? 0 };
}

// ---------- บันทึกข้อมูล ----------

async function findTarget(db: Db, selfId: number, code?: string): Promise<{ id: number | null; error?: string }> {
  if (!code) return { id: null };
  if (codeToId(code) === selfId) return { id: null, error: 'รังเป้าหมายต้องไม่ใช่รังเดียวกัน' };
  const t = await db.query.hives.findFirst({ where: eq(hives.code, code), columns: { id: true } });
  return t ? { id: t.id } : { id: null, error: `ไม่พบรัง ${code}` };
}

/**
 * ตั้ง parentId เป็นรังแม่ของ selfId แล้วจะวนหรือไม่ (รังแม่เป็นลูกหลานของรังนี้เอง เช่น A10 ↔ A20)
 * ไล่ขึ้นทั้งสายไข่นางและไข่อ่อนจาก parentId — ถ้าเจอ selfId แปลว่าวน
 */
export async function wouldCreateCycle(db: Db, selfId: number, parentId: number | null | undefined): Promise<boolean> {
  if (parentId == null) return false;
  if (parentId === selfId) return true;
  const rows = await db.all<{ id: number }>(sql`
    WITH RECURSIVE anc(id) AS (
      SELECT ${parentId}
      UNION
      SELECT p.pid FROM anc
        JOIN (SELECT id, queen_source_hive_id AS pid FROM hives UNION ALL SELECT id, brood_source_hive_id FROM hives) p ON p.id = anc.id
       WHERE p.pid IS NOT NULL
    )
    SELECT id FROM anc WHERE id = ${selfId} LIMIT 1`);
  return rows.length > 0;
}

const CYCLE_ERROR = (code: string) => `ตั้ง ${code} เป็นรังแม่ไม่ได้ เพราะ ${code} เป็นรังลูก/หลานของรังนี้อยู่แล้ว (สายพันธุ์จะวนกัน)`;

export async function addHoneyHarvest(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof honeyHarvestSchema>): Promise<Result> {
  const key = idemKey(user, 'honey_harvest', d.idem);
  if (await alreadySaved(db, key)) return { ok: true };
  await db.batch([
    db.insert(hiveEvents).values({ hiveId: hive.id, type: 'honey_harvest', occurredOn: d.occurredOn, honeyMl: d.honeyMl, propolisG: d.propolisG, pollenG: d.pollenG, note: d.note, createdBy: user.id, idempotencyKey: key }).onConflictDoNothing(),
    audit(db, user, 'event.honey_harvest', hive.id, { honeyMl: d.honeyMl, propolisG: d.propolisG, pollenG: d.pollenG }),
  ]);
  return { ok: true };
}

export async function addQueenCell(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof queenCellSchema>): Promise<Result> {
  const key = idemKey(user, 'queen_cell_taken', d.idem);
  if (await alreadySaved(db, key)) return { ok: true };
  const t = await findTarget(db, hive.id, d.targetCode);
  if (t.error) return { ok: false, error: t.error };
  await db.batch([
    db.insert(hiveEvents).values({ hiveId: hive.id, type: 'queen_cell_taken', occurredOn: d.occurredOn, queenCells: d.queenCells, targetHiveId: t.id, note: d.note, createdBy: user.id, idempotencyKey: key }).onConflictDoNothing(),
    audit(db, user, 'event.queen_cell_taken', hive.id, { queenCells: d.queenCells, target: d.targetCode }),
  ]);
  return { ok: true };
}

export async function addBroodSplit(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof broodSplitSchema>): Promise<Result> {
  const key = idemKey(user, 'brood_split', d.idem);
  if (await alreadySaved(db, key)) return { ok: true };
  const t = await findTarget(db, hive.id, d.targetCode);
  if (t.error) return { ok: false, error: t.error };
  await db.batch([
    db.insert(hiveEvents).values({ hiveId: hive.id, type: 'brood_split', occurredOn: d.occurredOn, targetHiveId: t.id, note: d.note, createdBy: user.id, idempotencyKey: key }).onConflictDoNothing(),
    audit(db, user, 'event.brood_split', hive.id, { target: d.targetCode }),
  ]);
  return { ok: true };
}

export async function addNote(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof noteSchema>): Promise<Result> {
  const key = idemKey(user, 'note', d.idem);
  if (await alreadySaved(db, key)) return { ok: true };
  await db.batch([
    db.insert(hiveEvents).values({ hiveId: hive.id, type: 'note', occurredOn: d.occurredOn, note: d.note, isPublic: d.isPublic, createdBy: user.id, idempotencyKey: key }).onConflictDoNothing(),
    audit(db, user, 'event.note', hive.id),
  ]);
  return { ok: true };
}

/** คำสั่งเปลี่ยนสถานะ (บันทึกเหตุการณ์ + อัปเดตรัง + audit) — แยกออกมาให้ fillMissing รวมเป็น batch เดียวได้ */
function statusStatements(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof statusSchema>, key: string | null): BatchItem<'sqlite'>[] {
  const sold = d.status === 'sold';
  return [
    db.insert(hiveEvents).values({ hiveId: hive.id, type: 'status_change', occurredOn: d.occurredOn, fromStatus: hive.status, toStatus: d.status, note: d.note ?? d.collapseReason, createdBy: user.id, idempotencyKey: key }).onConflictDoNothing(),
    db
      .update(hives)
      .set({
        status: d.status,
        statusChangedOn: d.occurredOn,
        collapseReason: d.status === 'collapsed' ? (d.collapseReason ?? null) : null,
        soldOn: sold ? d.occurredOn : null,
        soldPrice: sold ? (d.soldPrice ?? hive.salePrice ?? null) : null,
        forSale: d.status === 'active' ? hive.forSale : false,
        notes: resolveUnknownNotes(hive.notes, { status: d.status, queenBornOn: hive.queenBornOn, acquiredOn: hive.acquiredOn, hasQueenSource: hive.queenSourceHiveId != null, hasBroodSource: hive.broodSourceHiveId != null }),
        ...touch,
      })
      .where(eq(hives.id, hive.id)),
    audit(db, user, 'hive.status', hive.id, { from: hive.status, to: d.status }),
  ];
}

export async function changeStatus(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof statusSchema>): Promise<Result> {
  const key = idemKey(user, 'status_change', d.idem);
  if (await alreadySaved(db, key)) return { ok: true };
  if (d.status === hive.status) return { ok: false, error: 'รังอยู่ในสถานะนี้แล้ว' };
  await db.batch(statusStatements(db, user, hive, d, key) as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { ok: true };
}

/** แก้ไขข้อมูลรัง (ไม่รวมสถานะ/การขาย ซึ่งมีฟอร์มแยก) */
export async function updateHive(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof editHiveSchema>): Promise<Result> {
  const source = async (code: string | undefined, label: string): Promise<{ id: number | null; error?: string }> => {
    if (!code) return { id: null };
    if (code === hive.code) return { id: null, error: `${label}ต้องไม่ใช่รังเดียวกัน` };
    const s = await db.query.hives.findFirst({ where: eq(hives.code, code), columns: { id: true } });
    return s ? { id: s.id } : { id: null, error: `ไม่พบ${label} ${code}` };
  };
  const queen = await source(d.queenSourceCode, 'รังแม่ (ไข่นาง)');
  if (queen.error) return { ok: false, error: queen.error };
  const brood = await source(d.broodSourceCode, 'รังแม่ (ไข่อ่อน)');
  if (brood.error) return { ok: false, error: brood.error };
  if (await wouldCreateCycle(db, hive.id, queen.id)) return { ok: false, error: CYCLE_ERROR(d.queenSourceCode!) };
  if (await wouldCreateCycle(db, hive.id, brood.id)) return { ok: false, error: CYCLE_ERROR(d.broodSourceCode!) };

  const acquiredOn = d.acquiredOn ?? null;
  const notes = resolveUnknownNotes(d.notes, {
    status: hive.status,
    queenBornOn: d.queenBornOn ?? null,
    acquiredOn,
    hasQueenSource: queen.id != null,
    hasBroodSource: brood.id != null,
  });

  const next = {
    origin: d.origin,
    originPlace: d.originPlace ?? null,
    acquiredOn,
    // วันที่เดิมที่ระบุแค่เดือน/ปี ถ้าไม่แก้ ให้คงความแม่นยำเดิมไว้
    acquiredOnPrecision: !acquiredOn ? null : acquiredOn === hive.acquiredOn ? hive.acquiredOnPrecision : ('day' as const),
    queenBornOn: d.queenBornOn ?? null,
    boxType: d.boxType,
    queenSourceHiveId: queen.id,
    broodSourceHiveId: brood.id,
    purchasePrice: d.purchasePrice ?? null,
    collapseReason: hive.status === 'collapsed' ? (d.collapseReason ?? null) : hive.collapseReason,
    publicNote: d.publicNote ?? null,
    notes,
  };
  // บันทึกว่าแก้ช่องไหน (ไม่เก็บเนื้อหาหมายเหตุภายในลง audit)
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== hive[k]);
  if (changed.length === 0) return { ok: true };
  const diff = Object.fromEntries(changed.filter((k) => k !== 'notes').map((k) => [k, { from: hive[k], to: next[k] }]));

  await db.batch([
    db.update(hives).set({ ...next, ...touch }).where(eq(hives.id, hive.id)),
    audit(db, user, 'hive.update', hive.id, { fields: changed, ...diff }),
  ]);
  return { ok: true };
}

export async function updateSale(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof saleSchema>): Promise<Result> {
  if (d.forSale && hive.status !== 'active') return { ok: false, error: 'ตั้งขายได้เฉพาะรังที่ยังอยู่ (active)' };
  await db.batch([
    db.update(hives).set({ forSale: d.forSale, salePrice: d.forSale ? d.salePrice : hive.salePrice, ...touch }).where(eq(hives.id, hive.id)),
    audit(db, user, 'hive.sale', hive.id, { forSale: d.forSale, salePrice: d.salePrice }),
  ]);
  return { ok: true };
}

// ---------- งานเตรียมข้อมูลก่อนเปิดเว็บ ----------

/** รังที่ยังไม่มีรูปสมุดพก (ค่าเริ่มต้น: เฉพาะรังที่ยังอยู่) เรียงตามเลขรัง */
export async function listHivesWithoutPhoto(db: Db, includeAll = false) {
  return db
    .select({ code: hives.code, status: hives.status, origin: hives.origin, originPlace: hives.originPlace, acquiredOn: hives.acquiredOn, acquiredOnPrecision: hives.acquiredOnPrecision, forSale: hives.forSale })
    .from(hives)
    .where(and(includeAll ? undefined : eq(hives.status, 'active'), sql`not exists (select 1 from hive_media m where m.hive_id = ${hives.id} and m.kind = 'passport' and m.r2_key is not null)`))
    .orderBy(asc(hives.id));
}

/** รังที่ยังมีข้อมูล ??? ค้างอยู่ พร้อมสิ่งที่ต้องใช้ตัดสินว่าหัวข้อไหนเติมแล้ว */
export async function listIncompleteHives(db: Db) {
  const queenSrc = alias(hives, 'q');
  const broodSrc = alias(hives, 'b');
  return db
    .select({ code: hives.code, status: hives.status, origin: hives.origin, originPlace: hives.originPlace, acquiredOn: hives.acquiredOn, queenBornOn: hives.queenBornOn, notes: hives.notes, queenSource: queenSrc.code, broodSource: broodSrc.code })
    .from(hives)
    .leftJoin(queenSrc, eq(queenSrc.id, hives.queenSourceHiveId))
    .leftJoin(broodSrc, eq(broodSrc.id, hives.broodSourceHiveId))
    .where(hasUnknownNote)
    .orderBy(asc(hives.id));
}

/** เติมเฉพาะข้อมูลที่รู้ (ช่องที่ไม่ส่งมาไม่ถูกแตะ) แล้วลบบรรทัด ??? ที่เติมแล้ว */
export async function fillMissing(db: Db, user: SessionUser, hive: Hive, d: z.output<typeof fillSchema>): Promise<Result> {
  if (!d.queenBornOn && !d.acquiredOn && !d.queenSourceCode && !d.broodSourceCode && !d.status) return { ok: false, error: 'ยังไม่ได้กรอกข้อมูล' };

  const find = async (code?: string) => {
    if (!code) return { id: undefined as number | null | undefined };
    if (code === hive.code) return { id: null, error: 'รังแม่ต้องไม่ใช่รังเดียวกัน' };
    const s = await db.query.hives.findFirst({ where: eq(hives.code, code), columns: { id: true } });
    return s ? { id: s.id } : { id: null, error: `ไม่พบรัง ${code}` };
  };
  const q = await find(d.queenSourceCode);
  if ('error' in q && q.error) return { ok: false, error: q.error };
  const b = await find(d.broodSourceCode);
  if ('error' in b && b.error) return { ok: false, error: b.error };

  if (await wouldCreateCycle(db, hive.id, q.id)) return { ok: false, error: CYCLE_ERROR(d.queenSourceCode!) };
  if (await wouldCreateCycle(db, hive.id, b.id)) return { ok: false, error: CYCLE_ERROR(d.broodSourceCode!) };

  // สถานะ: ใช้คำสั่งเดียวกับการเปลี่ยนสถานะปกติ (บันทึกเหตุการณ์ + เคลียร์ ??? สถานะรัง)
  // ทั้งหมดอยู่ใน batch เดียว — สำเร็จพร้อมกันหรือไม่บันทึกเลย (เดิมแยก 2 ครั้ง ถ้าครั้งหลังล้ม สถานะเปลี่ยนแต่ข้อมูลอื่นหาย)
  const statusChange = d.status && d.status !== hive.status;
  const stmts: BatchItem<'sqlite'>[] = statusChange ? statusStatements(db, user, hive, { status: d.status!, occurredOn: todayBangkok() } as z.output<typeof statusSchema>, null) : [];
  const status = statusChange ? d.status! : hive.status;

  const next = {
    queenBornOn: d.queenBornOn ?? hive.queenBornOn,
    acquiredOn: d.acquiredOn ?? hive.acquiredOn,
    acquiredOnPrecision: d.acquiredOn ? ('day' as const) : hive.acquiredOnPrecision,
    queenSourceHiveId: q.id ?? hive.queenSourceHiveId,
    broodSourceHiveId: b.id ?? hive.broodSourceHiveId,
  };
  // คำนวณหมายเหตุ ??? จากสถานะใหม่ + ข้อมูลที่เติม (คำสั่งนี้อยู่หลังคำสั่งสถานะ จึงเป็นค่าสุดท้าย)
  const notes = resolveUnknownNotes(hive.notes, { status, queenBornOn: next.queenBornOn, acquiredOn: next.acquiredOn, hasQueenSource: next.queenSourceHiveId != null, hasBroodSource: next.broodSourceHiveId != null });
  stmts.push(
    db.update(hives).set({ ...next, notes, ...touch }).where(eq(hives.id, hive.id)),
    audit(db, user, 'hive.fill', hive.id, { fields: Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] != null) }),
  );
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { ok: true };
}

/** "ไม่ทราบจริง ๆ": เลิกเตือนหัวข้อนี้ (เติมข้อมูลทีหลังได้เสมอ) */
export async function markUnknown(db: Db, user: SessionUser, hive: Hive, topic: string): Promise<Result> {
  const notes = confirmUnknown(hive.notes, topic);
  if (notes === hive.notes) return { ok: false, error: 'ไม่พบหัวข้อนี้ในรังนี้' };
  await db.batch([db.update(hives).set({ notes, ...touch }).where(eq(hives.id, hive.id)), audit(db, user, 'hive.confirm_unknown', hive.id, { topic })]);
  return { ok: true };
}

/** รหัสรังถัดไป (A148 …) */
export async function nextHiveCode(db: Db): Promise<string> {
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${hives.id}), 0)` }).from(hives);
  return `A${max + 1}`;
}

export async function createHive(db: Db, user: SessionUser, d: z.output<typeof newHiveSchema>): Promise<Result & { code?: string }> {
  // ส่งซ้ำด้วยคีย์เดิม (กดสองครั้ง/เน็ตช้าแล้วกดใหม่) → ตอบรังที่สร้างไว้แล้ว ไม่สร้างรังใหม่
  const createKey = d.idem ? `ui:${user.id}:${d.idem}` : null;
  const existing = async () => (createKey ? await db.query.hives.findFirst({ where: eq(hives.createKey, createKey), columns: { code: true } }) : undefined);
  const prev = await existing();
  if (prev) return { ok: true, code: prev.code };
  const queen = d.queenSourceCode ? await db.query.hives.findFirst({ where: eq(hives.code, d.queenSourceCode), columns: { id: true } }) : null;
  const brood = d.broodSourceCode ? await db.query.hives.findFirst({ where: eq(hives.code, d.broodSourceCode), columns: { id: true } }) : null;
  if (d.queenSourceCode && !queen) return { ok: false, error: `ไม่พบรังแม่ ${d.queenSourceCode}` };
  if (d.broodSourceCode && !brood) return { ok: false, error: `ไม่พบรังแม่ ${d.broodSourceCode}` };

  const code = await nextHiveCode(db);
  const id = codeToId(code);
  const acquiredOn = d.acquiredOn ?? null;
  const stmts: BatchItem<'sqlite'>[] = [
      db.insert(hives).values({
        id, code, speciesId: 1, origin: d.origin, originPlace: d.originPlace, acquiredOn, acquiredOnPrecision: acquiredOn ? 'day' : null,
        queenBornOn: d.queenBornOn, boxType: d.boxType, status: 'active', queenSourceHiveId: queen?.id, broodSourceHiveId: brood?.id,
        purchasePrice: d.purchasePrice, notes: d.notes, createKey,
      }),
      // บันทึกในรังแม่ให้อัตโนมัติ (วันที่ = วันที่ได้มา ถ้ามี)
      ...(brood && acquiredOn ? [db.insert(hiveEvents).values({ hiveId: brood.id, type: 'brood_split', occurredOn: acquiredOn, targetHiveId: id, createdBy: user.id, idempotencyKey: `auto:${code}:brood` }).onConflictDoNothing()] : []),
      ...(queen && acquiredOn ? [db.insert(hiveEvents).values({ hiveId: queen.id, type: 'queen_cell_taken', occurredOn: acquiredOn, queenCells: 1, targetHiveId: id, createdBy: user.id, idempotencyKey: `auto:${code}:queen` }).onConflictDoNothing()] : []),
      audit(db, user, 'hive.create', id, { code, origin: d.origin }),
  ];
  try {
    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (e) {
    // คำขอซ้ำที่มาพร้อมกันจะชนกันตรงนี้ → ถ้าอีกคำขอสร้างสำเร็จแล้ว ตอบรังนั้น
    const dup = await existing();
    if (dup) return { ok: true, code: dup.code };
    if (/UNIQUE/i.test(String(e))) return { ok: false, error: 'สร้างรังไม่สำเร็จ (อาจมีคนสร้างรหัสเดียวกันพร้อมกัน) ลองอีกครั้ง' };
    throw e;
  }
  return { ok: true, code };
}
