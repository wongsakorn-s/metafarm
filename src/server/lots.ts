// ล็อตน้ำผึ้ง (Phase 4.3): รวมการเก็บน้ำหวาน → ล็อต → บรรจุขวด (เพิ่มสต็อก) → ขาย (แบ่งขวดตามล็อต เก่าก่อน)
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { auditLogs, bottlings, hiveEvents, hives, honeyLots, lotSources, orderItemLots, productVariants, products } from '../db/schema.ts';
import { lotCode, lotPrefix, maxBottles, nextLotSeq, remainingMl, type bottlingSchema, type newLotSchema } from '../lib/lots.ts';
import { canDeleteRecord, canManageFarm, DELETE_DENIED } from '../lib/permissions.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';
import { byCode } from './hives.ts';
import { auditIfChanged } from './versioned.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const touch = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };
const run = (db: Db, stmts: BatchItem<'sqlite'>[]) => db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
const audit = (db: Db, user: SessionUser, action: string, diff?: unknown) => db.insert(auditLogs).values({ userId: user.id, action, entity: 'honey_lot', entityId: null, diff: diff ?? null });

/** การเก็บน้ำหวานที่ยังไม่อยู่ในล็อตไหน (ใหม่ก่อน) */
export async function unassignedHarvests(db: Db) {
  return db
    .select({ id: hiveEvents.id, occurredOn: hiveEvents.occurredOn, ml: hiveEvents.honeyMl, code: hives.code })
    .from(hiveEvents)
    .innerJoin(hives, eq(hives.id, hiveEvents.hiveId))
    .where(and(eq(hiveEvents.type, 'honey_harvest'), sql`coalesce(${hiveEvents.honeyMl}, 0) > 0`, sql`not exists (select 1 from lot_sources s where s.event_id = hive_events.id)`))
    .orderBy(desc(hiveEvents.occurredOn), desc(hiveEvents.id));
}

/** ขวดน้ำผึ้งที่บรรจุได้ (สินค้าหมวดน้ำผึ้งที่ระบุขนาด มล.) */
export async function honeyVariants(db: Db) {
  return db
    .select({ id: productVariants.id, label: productVariants.label, sizeMl: productVariants.sizeMl, product: products.name, stock: productVariants.stockQty })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.category, 'honey'), sql`coalesce(${productVariants.sizeMl}, 0) > 0`, eq(productVariants.hidden, false))) // ขนาดที่ซ่อนไม่บรรจุเพิ่ม
    .orderBy(asc(productVariants.sizeMl));
}

/**
 * ขวดที่ขายไปแล้วต่อ (ล็อต, ขนาด) จาก order_item_lots — นับเฉพาะออเดอร์ที่ชำระแล้ว/ส่งแล้ว
 * ใส่ตัวแปรเป็นชื่อคอลัมน์ตาราง "นอก" แบบตัวอักษร (เช่น sql`honey_lots.id`) หรือค่าตัวเลข — ดู sql-correlation.test.ts
 */
const soldSql = (lotId: unknown, variantId: unknown) =>
  sql<number>`coalesce((select sum(a.qty) from order_item_lots a join order_items oi on oi.id = a.order_item_id join orders o on o.id = oi.order_id
    where a.lot_id = ${lotId} and oi.variant_id = ${variantId} and o.status in ('paid', 'fulfilled')), 0)`;

export async function listLots(db: Db) {
  return db
    .select({
      code: honeyLots.code, harvestedFrom: honeyLots.harvestedFrom, harvestedTo: honeyLots.harvestedTo, totalMl: honeyLots.totalMl,
      bottledMl: sql<number>`coalesce((select sum(b.qty * coalesce(v.size_ml, 0)) from bottlings b join product_variants v on v.id = b.variant_id where b.lot_id = honey_lots.id), 0)`,
      bottles: sql<number>`coalesce((select sum(b.qty) from bottlings b where b.lot_id = honey_lots.id), 0)`,
      sold: sql<number>`coalesce((select sum(a.qty) from order_item_lots a join order_items oi on oi.id = a.order_item_id join orders o on o.id = oi.order_id where a.lot_id = honey_lots.id and o.status in ('paid', 'fulfilled')), 0)`,
      hives: sql<number>`(select count(distinct e.hive_id) from lot_sources s join hive_events e on e.id = s.event_id where s.lot_id = honey_lots.id)`,
    })
    .from(honeyLots)
    .orderBy(desc(honeyLots.harvestedTo), desc(honeyLots.id));
}

export async function getLot(db: Db, code: string) {
  const lot = await db.query.honeyLots.findFirst({ where: eq(honeyLots.code, code) });
  if (!lot) return null;
  const [sources, bottled] = await Promise.all([
    db.select({ occurredOn: hiveEvents.occurredOn, ml: hiveEvents.honeyMl, code: hives.code }).from(lotSources)
      .innerJoin(hiveEvents, eq(hiveEvents.id, lotSources.eventId)).innerJoin(hives, eq(hives.id, hiveEvents.hiveId))
      .where(eq(lotSources.lotId, lot.id)).orderBy(asc(hiveEvents.occurredOn), ...byCode()),
    db.select({ id: bottlings.id, qty: bottlings.qty, bottledOn: bottlings.bottledOn, unitCost: bottlings.unitCost, variantId: bottlings.variantId, createdBy: bottlings.createdBy, createdAt: bottlings.createdAt, sizeMl: productVariants.sizeMl, label: productVariants.label, product: products.name, sold: soldSql(lot.id, bottlings.variantId) })
      .from(bottlings).innerJoin(productVariants, eq(productVariants.id, bottlings.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(bottlings.lotId, lot.id)).orderBy(asc(bottlings.bottledOn), asc(bottlings.id)),
  ]);
  return { lot, sources, bottled, remaining: remainingMl(lot.totalMl, bottled) };
}

export async function createLot(db: Db, user: SessionUser, d: z.output<typeof newLotSchema>): Promise<Result<{ code: string }>> {
  const createKey = d.idem ? `ui:${user.id}:${d.idem}` : null;
  const existing = async () => (createKey ? await db.query.honeyLots.findFirst({ where: eq(honeyLots.createKey, createKey), columns: { code: true } }) : undefined);
  const prev = await existing();
  if (prev) return { ok: true, code: prev.code };
  const ids = [...new Set(d.eventIds)];
  const evs = (await unassignedHarvests(db)).filter((e) => ids.includes(e.id));
  if (evs.length !== ids.length) return { ok: false, error: 'การเก็บน้ำหวานบางรายการอยู่ในล็อตอื่นแล้ว หรือไม่พบ — โหลดหน้าใหม่แล้วเลือกอีกครั้ง' };
  const dates = evs.map((e) => e.occurredOn).sort();
  const from = dates[0]!, to = dates.at(-1)!;
  const total = evs.reduce((s, e) => s + (e.ml ?? 0), 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    const prefix = lotPrefix(to);
    const codes = (await db.select({ code: honeyLots.code }).from(honeyLots).where(like(honeyLots.code, `${prefix}%`))).map((r) => r.code);
    const code = lotCode(to, nextLotSeq(codes, prefix));
    const lotId = sql`(select id from honey_lots where code = ${code})`;
    try {
      await run(db, [
        db.insert(honeyLots).values({ code, harvestedFrom: from, harvestedTo: to, totalMl: total, note: d.note ?? null, createKey, createdBy: user.id }),
        ...evs.map((e) => db.insert(lotSources).values({ lotId: lotId as unknown as number, eventId: e.id })),
        audit(db, user, 'lot.create', { code, events: evs.length, totalMl: total }),
      ]);
      return { ok: true, code };
    } catch (e) {
      const dup = await existing();
      if (dup) return { ok: true, code: dup.code };
      if (/UNIQUE/i.test(String(e))) continue;
      throw e;
    }
  }
  return { ok: false, error: 'สร้างล็อตไม่สำเร็จ ลองอีกครั้ง' };
}

const tooMuch = (remaining: number, sizeMl: number) =>
  `น้ำผึ้งในล็อตเหลือ ${remaining.toLocaleString('th-TH')} มล. บรรจุขวด ${sizeMl} มล. ได้อีกไม่เกิน ${maxBottles(remaining, sizeMl)} ขวด`;

/**
 * บรรจุขวด: ไม่เกินน้ำผึ้งคงเหลือในล็อต · เพิ่มสต็อกขนาดนั้นทันที
 * ตรวจคงเหลือ "ในคำสั่งเขียน" (insert … select … where เหลือพอ) — เดิมตรวจก่อนแล้วค่อยเขียน สองเครื่องบรรจุพร้อมกันจึงเกินล็อตได้
 * สต็อกและ audit เพิ่มเฉพาะเมื่อแถวบรรจุถูกเขียนจริง (อ้างด้วย create_key ใน batch เดียวกัน)
 */
export async function addBottling(db: Db, user: SessionUser, code: string, d: z.output<typeof bottlingSchema>): Promise<Result> {
  const createKey = d.idem ? `ui:${user.id}:${d.idem}` : `auto:${crypto.randomUUID()}`;
  const saved = async () => !!(await db.query.bottlings.findFirst({ where: eq(bottlings.createKey, createKey), columns: { id: true } }));
  if (d.idem && (await saved())) return { ok: true };
  const got = await getLot(db, code);
  if (!got) return { ok: false, error: 'ไม่พบล็อต' };
  const v = (await honeyVariants(db)).find((x) => x.id === d.variantId);
  if (!v) return { ok: false, error: 'เลือกขนาดขวดน้ำผึ้ง (สินค้าหมวดน้ำผึ้งที่ระบุ มล.)' };
  const size = v.sizeMl!;
  if (d.qty > maxBottles(got.remaining, size)) return { ok: false, error: tooMuch(got.remaining, size) };
  const lotId = got.lot.id;
  const unitCost = canManageFarm(user) ? (d.unitCost ?? null) : null; // ต้นทุน = เจ้าของ/แอดมินเท่านั้น
  const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
  try {
    await run(db, [
      // คอลัมน์ครบตามลำดับในตาราง (drizzle insert … select): id, lot_id, variant_id, qty, bottled_on, unit_cost, create_key, created_by, created_at, updated_at
      db.insert(bottlings).select(sql`select null, ${lotId}, ${v.id}, ${d.qty}, ${d.bottledOn!}, ${unitCost}, ${createKey}, ${user.id}, ${now}, ${now}
        where (select total_ml from honey_lots where id = ${lotId})
            - coalesce((select sum(b.qty * coalesce(pv.size_ml, 0)) from bottlings b join product_variants pv on pv.id = b.variant_id where b.lot_id = ${lotId}), 0)
            >= ${d.qty * size}`),
      db.update(productVariants).set({ stockQty: sql`${productVariants.stockQty} + ${d.qty}`, ...touch })
        .where(and(eq(productVariants.id, v.id), sql`exists (select 1 from bottlings b where b.create_key = ${createKey})`)),
      auditIfChanged(db, user.id, 'lot.bottle', 'honey_lot', lotId, { code, variantId: v.id, qty: d.qty }),
    ]);
  } catch (e) {
    // ส่งฟอร์มเดิมซ้ำพร้อมกัน (กดซ้ำ/คิวรอส่ง) → ติด UNIQUE ของ create_key = อีกคำขอบันทึกไปแล้ว
    if (/UNIQUE/i.test(String(e)) && (await saved())) return { ok: true };
    throw e;
  }
  if (await saved()) return { ok: true };
  // ไม่ถูกเขียน = มีคนบรรจุจากล็อตนี้ไปพร้อมกัน จนเหลือไม่พอ
  const now2 = await getLot(db, code);
  return { ok: false, error: `${tooMuch(now2?.remaining ?? 0, size)} (เพิ่งมีการบรรจุจากล็อตนี้ อาจจากอีกเครื่อง)` };
}

/**
 * คำสั่งใน batch "ชำระแล้ว": แบ่งขวดของบรรทัดนี้ให้ล็อต เก่าก่อน ล็อตละไม่เกินที่ยังเหลือ (บรรจุ − ขายไปแล้ว)
 * คำนวณในคำสั่งเดียว (window function) ตอน batch รัน — ชำระสองออเดอร์พร้อมกันจึงไม่ได้ขวดสุดท้ายเดียวกัน
 * ขวดที่ล็อตไม่พอ = สต็อกที่ใส่มือ ไม่มีแถว
 */
export const allocateLots = (db: Db, orderItemId: number, variantId: number, qty: number) =>
  db.insert(orderItemLots).select(sql`
    select ${orderItemId}, lot_id, min(remaining, ${qty} - before) from (
      select lot_id, remaining,
             coalesce(sum(remaining) over (order by harvested_to, lot_id rows between unbounded preceding and 1 preceding), 0) as before
        from (
          select x.lot_id as lot_id, x.harvested_to as harvested_to, x.bottled - ${soldSql(sql`x.lot_id`, variantId)} as remaining
            from (select b.lot_id as lot_id, l.harvested_to as harvested_to, sum(b.qty) as bottled
                    from bottlings b join honey_lots l on l.id = b.lot_id
                   where b.variant_id = ${variantId}
                   group by b.lot_id, l.harvested_to) x
        ) r
       where remaining > 0
    ) w
    where before < ${qty}`);

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * ลบการบรรจุที่บันทึกผิด: หักสต็อกคืน — ได้เฉพาะเมื่อขวดชุดนี้ยังไม่ถูกขาย (ล็อตนี้ขนาดนี้ยังเหลือขวดพอ) และสต็อกยังมีพอ
 * ตรวจในคำสั่งลบเอง (กันลบพร้อมการชำระ) · หักสต็อก/audit เฉพาะเมื่อลบได้จริง (changes())
 */
export async function deleteBottling(db: Db, user: SessionUser, code: string, bottlingId: number): Promise<DeleteResult> {
  if (!Number.isSafeInteger(bottlingId) || bottlingId <= 0) return { ok: false, error: 'ไม่พบรายการบรรจุนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  const lot = await db.query.honeyLots.findFirst({ where: eq(honeyLots.code, code), columns: { id: true } });
  if (!lot) return { ok: false, error: 'ไม่พบล็อต' };
  const b = await db.query.bottlings.findFirst({ where: and(eq(bottlings.id, bottlingId), eq(bottlings.lotId, lot.id)) });
  if (!b) return { ok: true }; // ลบไปแล้ว (กดซ้ำ)
  if (!canDeleteRecord(user, b)) return { ok: false, error: DELETE_DENIED };
  // ค่าตัวเลขเป็นตัวแปรเดี่ยว (ไม่ใช่ ${x.y}) — sql-correlation.test.ts ห้ามรูปแบบนั้นใน subquery
  const { variantId, qty } = b, lotId = lot.id;
  await run(db, [
    db.delete(bottlings).where(and(eq(bottlings.id, b.id), sql`
      (select stock_qty from product_variants where id = ${variantId}) >= ${qty}
      and (select sum(x.qty) from bottlings x where x.lot_id = ${lotId} and x.variant_id = ${variantId}) - ${qty} >= ${soldSql(lotId, variantId)}`)),
    db.update(productVariants).set({ stockQty: sql`${productVariants.stockQty} - ${b.qty}`, ...touch }).where(and(eq(productVariants.id, b.variantId), sql`changes() > 0`)),
    auditIfChanged(db, user.id, 'lot.unbottle', 'honey_lot', lot.id, { code, variantId: b.variantId, qty: b.qty, bottledOn: b.bottledOn, unitCost: b.unitCost }),
  ]);
  if (!(await db.query.bottlings.findFirst({ where: eq(bottlings.id, b.id), columns: { id: true } }))) return { ok: true };
  return { ok: false, error: `ลบไม่ได้ — ขวดจากล็อตนี้ขายไปแล้ว หรือสต็อกเหลือไม่ถึง ${b.qty} ขวด (ถ้าขวดแตก/หาย ให้แก้จำนวนสต็อกในหน้าสินค้าแทน)` };
}

/** ลบล็อตที่สร้างผิด: ได้เฉพาะล็อตที่ยังไม่บรรจุขวด — การเก็บน้ำหวานกลับไปเป็น "ยังไม่อยู่ในล็อต" (เลือกใหม่หรือลบได้) */
export async function deleteLot(db: Db, user: SessionUser, code: string): Promise<DeleteResult> {
  const lot = await db.query.honeyLots.findFirst({ where: eq(honeyLots.code, code) });
  if (!lot) return { ok: true };
  if (!canDeleteRecord(user, lot)) return { ok: false, error: DELETE_DENIED };
  const lotId = lot.id;
  const unbottled = sql`not exists (select 1 from bottlings b where b.lot_id = ${lotId})`;
  await run(db, [
    db.delete(lotSources).where(and(eq(lotSources.lotId, lot.id), unbottled)),
    db.delete(honeyLots).where(and(eq(honeyLots.id, lot.id), unbottled)),
    auditIfChanged(db, user.id, 'lot.delete', 'honey_lot', lot.id, { code, totalMl: lot.totalMl, harvestedFrom: lot.harvestedFrom, harvestedTo: lot.harvestedTo }),
  ]);
  if (!(await db.query.honeyLots.findFirst({ where: eq(honeyLots.id, lot.id), columns: { id: true } }))) return { ok: true };
  return { ok: false, error: 'ล็อตนี้บรรจุขวดแล้ว — ลบการบรรจุทุกรายการก่อน แล้วจึงลบล็อตได้' };
}

export async function lotCodesByIds(db: Db, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  return new Map((await db.select({ id: honeyLots.id, code: honeyLots.code }).from(honeyLots).where(inArray(honeyLots.id, ids))).map((r) => [r.id, r.code]));
}
