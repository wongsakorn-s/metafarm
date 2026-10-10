// ล็อตน้ำผึ้งบนฐานข้อมูล D1 จริง (ชั่วคราว): บรรจุพร้อมกัน แบ่งขวดตามล็อตตอนขาย และลบรายการที่บันทึกผิด
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addBottling, createLot, deleteBottling, deleteLot, getLot, listLots, unassignedHarvests } from './lots.ts';
import { cancelOrder, createOrder, getOrder, payOrder } from './orders.ts';
import { deleteEvent } from './hives.ts';
import { saleLines } from './reports.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
let seq = 0;
const TODAY = '2026-10-09';
const paid = { paidOn: TODAY, payMethod: 'transfer' as const };

beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO products (id, slug, name, category) VALUES (1, 'honey', 'น้ำผึ้งชันโรง', 'honey')`),
    t.d1.prepare(`INSERT INTO customers (id, name) VALUES (1, 'ลูกค้าทดสอบ')`),
  ]);
}, 60_000);
afterAll(() => t?.close());

const idem = () => `idem-${++seq}-xxxxxxxx`;

/** ขวดขนาดใหม่ (สต็อก 0) + รังใหม่ — แต่ละ test ใช้ของตัวเอง ล็อตจึงไม่ปนกัน */
async function fixture(sizeMl = 100) {
  const n = ++seq;
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO product_variants (id, product_id, label, size_ml, price_thb, stock_qty) VALUES (?, 1, ?, ?, 300, 0)`).bind(n, `ขวด ${n}`, sizeMl),
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status) VALUES (?, ?, 1, 'active')`).bind(n, `L${n}`),
  ]);
  return { variantId: n, hiveId: n, hiveCode: `L${n}` };
}

/** เก็บน้ำหวาน (โดยผู้ใช้ by) แล้วรวมเป็นล็อต → รหัสล็อต */
async function harvest(hiveId: number, ml: number, on: string, by = 1) {
  const r = await t.d1.prepare(`INSERT INTO hive_events (hive_id, type, occurred_on, honey_ml, created_by) VALUES (?, 'honey_harvest', ?, ?, ?) RETURNING id`).bind(hiveId, on, ml, by).first<{ id: number }>();
  return r!.id;
}
async function lot(hiveId: number, ml: number, on: string) {
  const r = await createLot(t.db, t.owner, { eventIds: [await harvest(hiveId, ml, on)], idem: idem() });
  if (!r.ok) throw new Error(r.error);
  return r.code;
}
const bottle = (code: string, variantId: number, qty: number, unitCost?: number, user = t.owner) =>
  addBottling(t.db, user, code, { variantId, qty, bottledOn: TODAY, unitCost, idem: idem() });

const stock = async (variantId: number) => (await t.d1.prepare(`SELECT stock_qty s FROM product_variants WHERE id = ?`).bind(variantId).first<{ s: number }>())!.s;
const sold = async (code: string) => (await listLots(t.db)).find((l) => l.code === code)!.sold;
const remaining = async (code: string) => (await getLot(t.db, code))!.remaining;

async function sellPaid(variantId: number, qty: number) {
  const r = await createOrder(t.db, t.owner, {
    customerMode: 'existing', customerId: 1, channel: 'facebook', orderedOn: TODAY, shipMethod: 'pickup', shipFee: 0,
    paidNow: false, idem: idem(), items: [{ kind: 'variant', id: variantId, qty, unitPrice: 300 }],
  } as never);
  if (!r.ok) throw new Error(r.error);
  return r.code;
}

describe('บรรจุขวด', () => {
  it('สองเครื่องบรรจุพร้อมกัน → ไม่เกินน้ำผึ้งในล็อต และสต็อกเพิ่มเท่าที่บรรจุจริง', async () => {
    const f = await fixture(250);
    const code = await lot(f.hiveId, 1000, '2026-08-05');
    expect((await bottle(code, f.variantId, 2)).ok).toBe(true); // เหลือ 500 มล. = 2 ขวด
    const rs = await Promise.all([bottle(code, f.variantId, 2), bottle(code, f.variantId, 2)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await remaining(code)).toBe(0);
    expect(await stock(f.variantId)).toBe(4);
    const fail = rs.find((r) => !r.ok) as { error: string };
    expect(fail.error).toMatch(/เหลือ 0 มล/);
  });

  it('ส่งฟอร์มเดิมซ้ำพร้อมกัน (กดซ้ำ/คิวรอส่ง) → บันทึกครั้งเดียว ไม่ขึ้นหน้า error', async () => {
    const f = await fixture();
    const code = await lot(f.hiveId, 1000, '2026-08-06');
    const d = { variantId: f.variantId, qty: 3, bottledOn: TODAY, idem: idem() };
    const rs = await Promise.all([addBottling(t.db, t.owner, code, d), addBottling(t.db, t.owner, code, d), addBottling(t.db, t.owner, code, d)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(await stock(f.variantId)).toBe(3);
    expect((await getLot(t.db, code))!.bottled).toHaveLength(1);
  });
});

describe('ขายขวด: แบ่งตามล็อต เก่าก่อน', () => {
  it('ล็อตเก่าเหลือ 2 ขาย 5 → ล็อตเก่า 2 + ล็อตใหม่ 3 · ต้นทุนเฉลี่ยตามจำนวน · ยกเลิกแล้วคืนล็อต', async () => {
    const f = await fixture();
    const oldLot = await lot(f.hiveId, 200, '2026-07-10');
    const newLot = await lot(f.hiveId, 2000, '2026-09-10');
    await bottle(oldLot, f.variantId, 2, 10);
    await bottle(newLot, f.variantId, 20, 20);
    const code = await sellPaid(f.variantId, 5);
    expect((await payOrder(t.db, t.owner, code, paid)).ok).toBe(true);

    expect((await getOrder(t.db, code))!.items[0]!.lots).toEqual([{ code: oldLot, qty: 2 }, { code: newLot, qty: 3 }]);
    expect([await sold(oldLot), await sold(newLot)]).toEqual([2, 3]);
    const line = (await saleLines(t.db, 2026)).find((l) => l.orderCode === code)!;
    expect(line.unitCost).toBe(16); // (2×10 + 3×20) / 5

    expect((await cancelOrder(t.db, t.owner, code, TODAY)).ok).toBe(true);
    expect([await sold(oldLot), await sold(newLot)]).toEqual([0, 0]);
    expect(await stock(f.variantId)).toBe(22);
  });

  it('ขวดเกินที่ล็อตมี (สต็อกใส่มือ) → ผูกล็อตเท่าที่มี ส่วนเกินไม่ผูก · ต้นทุนส่วนเกินไม่รู้ = ไม่เดา', async () => {
    const f = await fixture();
    const l = await lot(f.hiveId, 300, '2026-07-11');
    await bottle(l, f.variantId, 3, 10);
    await t.d1.prepare(`UPDATE product_variants SET stock_qty = stock_qty + 4 WHERE id = ?`).bind(f.variantId).run();
    const code = await sellPaid(f.variantId, 5);
    await payOrder(t.db, t.owner, code, paid);
    expect((await getOrder(t.db, code))!.items[0]!.lots).toEqual([{ code: l, qty: 3 }]);
    expect((await saleLines(t.db, 2026)).find((x) => x.orderCode === code)!.unitCost).toBeNull();
  });

  it('ชำระสองออเดอร์พร้อมกัน → ไม่มีขวดของล็อตไหนถูกขายเกินที่บรรจุ', async () => {
    for (let i = 0; i < 3; i++) {
      const f = await fixture();
      const l = await lot(f.hiveId, 300, '2026-07-12');
      await bottle(l, f.variantId, 3);
      const [a, b] = [await sellPaid(f.variantId, 2), await sellPaid(f.variantId, 2)];
      await Promise.all([payOrder(t.db, t.owner, a, paid), payOrder(t.db, t.owner, b, paid)]);
      expect(await sold(l)).toBe(3);
    }
  });
});

describe('ลบรายการที่บันทึกผิด', () => {
  it('การบรรจุ: ลบได้ถ้าขวดยังไม่ถูกขาย (หักสต็อกคืน) · ขายไปแล้วลบไม่ได้', async () => {
    const f = await fixture();
    const l = await lot(f.hiveId, 5000, '2026-07-13');
    await bottle(l, f.variantId, 2);
    await bottle(l, f.variantId, 30); // พิมพ์ผิด ตั้งใจ 3
    const [b1, b2] = (await getLot(t.db, l))!.bottled;
    expect((await deleteBottling(t.db, t.owner, l, b2!.id)).ok).toBe(true);
    expect(await stock(f.variantId)).toBe(2);
    expect(await remaining(l)).toBe(4800);

    await payOrder(t.db, t.owner, await sellPaid(f.variantId, 2), paid);
    const r = await deleteBottling(t.db, t.owner, l, b1!.id);
    expect(r.ok).toBe(false);
    expect((await getLot(t.db, l))!.bottled).toHaveLength(1);
    expect(await stock(f.variantId)).toBe(0);
  });

  it('การบรรจุ: พนักงานลบของคนอื่นไม่ได้ · ของตัวเองลบได้', async () => {
    const f = await fixture();
    const l = await lot(f.hiveId, 1000, '2026-07-14');
    await bottle(l, f.variantId, 2);
    await bottle(l, f.variantId, 1, undefined, t.staff);
    const [byOwner, byStaff] = (await getLot(t.db, l))!.bottled;
    expect((await deleteBottling(t.db, t.staff, l, byOwner!.id)).ok).toBe(false);
    expect((await deleteBottling(t.db, t.staff, l, byStaff!.id)).ok).toBe(true);
    expect(await stock(f.variantId)).toBe(2);
  });

  it('ลบพร้อมกันสองเครื่อง → หักสต็อกครั้งเดียว', async () => {
    const f = await fixture();
    const l = await lot(f.hiveId, 1000, '2026-07-15');
    await bottle(l, f.variantId, 4);
    await bottle(l, f.variantId, 3);
    const id = (await getLot(t.db, l))!.bottled[1]!.id;
    await Promise.all([deleteBottling(t.db, t.owner, l, id), deleteBottling(t.db, t.owner, l, id)]);
    expect(await stock(f.variantId)).toBe(4);
  });

  it('ล็อต: บรรจุแล้วลบไม่ได้ · ยังไม่บรรจุลบได้ และการเก็บกลับมาให้เลือกใหม่', async () => {
    const f = await fixture();
    const bottled = await lot(f.hiveId, 500, '2026-07-16');
    await bottle(bottled, f.variantId, 1);
    expect((await deleteLot(t.db, t.owner, bottled)).ok).toBe(false);

    const ev = await harvest(f.hiveId, 2500, '2026-07-17'); // ตั้งใจ 250
    const r = await createLot(t.db, t.owner, { eventIds: [ev], idem: idem() });
    const code = (r as { code: string }).code;
    expect((await deleteLot(t.db, t.owner, code)).ok).toBe(true);
    expect(await getLot(t.db, code)).toBeNull();
    expect((await unassignedHarvests(t.db)).some((e) => e.id === ev)).toBe(true);
  });

  it('เหตุการณ์รัง: การเก็บที่อยู่ในล็อตลบไม่ได้ · ลบล็อตแล้วลบได้ · เปลี่ยนสถานะลบไม่ได้', async () => {
    const f = await fixture();
    const hive = (await t.db.query.hives.findFirst({ where: (h, { eq }) => eq(h.id, f.hiveId) }))!;
    const ev = await harvest(f.hiveId, 2500, '2026-07-18');
    const code = ((await createLot(t.db, t.owner, { eventIds: [ev], idem: idem() })) as { code: string }).code;
    const inLot = await deleteEvent(t.db, t.owner, hive, ev);
    expect(inLot.ok).toBe(false);
    expect((inLot as { error: string }).error).toContain(code);

    await deleteLot(t.db, t.owner, code);
    expect((await deleteEvent(t.db, t.owner, hive, ev)).ok).toBe(true);
    expect(await t.d1.prepare(`SELECT 1 FROM hive_events WHERE id = ?`).bind(ev).first()).toBeNull();
    const audit = await t.d1.prepare(`SELECT diff FROM audit_logs WHERE action = 'event.delete' AND entity_id = ? ORDER BY id DESC`).bind(f.hiveId).first<{ diff: string }>();
    expect(JSON.parse(audit!.diff)).toMatchObject({ type: 'honey_harvest', honeyMl: 2500 });

    const st = await t.d1.prepare(`INSERT INTO hive_events (hive_id, type, occurred_on, from_status, to_status, created_by) VALUES (?, 'status_change', ?, 'active', 'collapsed', 1) RETURNING id`).bind(f.hiveId, TODAY).first<{ id: number }>();
    expect((await deleteEvent(t.db, t.owner, hive, st!.id)).ok).toBe(false);
  });

  it('เหตุการณ์รัง: พนักงานลบได้เฉพาะของตัวเอง', async () => {
    const f = await fixture();
    const hive = (await t.db.query.hives.findFirst({ where: (h, { eq }) => eq(h.id, f.hiveId) }))!;
    const mine = await harvest(f.hiveId, 100, TODAY, 2);
    const owners = await harvest(f.hiveId, 100, TODAY, 1);
    expect((await deleteEvent(t.db, t.staff, hive, owners)).ok).toBe(false);
    expect((await deleteEvent(t.db, t.staff, hive, mine)).ok).toBe(true);
  });
});

describe('migration 0014: ข้อมูลเดิม', () => {
  it('บรรทัดที่ชำระแล้วและผูกล็อตไว้ → ย้ายมาเป็น order_item_lots (ออเดอร์ยกเลิกไม่ย้าย)', async () => {
    const old = await testDb({ until: '0014' });
    try {
      await old.d1.batch([
        old.d1.prepare(`INSERT INTO products (id, slug, name, category) VALUES (1, 'honey', 'น้ำผึ้ง', 'honey')`),
        old.d1.prepare(`INSERT INTO product_variants (id, product_id, label, size_ml, price_thb) VALUES (1, 1, 'เล็ก', 100, 300)`),
        old.d1.prepare(`INSERT INTO honey_lots (id, code, harvested_from, harvested_to, total_ml) VALUES (1, 'H2569-09-1', '2026-09-01', '2026-09-01', 1000)`),
        old.d1.prepare(`INSERT INTO orders (id, code, ordered_on, status, paid_on, stock_applied) VALUES (1, 'S2569-001', '2026-10-01', 'paid', '2026-10-01', 1), (2, 'S2569-002', '2026-10-01', 'cancelled', NULL, 0)`),
        old.d1.prepare(`INSERT INTO order_items (id, order_id, kind, variant_id, label, qty, unit_price, stock_taken, lot_id) VALUES (1, 1, 'variant', 1, 'น้ำผึ้ง', 4, 300, 4, 1), (2, 2, 'variant', 1, 'น้ำผึ้ง', 2, 300, 0, 1)`),
      ]);
      await old.migrate();
      const rows = await old.d1.prepare(`SELECT order_item_id, lot_id, qty FROM order_item_lots`).all();
      expect(rows.results).toEqual([{ order_item_id: 1, lot_id: 1, qty: 4 }]);
    } finally {
      await old.close();
    }
  }, 60_000);
});
