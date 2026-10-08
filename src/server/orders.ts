// ออเดอร์และลูกค้า (Phase 4.2) — ข้อมูลหลังบ้านทั้งหมด
// กติกา: ตัดสต็อก/เปลี่ยนรังเป็น "ขายแล้ว" ตอน "ชำระแล้ว" · รังที่อยู่ในออเดอร์ค้างถูกเอาออกจากหน้าขาย · ยกเลิก = คืนทุกอย่าง
// ทุกการเปลี่ยนแปลงของออเดอร์หนึ่งครั้งอยู่ใน db.batch เดียว (สำเร็จพร้อมกันหรือไม่บันทึกเลย)
import { and, asc, desc, eq, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';
import { auditLogs, customers, hives, honeyLots, orderItems, orders, productVariants, products } from '../db/schema.ts';
import { canMove, nextSeq, orderCode, type OrderStatus, type customerSchema, type fulfillOrderSchema, type newOrderSchema, type payOrderSchema } from '../lib/orders.ts';
import type { SessionUser } from './auth.ts';
import { isOnceConflict, once } from './versioned.ts';
import type { Db } from './db.ts';
import { statusStatements } from './hives.ts';
import { lotForSale } from './lots.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;
const touch = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };
const audit = (db: Db, user: SessionUser, action: string, entity: string, entityId: number | null, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: user.id, action, entity, entityId, diff: diff ?? null });
const run = (db: Db, stmts: BatchItem<'sqlite'>[]) => db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
/** ออเดอร์ที่ยังไม่จบ (จองรังไว้) */
const OPEN: OrderStatus[] = ['awaiting_payment', 'paid'];
const totalSql = sql<number>`(coalesce((select sum(i.qty * i.unit_price) from order_items i where i.order_id = orders.id), 0) + ${orders.shipFee})`;

// ---------- อ่าน ----------

export interface OrderFilter { status?: OrderStatus | 'open'; q?: string; customerId?: number }

export async function listOrders(db: Db, f: OrderFilter = {}) {
  const q = f.q?.replace(/[%_\\]/g, '').trim();
  const where = and(
    f.status === 'open' ? inArray(orders.status, OPEN) : f.status ? eq(orders.status, f.status) : undefined,
    f.customerId ? eq(orders.customerId, f.customerId) : undefined,
    q ? or(like(orders.code, `%${q}%`), like(customers.name, `%${q}%`), like(customers.phone, `%${q}%`)) : undefined,
  );
  return db
    .select({
      code: orders.code, status: orders.status, orderedOn: orders.orderedOn, channel: orders.channel, shipMethod: orders.shipMethod,
      customerName: customers.name, customerId: orders.customerId, total: totalSql,
      items: sql<string>`(select group_concat(i.label || case when i.qty > 1 then ' ×' || i.qty else '' end, ', ') from order_items i where i.order_id = orders.id)`,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(where)
    .orderBy(desc(orders.orderedOn), desc(orders.id))
    .limit(200);
}

export async function orderCounts(db: Db) {
  const rows = await db.select({ status: orders.status, n: sql<number>`count(*)`, total: sql<number>`sum(${totalSql})` }).from(orders).groupBy(orders.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r])) as Partial<Record<OrderStatus, { n: number; total: number }>>;
  return { awaiting: by.awaiting_payment?.n ?? 0, awaitingTotal: by.awaiting_payment?.total ?? 0, toShip: by.paid?.n ?? 0, all: rows.reduce((s, r) => s + r.n, 0) };
}

export async function getOrder(db: Db, code: string) {
  const o = await db.query.orders.findFirst({ where: eq(orders.code, code) });
  if (!o) return null;
  const [items, customer] = await Promise.all([
    db.select({ item: orderItems, hiveCode: hives.code, lotCode: honeyLots.code }).from(orderItems).leftJoin(hives, eq(hives.id, orderItems.hiveId)).leftJoin(honeyLots, eq(honeyLots.id, orderItems.lotId)).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id)),
    o.customerId ? db.query.customers.findFirst({ where: eq(customers.id, o.customerId) }) : Promise.resolve(undefined),
  ]);
  return { order: o, items: items.map((r) => ({ ...r.item, hiveCode: r.hiveCode, lotCode: r.lotCode })), customer: customer ?? null };
}

/** ตัวเลือกในฟอร์มออเดอร์ใหม่: ลูกค้า (ล่าสุดก่อน), สินค้า, รังที่ขายได้ (ยังอยู่ และไม่ได้อยู่ในออเดอร์ค้าง) */
export async function orderFormOptions(db: Db) {
  const [cust, variants, sellable] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers)
      .orderBy(desc(sql`coalesce((select max(o.ordered_on) from orders o where o.customer_id = customers.id), ${customers.createdAt})`), asc(customers.name)),
    db.select({ id: productVariants.id, label: productVariants.label, sizeMl: productVariants.sizeMl, price: productVariants.priceThb, stock: productVariants.stockQty, product: products.name })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).orderBy(asc(products.sortOrder), asc(productVariants.sortOrder), asc(productVariants.id)),
    db.select({ id: hives.id, code: hives.code, forSale: hives.forSale, salePrice: hives.salePrice }).from(hives)
      .where(and(eq(hives.status, 'active'), sql`not exists (select 1 from order_items i join orders o on o.id = i.order_id where i.hive_id = hives.id and o.status in ('awaiting_payment', 'paid'))`))
      .orderBy(desc(hives.forSale), asc(hives.id)),
  ]);
  return { customers: cust, variants, hives: sellable };
}

// ---------- สร้าง ----------

/** ป้ายสินค้า ณ ตอนขาย: "น้ำผึ้งชันโรงขนเงิน ปี 2569 · Size เล็ก (50 มล.)" */
const variantLabel = (v: { product: string; label: string; sizeMl: number | null }, only: boolean) =>
  only ? v.product : `${v.product} · ${v.label}${v.sizeMl && !v.label.includes(String(v.sizeMl)) ? ` (${v.sizeMl} มล.)` : ''}`;

export async function createOrder(db: Db, user: SessionUser, d: z.output<typeof newOrderSchema>): Promise<Result<{ code: string }>> {
  const createKey = d.idem ? `ui:${user.id}:${d.idem}` : null;
  const existing = async () => (createKey ? await db.query.orders.findFirst({ where: eq(orders.createKey, createKey), columns: { code: true } }) : undefined);
  const prev = await existing();
  if (prev) return { ok: true, code: prev.code };

  // ตรวจรายการ: สินค้ามีจริง · รังยังอยู่และไม่ได้อยู่ในออเดอร์ค้าง
  const variantIds = d.items.filter((i) => i.kind === 'variant').map((i) => i.id);
  const hiveIds = d.items.filter((i) => i.kind === 'hive').map((i) => i.id);
  const opts = await orderFormOptions(db);
  const vmap = new Map(opts.variants.map((v) => [v.id, v]));
  const hmap = new Map(opts.hives.map((h) => [h.id, h]));
  for (const id of variantIds) if (!vmap.has(id)) return { ok: false, error: 'มีสินค้าที่ไม่พบในระบบ — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  for (const id of hiveIds) if (!hmap.has(id)) {
    const h = await db.query.hives.findFirst({ where: eq(hives.id, id), columns: { code: true } });
    return { ok: false, error: `รัง ${h?.code ?? id} ขายไม่ได้ (ขายไปแล้ว ไม่ได้อยู่ในสถานะ "ยังอยู่" หรืออยู่ในออเดอร์อื่น)` };
  }
  if (new Set(hiveIds).size !== hiveIds.length) return { ok: false, error: 'เลือกรังเดียวกันซ้ำ' };

  // ลูกค้า: เดิม หรือสร้างใหม่ (สร้างก่อนแยกต่างหาก — ลูกค้าที่ไม่มีออเดอร์ไม่ทำให้อะไรผิด)
  let customerId = d.customerMode === 'existing' ? d.customerId! : null;
  if (d.customerMode === 'existing' && !opts.customers.some((c) => c.id === customerId)) return { ok: false, error: 'ไม่พบลูกค้านี้' };
  if (d.customerMode === 'new') {
    const c = d.customer!;
    const [row] = await db.insert(customers).values({ name: c.name!, phone: c.phone ?? null, lineName: c.lineName ?? null, address: c.address ?? null, notes: c.notes ?? null }).returning({ id: customers.id });
    customerId = row!.id;
    await db.insert(auditLogs).values({ userId: user.id, action: 'customer.create', entity: 'customer', entityId: customerId });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const prefix = orderCode(d.orderedOn!, 0).slice(0, 6); // "S2569-"
    const codes = (await db.select({ code: orders.code }).from(orders).where(like(orders.code, `${prefix}%`))).map((r) => r.code);
    const code = orderCode(d.orderedOn!, nextSeq(codes));
    const orderId = sql`(select id from orders where code = ${code})`;
    const status: OrderStatus = d.paidNow ? 'paid' : 'awaiting_payment';
    const stmts: BatchItem<'sqlite'>[] = [
      db.insert(orders).values({
        code, customerId, channel: d.channel, orderedOn: d.orderedOn!, status, shipMethod: d.shipMethod, shipFee: d.shipFee, note: d.note ?? null,
        paidOn: d.paidNow ? d.orderedOn! : null, payMethod: d.paidNow ? d.payMethod! : null, createKey, createdBy: user.id,
      }),
      ...d.items.map((i) => {
        const h = i.kind === 'hive' ? hmap.get(i.id)! : null;
        return db.insert(orderItems).values({
          orderId: orderId as unknown as number, kind: i.kind, variantId: i.kind === 'variant' ? i.id : null, hiveId: h ? h.id : null,
          label: h ? `รังชันโรงขนเงิน ${h.code}` : variantLabel(vmap.get(i.id)!, opts.variants.filter((x) => x.product === vmap.get(i.id)!.product).length === 1), qty: i.qty, unitPrice: i.unitPrice, prevForSale: h ? h.forSale : null,
        });
      }),
      // รังในออเดอร์: เอาออกจากหน้าขายทันที (กันขายซ้ำ)
      ...(hiveIds.length ? [db.update(hives).set({ forSale: false, ...touch }).where(inArray(hives.id, hiveIds))] : []),
      audit(db, user, 'order.create', 'order', null, { code, items: d.items.length, paid: d.paidNow }),
    ];
    try {
      await run(db, stmts);
    } catch (e) {
      const dup = await existing();
      if (dup) return { ok: true, code: dup.code };
      if (/UNIQUE/i.test(String(e))) continue; // ชนรหัสกับออเดอร์ที่สร้างพร้อมกัน → ลองรหัสถัดไป
      throw e;
    }
    if (d.paidNow) {
      const r = await applyPaid(db, user, code, { paidOn: d.orderedOn!, payMethod: d.payMethod! }, true);
      if (!r.ok) return r;
    }
    return { ok: true, code };
  }
  return { ok: false, error: 'สร้างออเดอร์ไม่สำเร็จ ลองอีกครั้ง' };
}

// ---------- เปลี่ยนสถานะ ----------

/** กุญแจครั้งเดียวต่อ (ออเดอร์, สถานะ) — มี created_at ด้วย เผื่อเลข id ถูกใช้ซ้ำหลังล้างข้อมูลในเครื่อง */
const onceKey = (o: { id: number; createdAt: string }, to: OrderStatus) => `order:${o.id}:${o.createdAt}:${to}`;

/** คำสั่งตัดสต็อกและขายรังของออเดอร์ (ใช้ตอนชำระแล้ว) */
async function stockStatements(db: Db, user: SessionUser, o: Order, items: Item[], paidOn: string): Promise<BatchItem<'sqlite'>[]> {
  const out: BatchItem<'sqlite'>[] = [];
  for (const i of items) {
    if (i.kind === 'variant' && i.variantId) {
      // จดจำนวนที่ตัดได้จริงก่อน (คำสั่งใน batch ทำตามลำดับ) แล้วค่อยตัด — สต็อกไม่ติดลบ และยกเลิกแล้วคืนเท่าที่ตัดไป
      // ล็อตน้ำผึ้ง: ล็อตเก่าก่อน ที่ยังมีขวดขนาดนี้เหลือ (ไม่มีล็อต = สต็อกที่ใส่มือ ไม่ผูกล็อต)
      const lotId = i.lotId ?? (await lotForSale(db, i.variantId));
      out.push(db.update(orderItems).set({ stockTaken: sql`min(${i.qty}, (select stock_qty from product_variants where id = ${i.variantId}))`, lotId }).where(eq(orderItems.id, i.id)));
      out.push(db.update(productVariants).set({ stockQty: sql`max(${productVariants.stockQty} - ${i.qty}, 0)`, ...touch }).where(eq(productVariants.id, i.variantId)));
    } else if (i.kind === 'hive' && i.hiveId) {
      const hive = (await db.query.hives.findFirst({ where: eq(hives.id, i.hiveId) }))!;
      if (hive.status === 'active') {
        out.push(...statusStatements(db, user, hive, { status: 'sold', occurredOn: paidOn, soldPrice: i.unitPrice, note: `ขายตามออเดอร์ ${o.code}` } as never, null));
        if (o.customerId) out.push(db.update(hives).set({ customerId: o.customerId }).where(eq(hives.id, hive.id)));
      }
    }
  }
  return out;
}

async function applyPaid(db: Db, user: SessionUser, code: string, d: z.output<typeof payOrderSchema>, fromCreate = false): Promise<Result> {
  const got = await getOrder(db, code);
  if (!got) return { ok: false, error: 'ไม่พบออเดอร์' };
  const { order: o, items } = got;
  if (!fromCreate && !canMove(o.status, 'paid')) return { ok: false, error: o.status === 'paid' ? 'ออเดอร์นี้ชำระแล้ว' : 'เปลี่ยนเป็น "ชำระแล้ว" ไม่ได้ในสถานะนี้' };
  if (o.stockApplied) return { ok: true };
  try {
    await run(db, [
      // กุญแจครั้งเดียว: กด "ชำระแล้ว" พร้อมกันสองเครื่อง → คำขอหลังทั้ง batch ย้อนกลับ ไม่ตัดสต็อกซ้ำ
      // (เดิมมีแค่ stock_applied = 0 ในคำสั่งแรก แต่คำสั่งตัดสต็อกที่ตามมายังรันซ้ำ)
      once(db, onceKey(o, 'paid')),
      db.update(orders).set({ status: 'paid', paidOn: d.paidOn, payMethod: d.payMethod, stockApplied: true, ...touch }).where(and(eq(orders.id, o.id), eq(orders.stockApplied, false))),
      ...(await stockStatements(db, user, o, items, d.paidOn)),
      audit(db, user, 'order.paid', 'order', o.id, { code, payMethod: d.payMethod }),
    ]);
  } catch (e) {
    if (isOnceConflict(e)) return { ok: true };
    throw e;
  }
  return { ok: true };
}
export const payOrder = (db: Db, user: SessionUser, code: string, d: z.output<typeof payOrderSchema>) => applyPaid(db, user, code, d);

export async function fulfillOrder(db: Db, user: SessionUser, code: string, d: z.output<typeof fulfillOrderSchema>): Promise<Result> {
  const got = await getOrder(db, code);
  if (!got) return { ok: false, error: 'ไม่พบออเดอร์' };
  if (got.order.status === 'fulfilled') return { ok: true };
  if (!canMove(got.order.status, 'fulfilled')) return { ok: false, error: 'ต้องบันทึก "ชำระแล้ว" ก่อนส่งของ' };
  try {
    await run(db, [
      once(db, onceKey(got.order, 'fulfilled')),
      db.update(orders).set({ status: 'fulfilled', fulfilledOn: d.fulfilledOn, trackingNo: d.trackingNo ?? null, ...touch }).where(eq(orders.id, got.order.id)),
      audit(db, user, 'order.fulfilled', 'order', got.order.id, { code }),
    ]);
  } catch (e) {
    if (isOnceConflict(e)) return { ok: true };
    throw e;
  }
  return { ok: true };
}

/** ยกเลิก: คืนสต็อก/คืนรัง (ถ้าตัดไปแล้ว) และคืนสถานะตั้งขายของรัง */
export async function cancelOrder(db: Db, user: SessionUser, code: string, today: string): Promise<Result> {
  const got = await getOrder(db, code);
  if (!got) return { ok: false, error: 'ไม่พบออเดอร์' };
  const { order: o, items } = got;
  if (o.status === 'cancelled') return { ok: true };
  if (!canMove(o.status, 'cancelled')) return { ok: false, error: 'ออเดอร์ที่ส่งแล้วยกเลิกในระบบไม่ได้ — ถ้ามีการคืนสินค้า บันทึกเป็นหมายเหตุ' };
  // กุญแจครั้งเดียว: ยกเลิกพร้อมกันสองเครื่อง → ไม่คืนสต็อก/คืนรังซ้ำ
  const stmts: BatchItem<'sqlite'>[] = [once(db, onceKey(o, 'cancelled')), db.update(orders).set({ status: 'cancelled', stockApplied: false, ...touch }).where(eq(orders.id, o.id))];
  for (const i of items) {
    if (i.kind === 'variant' && i.variantId && o.stockApplied) {
      if (i.stockTaken > 0) stmts.push(db.update(productVariants).set({ stockQty: sql`${productVariants.stockQty} + ${i.stockTaken}`, ...touch }).where(eq(productVariants.id, i.variantId)));
      stmts.push(db.update(orderItems).set({ stockTaken: 0 }).where(eq(orderItems.id, i.id)));
    } else if (i.kind === 'hive' && i.hiveId) {
      const hive = (await db.query.hives.findFirst({ where: eq(hives.id, i.hiveId) }))!;
      if (o.stockApplied && hive.status === 'sold') {
        stmts.push(...statusStatements(db, user, { ...hive, forSale: !!i.prevForSale }, { status: 'active', occurredOn: today, note: `ยกเลิกออเดอร์ ${o.code}` } as never, null));
        stmts.push(db.update(hives).set({ customerId: null }).where(eq(hives.id, hive.id)));
      } else if (hive.status === 'active') {
        stmts.push(db.update(hives).set({ forSale: !!i.prevForSale, ...touch }).where(eq(hives.id, hive.id)));
      }
    }
  }
  stmts.push(audit(db, user, 'order.cancel', 'order', o.id, { code, restocked: o.stockApplied }));
  try {
    await run(db, stmts);
  } catch (e) {
    if (isOnceConflict(e)) return { ok: true };
    throw e;
  }
  return { ok: true };
}

export async function updateOrderNote(db: Db, user: SessionUser, code: string, note: string | undefined): Promise<Result> {
  const o = await db.query.orders.findFirst({ where: eq(orders.code, code), columns: { id: true } });
  if (!o) return { ok: false, error: 'ไม่พบออเดอร์' };
  await run(db, [db.update(orders).set({ note: note ?? null, ...touch }).where(eq(orders.id, o.id)), audit(db, user, 'order.note', 'order', o.id)]);
  return { ok: true };
}

// ---------- ลูกค้า ----------

export async function listCustomers(db: Db, q?: string) {
  const s = q?.replace(/[%_\\]/g, '').trim();
  const valid = ne(orders.status, 'cancelled');
  return db
    .select({
      id: customers.id, name: customers.name, phone: customers.phone,
      orders: sql<number>`count(orders.id)`,
      spent: sql<number>`coalesce(sum(${totalSql}), 0)`,
      lastOrder: sql<string | null>`max(${orders.orderedOn})`,
    })
    .from(customers)
    .leftJoin(orders, and(eq(orders.customerId, customers.id), valid))
    .where(s ? or(like(customers.name, `%${s}%`), like(customers.phone, `%${s}%`)) : (undefined as SQL | undefined))
    .groupBy(customers.id)
    .orderBy(desc(sql`count(orders.id)`), asc(customers.name));
}

export async function getCustomer(db: Db, id: number) {
  const c = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!c) return null;
  return { customer: c, orders: await listOrders(db, { customerId: id }) };
}

export async function updateCustomer(db: Db, user: SessionUser, id: number, d: z.output<typeof customerSchema>): Promise<Result> {
  const c = await db.query.customers.findFirst({ where: eq(customers.id, id), columns: { id: true } });
  if (!c) return { ok: false, error: 'ไม่พบลูกค้า' };
  await run(db, [
    db.update(customers).set({ name: d.name, phone: d.phone ?? null, lineName: d.lineName ?? null, address: d.address ?? null, notes: d.notes ?? null, ...touch }).where(eq(customers.id, id)),
    audit(db, user, 'customer.update', 'customer', id),
  ]);
  return { ok: true };
}
