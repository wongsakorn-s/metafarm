// ล็อตน้ำผึ้ง (Phase 4.3): รวมการเก็บน้ำหวาน → ล็อต → บรรจุขวด (เพิ่มสต็อก) → ขาย (ผูกล็อตเก่าก่อน)
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { auditLogs, bottlings, hiveEvents, hives, honeyLots, lotSources, productVariants, products } from '../db/schema.ts';
import { lotCode, lotPrefix, maxBottles, nextLotSeq, pickLot, remainingMl, type bottlingSchema, type newLotSchema } from '../lib/lots.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

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
    .where(and(eq(products.category, 'honey'), sql`coalesce(${productVariants.sizeMl}, 0) > 0`))
    .orderBy(asc(productVariants.sizeMl));
}

/** ขวดที่ขายไปแล้วต่อ (ล็อต, ขนาด) — นับเฉพาะออเดอร์ที่ชำระแล้ว/ส่งแล้ว */
const soldSql = (lotId: unknown, variantId: unknown) =>
  sql<number>`coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id where i.lot_id = ${lotId} and i.variant_id = ${variantId} and o.status in ('paid', 'fulfilled')), 0)`;

export async function listLots(db: Db) {
  return db
    .select({
      code: honeyLots.code, harvestedFrom: honeyLots.harvestedFrom, harvestedTo: honeyLots.harvestedTo, totalMl: honeyLots.totalMl,
      bottledMl: sql<number>`coalesce((select sum(b.qty * coalesce(v.size_ml, 0)) from bottlings b join product_variants v on v.id = b.variant_id where b.lot_id = honey_lots.id), 0)`,
      bottles: sql<number>`coalesce((select sum(b.qty) from bottlings b where b.lot_id = honey_lots.id), 0)`,
      sold: sql<number>`coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id where i.lot_id = honey_lots.id and o.status in ('paid', 'fulfilled')), 0)`,
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
      .where(eq(lotSources.lotId, lot.id)).orderBy(asc(hiveEvents.occurredOn), asc(hives.id)),
    db.select({ id: bottlings.id, qty: bottlings.qty, bottledOn: bottlings.bottledOn, unitCost: bottlings.unitCost, variantId: bottlings.variantId, sizeMl: productVariants.sizeMl, label: productVariants.label, product: products.name, sold: soldSql(lot.id, bottlings.variantId) })
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

/** บรรจุขวด: ไม่เกินน้ำผึ้งคงเหลือในล็อต · เพิ่มสต็อกขนาดนั้นทันที */
export async function addBottling(db: Db, user: SessionUser, code: string, d: z.output<typeof bottlingSchema>): Promise<Result> {
  const createKey = d.idem ? `ui:${user.id}:${d.idem}` : null;
  if (createKey && (await db.query.bottlings.findFirst({ where: eq(bottlings.createKey, createKey), columns: { id: true } }))) return { ok: true };
  const got = await getLot(db, code);
  if (!got) return { ok: false, error: 'ไม่พบล็อต' };
  const v = (await honeyVariants(db)).find((x) => x.id === d.variantId);
  if (!v) return { ok: false, error: 'เลือกขนาดขวดน้ำผึ้ง (สินค้าหมวดน้ำผึ้งที่ระบุ มล.)' };
  const max = maxBottles(got.remaining, v.sizeMl!);
  if (d.qty > max) return { ok: false, error: `น้ำผึ้งในล็อตเหลือ ${got.remaining.toLocaleString('th-TH')} มล. บรรจุขวด ${v.sizeMl} มล. ได้อีกไม่เกิน ${max} ขวด` };
  await run(db, [
    db.insert(bottlings).values({ lotId: got.lot.id, variantId: v.id, qty: d.qty, bottledOn: d.bottledOn!, unitCost: d.unitCost ?? null, createKey, createdBy: user.id }),
    db.update(productVariants).set({ stockQty: sql`${productVariants.stockQty} + ${d.qty}`, ...touch }).where(eq(productVariants.id, v.id)),
    audit(db, user, 'lot.bottle', { code, variantId: v.id, qty: d.qty }),
  ]);
  return { ok: true };
}

/** ล็อตสำหรับขวดที่ขาย (ล็อตเก่าก่อน ที่ยังมีขวดขนาดนี้เหลือ) */
export async function lotForSale(db: Db, variantId: number): Promise<number | null> {
  const rows = await db
    .select({ id: honeyLots.id, harvestedTo: honeyLots.harvestedTo, bottled: sql<number>`sum(${bottlings.qty})`, sold: soldSql(honeyLots.id, variantId) })
    .from(bottlings).innerJoin(honeyLots, eq(honeyLots.id, bottlings.lotId))
    .where(eq(bottlings.variantId, variantId))
    .groupBy(honeyLots.id);
  return pickLot(rows);
}

export async function lotCodesByIds(db: Db, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  return new Map((await db.select({ id: honeyLots.id, code: honeyLots.code }).from(honeyLots).where(inArray(honeyLots.id, ids))).map((r) => [r.id, r.code]));
}
