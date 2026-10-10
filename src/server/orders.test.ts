// ออเดอร์บนฐานข้อมูล D1 จริง (ชั่วคราว): สต็อก รัง และการกดพร้อมกันจากสองเครื่อง
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cancelOrder, createOrder, fulfillOrder, getOrder, orderFormOptions, payOrder } from './orders.ts';
import { changeStatus, updateSale } from './hives.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
let seq = 0;
const TODAY = '2026-10-09';

beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO products (id, slug, name, category) VALUES (1, 'honey', 'น้ำผึ้งชันโรง', 'honey')`),
    t.d1.prepare(`INSERT INTO customers (id, name) VALUES (1, 'ลูกค้าทดสอบ')`),
  ]);
}, 60_000);
afterAll(() => t?.close());

/** สินค้าใหม่ 1 ตัว (สต็อก 7) + รังใหม่ 1 รังที่ตั้งขายอยู่ — แต่ละ test ใช้ของตัวเอง */
async function fixture() {
  const n = ++seq;
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO product_variants (id, product_id, label, price_thb, stock_qty) VALUES (?, 1, ?, 250, 7)`).bind(n, `ขวด ${n}`),
    t.d1.prepare(`INSERT INTO hives (id, code, species_id, status, for_sale, sale_price) VALUES (?, ?, 1, 'active', 1, 1700)`).bind(n, `T${n}`),
  ]);
  return { variantId: n, hiveId: n, hiveCode: `T${n}` };
}

const order = (f: { variantId: number; hiveId: number }, extra: { paidNow?: boolean; idem?: string; hive?: boolean } = {}) =>
  createOrder(t.db, t.owner, {
    customerMode: 'existing', customerId: 1, channel: 'facebook', orderedOn: TODAY, shipMethod: 'pickup', shipFee: 0,
    paidNow: extra.paidNow ?? false, payMethod: extra.paidNow ? 'transfer' : undefined, idem: extra.idem ?? `idem-${++seq}-xxxx`,
    items: [{ kind: 'variant', id: f.variantId, qty: 2, unitPrice: 250 }, ...(extra.hive === false ? [] : [{ kind: 'hive' as const, id: f.hiveId, qty: 1, unitPrice: 1700 }])],
  } as never);

const state = async (f: { variantId: number; hiveId: number }, code: string) => {
  const o = (await getOrder(t.db, code))!;
  const v = await t.d1.prepare(`SELECT stock_qty s FROM product_variants WHERE id = ?`).bind(f.variantId).first<{ s: number }>();
  const h = await t.d1.prepare(`SELECT status, for_sale f FROM hives WHERE id = ?`).bind(f.hiveId).first<{ status: string; f: number }>();
  return { status: o.order.status, stockApplied: o.order.stockApplied, stock: v!.s, hive: h!.status, forSale: h!.f === 1 };
};

/** ผลลัพธ์ต้องสอดคล้องกันเสมอ: ชำระ/ส่งแล้ว = ตัดสต็อก + รังขายแล้ว · ยกเลิก = สต็อกครบ + รังกลับมา */
const consistent = (s: Awaited<ReturnType<typeof state>>) =>
  s.status === 'cancelled' ? s.stock === 7 && s.hive === 'active' && !s.stockApplied : s.stock === 5 && s.hive === 'sold' && s.stockApplied;

const paid = { paidOn: TODAY, payMethod: 'transfer' as const };

describe('สร้างและชำระ', () => {
  it('ชำระแล้ว = ตัดสต็อก + รังเป็น "ขายแล้ว" · ยกเลิก = คืนครบ', async () => {
    const f = await fixture();
    const r = await order(f);
    expect(r.ok).toBe(true);
    const code = (r as { code: string }).code;
    expect(await state(f, code)).toMatchObject({ status: 'awaiting_payment', stock: 7, hive: 'active', forSale: false });
    expect((await payOrder(t.db, t.owner, code, paid)).ok).toBe(true);
    expect(await state(f, code)).toMatchObject({ status: 'paid', stock: 5, hive: 'sold' });
    expect((await cancelOrder(t.db, t.owner, code, TODAY)).ok).toBe(true);
    expect(await state(f, code)).toMatchObject({ status: 'cancelled', stock: 7, hive: 'active', forSale: true });
  });

  it('กด "ชำระแล้ว" พร้อมกัน 4 ครั้ง → ตัดสต็อกครั้งเดียว', async () => {
    const f = await fixture();
    const code = ((await order(f)) as { code: string }).code;
    await Promise.all([1, 2, 3, 4].map(() => payOrder(t.db, t.owner, code, paid)));
    expect(await state(f, code)).toMatchObject({ status: 'paid', stock: 5, hive: 'sold' });
  });
});

describe('กดคนละปุ่มพร้อมกันจากสองเครื่อง', () => {
  it('"ชำระแล้ว" กับ "ยกเลิก" → ผลสอดคล้องกัน (ไม่มีออเดอร์ยกเลิกที่ตัดสต็อก หรือชำระแล้วแต่ไม่ตัด)', async () => {
    for (let i = 0; i < 4; i++) {
      const f = await fixture();
      const code = ((await order(f)) as { code: string }).code;
      const [p, c] = await Promise.all([payOrder(t.db, t.owner, code, paid), cancelOrder(t.db, t.owner, code, TODAY)]);
      const s = await state(f, code);
      expect(consistent(s), JSON.stringify(s)).toBe(true);
      // ปุ่มที่แพ้ต้องบอกตามจริง ไม่ใช่ "สำเร็จ"
      expect([p.ok, c.ok].filter(Boolean)).toHaveLength(1);
    }
  });

  it('"ยกเลิก" กับ "ส่งแล้ว" บนออเดอร์ที่ชำระแล้ว → ผลสอดคล้องกัน', async () => {
    for (let i = 0; i < 4; i++) {
      const f = await fixture();
      const code = ((await order(f)) as { code: string }).code;
      await payOrder(t.db, t.owner, code, paid);
      const [c, d] = await Promise.all([cancelOrder(t.db, t.owner, code, TODAY), fulfillOrder(t.db, t.owner, code, { fulfilledOn: TODAY })]);
      const s = await state(f, code);
      expect(consistent(s), JSON.stringify(s)).toBe(true);
      expect([c.ok, d.ok].filter(Boolean)).toHaveLength(1);
    }
  });
});

const hiveOf = async (id: number) => (await t.db.query.hives.findFirst({ where: (h, { eq }) => eq(h.id, id) }))!;
const holdOf = (hiveId: number) => t.d1.prepare(`SELECT order_id FROM hive_holds WHERE hive_id = ?`).bind(hiveId).first<{ order_id: number }>();

describe('รังในออเดอร์', () => {
  it('ออเดอร์ค้างจองรังไว้ → ไม่อยู่ในตัวเลือกออเดอร์ใหม่', async () => {
    const f = await fixture();
    await order(f);
    expect((await orderFormOptions(t.db)).hives.some((h) => h.id === f.hiveId)).toBe(false);
  });

  it('สร้างออเดอร์พร้อมกันสองเครื่องด้วยรังเดียวกัน → ได้ออเดอร์เดียว', async () => {
    const f = await fixture();
    const rs = await Promise.all([order(f), order(f)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ error: expect.stringContaining('รัง') });
    const n = await t.d1.prepare(`SELECT count(*) n FROM order_items WHERE hive_id = ?`).bind(f.hiveId).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('รังที่ถูกจอง: เจ้าของบันทึก "ขายแล้ว" เอง/ตั้งขายซ้ำไม่ได้', async () => {
    const f = await fixture();
    await order(f);
    const r = await changeStatus(t.db, t.owner, await hiveOf(f.hiveId), { status: 'sold', occurredOn: TODAY, soldPrice: 1500 } as never);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('ชำระแล้ว') });
    expect(await updateSale(t.db, t.owner, await hiveOf(f.hiveId), { forSale: true, salePrice: 1500 })).toMatchObject({ ok: false });
    expect((await hiveOf(f.hiveId)).status).toBe('active');
  });

  it('รังที่ขายตามออเดอร์แล้ว → เปลี่ยนกลับเป็น "ยังอยู่" เองไม่ได้ (ต้องยกเลิกออเดอร์)', async () => {
    const f = await fixture();
    const code = ((await order(f)) as { code: string }).code;
    await payOrder(t.db, t.owner, code, paid);
    const r = await changeStatus(t.db, t.owner, await hiveOf(f.hiveId), { status: 'active', occurredOn: TODAY } as never);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('ยกเลิกออเดอร์') });
    expect((await hiveOf(f.hiveId)).status).toBe('sold');
  });

  it('รังล่มระหว่างรอชำระ: บันทึกได้ → ชำระไม่ได้ → ยกเลิกแล้วรังยังเป็น "ล่ม"', async () => {
    const f = await fixture();
    const code = ((await order(f)) as { code: string }).code;
    expect((await changeStatus(t.db, t.staff, await hiveOf(f.hiveId), { status: 'collapsed', occurredOn: TODAY, collapseReason: 'มดกิน' } as never)).ok).toBe(true);
    expect(await payOrder(t.db, t.owner, code, paid)).toMatchObject({ ok: false, error: expect.stringContaining('ล่ม') });
    expect(await state(f, code)).toMatchObject({ status: 'awaiting_payment', stock: 7 });
    expect((await cancelOrder(t.db, t.owner, code, TODAY)).ok).toBe(true);
    expect(await state(f, code)).toMatchObject({ status: 'cancelled', stock: 7, hive: 'collapsed' });
    expect(await holdOf(f.hiveId)).toBeNull();
  });
});

describe('ชำระทันทีตอนสร้างออเดอร์', () => {
  it('ขั้นชำระล้ม → ออเดอร์ยังรอชำระ (ชำระต่อได้) · ส่งฟอร์มเดิมซ้ำ → ชำระครบ ตัดสต็อกครั้งเดียว', async () => {
    const f = await fixture();
    await t.d1.prepare(`CREATE TRIGGER fail_pay BEFORE UPDATE OF status ON orders WHEN NEW.status = 'paid' BEGIN SELECT RAISE(ABORT, 'boom'); END`).run();
    const idem = `paid-now-${f.variantId}`;
    await expect(order(f, { paidNow: true, idem })).rejects.toThrow();
    await t.d1.prepare(`DROP TRIGGER fail_pay`).run();
    const { code } = (await t.d1.prepare(`SELECT code FROM orders WHERE create_key = ?`).bind(`ui:1:${idem}`).first<{ code: string }>())!;
    expect(await state(f, code)).toMatchObject({ status: 'awaiting_payment', stock: 7, hive: 'active' });
    expect(await order(f, { paidNow: true, idem })).toMatchObject({ ok: true, code });
    expect(await state(f, code)).toMatchObject({ status: 'paid', stock: 5, hive: 'sold' });
    expect(await order(f, { paidNow: true, idem })).toMatchObject({ ok: true, code });
    expect((await state(f, code)).stock).toBe(5);
  });
});

describe('ข้อมูลเดิมก่อน migration 0013 (hive_holds)', () => {
  it('จองรังของออเดอร์ที่ยังไม่ยกเลิก · ยกเลิกแล้วคืนเฉพาะรังที่ออเดอร์ขายจริง', async () => {
    const old = await testDb({ until: '0013' });
    try {
      const sold = (code: string) => `INSERT INTO hive_events (hive_id, type, occurred_on, from_status, to_status, note) VALUES (?, 'status_change', '2026-10-01', 'active', 'sold', ${code ? `'ขายตามออเดอร์ ${code}'` : 'NULL'})`;
      await old.d1.batch([
        old.d1.prepare(`INSERT INTO hives (id, code, species_id, status) VALUES (1, 'A1', 1, 'sold'), (2, 'A2', 1, 'active'), (3, 'A3', 1, 'sold'), (4, 'A4', 1, 'active')`),
        old.d1.prepare(`INSERT INTO orders (id, code, ordered_on, status, stock_applied) VALUES (1, 'S2569-001', '2026-10-01', 'paid', 1), (2, 'S2569-002', '2026-10-01', 'awaiting_payment', 0), (3, 'S2569-003', '2026-10-01', 'paid', 1), (4, 'S2569-004', '2026-10-01', 'cancelled', 0)`),
        old.d1.prepare(`INSERT INTO order_items (order_id, kind, hive_id, label, qty, unit_price, prev_for_sale) VALUES (1, 'hive', 1, 'A1', 1, 1700, 1), (2, 'hive', 2, 'A2', 1, 1700, 1), (3, 'hive', 3, 'A3', 1, 1700, 0), (4, 'hive', 4, 'A4', 1, 1700, 0)`),
        old.d1.prepare(sold('S2569-001')).bind(1),
        old.d1.prepare(sold('')).bind(3), // A3 ขายด้วยมือ (ไม่ใช่ตามออเดอร์ S2569-003)
      ]);
      await old.migrate();
      const holds = (await old.d1.prepare(`SELECT hive_id h, order_id o FROM hive_holds ORDER BY hive_id`).all<{ h: number; o: number }>()).results;
      expect(holds).toEqual([{ h: 1, o: 1 }, { h: 2, o: 2 }, { h: 3, o: 3 }]);
      const taken = (await old.d1.prepare(`SELECT hive_id h, stock_taken s FROM order_items ORDER BY hive_id`).all<{ h: number; s: number }>()).results;
      expect(taken.map((r) => r.s)).toEqual([1, 0, 0, 0]);
      await cancelOrder(old.db, old.owner, 'S2569-003', TODAY);
      await cancelOrder(old.db, old.owner, 'S2569-001', TODAY);
      const st = (await old.d1.prepare(`SELECT code, status FROM hives WHERE id IN (1, 3) ORDER BY id`).all<{ code: string; status: string }>()).results;
      expect(st).toEqual([{ code: 'A1', status: 'active' }, { code: 'A3', status: 'sold' }]);
    } finally {
      await old.close();
    }
  }, 60_000);
});

describe('ข้อมูลเปลี่ยนระหว่างตรวจกับบันทึก (อีกเครื่องบันทึกแทรก)', () => {
  it('รังล่มระหว่างกด "ชำระแล้ว" → ไม่รับชำระทั้งออเดอร์ (ไม่ตัดสต็อก ไม่นับรายได้) · ชำระซ้ำได้คำตอบตามจริง', async () => {
    const f = await fixture();
    const code = ((await order(f)) as { code: string }).code;
    // จำลองอีกเครื่อง: รังกลายเป็น "ล่ม" หลังจากที่ applyPaid ตรวจไปแล้ว แต่ก่อน batch ชำระทำงาน (คำสั่งแรกของ batch = once key)
    await t.d1.prepare(`CREATE TRIGGER collapse_mid_pay BEFORE INSERT ON once_keys BEGIN UPDATE hives SET status = 'collapsed' WHERE id = ${f.hiveId}; END`).run();
    const r = await payOrder(t.db, t.owner, code, paid);
    await t.d1.prepare(`DROP TRIGGER collapse_mid_pay`).run();
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('สถานะรังเพิ่งถูกเปลี่ยน') });
    // trigger ย้อนกลับไปพร้อม batch → สถานะเดิม · ออเดอร์ยังรอชำระ และไม่ได้ตัดสต็อก
    expect(await state(f, code)).toMatchObject({ status: 'awaiting_payment', stock: 7, stockApplied: false });
    expect((await payOrder(t.db, t.owner, code, paid)).ok).toBe(true);
  });

  it('เปลี่ยนสถานะจากค่าที่อ่านไว้นานแล้ว (อีกเครื่องเปลี่ยนไปก่อน) → ไม่เขียนทับ', async () => {
    const f = await fixture();
    const stale = await hiveOf(f.hiveId);
    expect((await changeStatus(t.db, t.staff, await hiveOf(f.hiveId), { status: 'collapsed', occurredOn: TODAY, idem: `a-${f.hiveId}-xxxxxx` } as never)).ok).toBe(true);
    const r = await changeStatus(t.db, t.owner, stale, { status: 'sold', occurredOn: TODAY, soldPrice: 1500, idem: `b-${f.hiveId}-xxxxxx` } as never);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('สถานะรังเพิ่งถูกเปลี่ยน') });
    expect((await hiveOf(f.hiveId)).status).toBe('collapsed');
  });

  it('ส่งการเปลี่ยนสถานะเดิมซ้ำพร้อมกัน (คิวรอส่ง) → สำเร็จทั้งคู่ บันทึกครั้งเดียว', async () => {
    const f = await fixture();
    const hive = await hiveOf(f.hiveId);
    const d = { status: 'collapsed', occurredOn: TODAY, idem: `same-${f.hiveId}-xxxx` } as never;
    const rs = await Promise.all([changeStatus(t.db, t.staff, hive, d), changeStatus(t.db, t.staff, hive, d)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    const n = await t.d1.prepare(`SELECT count(*) n FROM hive_events WHERE hive_id = ? AND type = 'status_change'`).bind(f.hiveId).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('ตั้งขายจากหน้าที่โหลดไว้ก่อนรังล่ม → ไม่ตั้งขาย', async () => {
    const f = await fixture();
    await t.d1.prepare(`UPDATE hives SET for_sale = 0 WHERE id = ?`).bind(f.hiveId).run();
    const before = await hiveOf(f.hiveId);
    await changeStatus(t.db, t.staff, await hiveOf(f.hiveId), { status: 'collapsed', occurredOn: TODAY, collapseReason: 'มด' } as never);
    expect(await updateSale(t.db, t.owner, before, { forSale: true, salePrice: 1500 })).toMatchObject({ ok: false, error: expect.stringContaining('เพิ่งถูกจอง') });
    expect((await hiveOf(f.hiveId)).forSale).toBe(false);
  });

  it('ตั้งขายตอนรังถูกจองแล้ว แม้การตรวจก่อนบันทึกพลาด → ตัวกันใน batch ไม่ให้ตั้งขาย', async () => {
    const f = await fixture();
    await t.d1.prepare(`UPDATE hives SET for_sale = 0 WHERE id = ?`).bind(f.hiveId).run();
    // hold ที่ชี้ไปออเดอร์ "ยกเลิก" → holdBlocks ปล่อยผ่าน (จำลองการตรวจที่อ่านค่าก่อนอีกเครื่องจอง) แต่แถว hold มีอยู่ตอน batch
    const o = await t.d1.prepare(`INSERT INTO orders (code, ordered_on, status) VALUES (?, ?, 'cancelled') RETURNING id`).bind(`S2569-9${f.hiveId}`, TODAY).first<{ id: number }>();
    await t.d1.prepare(`INSERT INTO hive_holds (hive_id, order_id) VALUES (?, ?)`).bind(f.hiveId, o!.id).run();
    expect(await updateSale(t.db, t.owner, await hiveOf(f.hiveId), { forSale: true, salePrice: 1500 })).toMatchObject({ ok: false });
    expect((await hiveOf(f.hiveId)).forSale).toBe(false);
  });
});

describe('ลูกค้าใหม่ในฟอร์มออเดอร์', () => {
  const newCustomerOrder = (f: { variantId: number; hiveId: number }, name: string) =>
    createOrder(t.db, t.owner, {
      customerMode: 'new', customer: { name, phone: '0812345678' }, channel: 'line', orderedOn: TODAY, shipMethod: 'pickup', shipFee: 0,
      paidNow: false, idem: `cust-${++seq}-xxxx`, items: [{ kind: 'variant', id: f.variantId, qty: 1, unitPrice: 250 }, { kind: 'hive', id: f.hiveId, qty: 1, unitPrice: 1700 }],
    } as never);
  const countNamed = async (name: string) => (await t.d1.prepare(`SELECT count(*) n FROM customers WHERE name = ?`).bind(name).first<{ n: number }>())!.n;

  it('ออเดอร์ผูกกับลูกค้าที่สร้าง และมี audit ของลูกค้า', async () => {
    const f = await fixture();
    const r = await newCustomerOrder(f, 'คุณบี');
    const got = (await getOrder(t.db, (r as { code: string }).code))!;
    expect(got.customer).toMatchObject({ name: 'คุณบี', phone: '0812345678' });
    const a = await t.d1.prepare(`SELECT entity_id e FROM audit_logs WHERE action = 'customer.create' ORDER BY id DESC`).first<{ e: number }>();
    expect(a!.e).toBe(got.customer!.id);
  });

  it('บันทึกออเดอร์ล้ม → ไม่มีลูกค้าค้าง (กดใหม่ไม่ได้ลูกค้าซ้ำ)', async () => {
    const f = await fixture();
    await t.d1.prepare(`CREATE TRIGGER fail_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'boom'); END`).run();
    await expect(newCustomerOrder(f, 'คุณซี')).rejects.toThrow();
    await t.d1.prepare(`DROP TRIGGER fail_order`).run();
    expect(await countNamed('คุณซี')).toBe(0);
  });

  it('สองเครื่องสร้างออเดอร์รังเดียวกันพร้อมลูกค้าใหม่ → ลูกค้าเกิดเฉพาะของออเดอร์ที่สำเร็จ', async () => {
    const f = await fixture();
    const rs = await Promise.all([newCustomerOrder(f, 'คุณดี'), newCustomerOrder(f, 'คุณดี')]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await countNamed('คุณดี')).toBe(1);
  });
});
