// ข้อมูลดิบสำหรับรายงาน (Phase 4.4) + ส่งออก CSV — หลังบ้านเท่านั้น (มีต้นทุน/ลูกค้า)
// ยอดขายนับเฉพาะออเดอร์ที่ชำระแล้ว/ส่งแล้ว ตามวันที่ชำระ (paid_on)
import { sql } from 'drizzle-orm';
import type { SaleLine } from '../lib/reports.ts';
import type { Db } from './db.ts';

const yearRange = (year: number) => [`${year}-01-01`, `${year + 1}-01-01`] as const;

/**
 * ต้นทุนต่อชิ้นของแต่ละรายการ:
 * - ขวดน้ำผึ้ง: เฉลี่ยตามจำนวนขวดจากแต่ละล็อต (order_item_lots) — ล็อตละใช้ต้นทุนเฉลี่ยตอนบรรจุ (ขนาดนั้น) → ถ้าไม่มี ใช้ต้นทุนในหน้าสินค้า
 *   ขวดที่ไม่ผูกล็อต (สต็อกใส่มือ) ใช้ต้นทุนในหน้าสินค้า · ส่วนไหนไม่รู้ต้นทุน = ทั้งบรรทัด null (ไม่เดา)
 * - รัง: ซื้อมา = ราคาซื้อ (ไม่รู้ = null) · ขยายเอง/แยกรัง/ธรรมชาติ = 0 · ไม่รู้ที่มา = null
 */
export async function saleLines(db: Db, year: number): Promise<SaleLine[]> {
  const [from, to] = yearRange(year);
  return db.all<SaleLine>(sql`
    select o.code as orderCode, o.paid_on as paidOn, o.customer_id as customerId, c.name as customer,
           i.kind as kind, i.variant_id as variantId, i.label as label, i.qty as qty, i.unit_price as unitPrice,
           case when i.kind = 'hive' then
                  case h.origin when 'purchased' then h.purchase_price when 'unknown' then null else 0 end
                else (
                  select case when sum(x.cost is null) > 0 then null
                              else (coalesce(sum(x.qty * x.cost), 0)
                                    + case when i.qty > coalesce(sum(x.qty), 0) then (i.qty - coalesce(sum(x.qty), 0)) * v.unit_cost else 0 end) * 1.0 / i.qty end
                    from (select a.qty as qty,
                                 coalesce((select sum(b.qty * b.unit_cost) * 1.0 / sum(b.qty) from bottlings b
                                            where b.lot_id = a.lot_id and b.variant_id = i.variant_id and b.unit_cost is not null),
                                          v.unit_cost) as cost
                            from order_item_lots a where a.order_item_id = i.id) x)
           end as unitCost
      from order_items i
      join orders o on o.id = i.order_id
      left join customers c on c.id = o.customer_id
      left join hives h on h.id = i.hive_id
      left join product_variants v on v.id = i.variant_id
     where o.status in ('paid', 'fulfilled') and o.paid_on >= ${from} and o.paid_on < ${to}
     order by o.paid_on, o.id, i.id`);
}

/** ค่าส่งที่เก็บจากลูกค้าในปี (ไม่นับเป็นยอดขายสินค้า) */
export async function shipFees(db: Db, year: number): Promise<number> {
  const [from, to] = yearRange(year);
  const [r] = await db.all<{ s: number | null }>(sql`select sum(ship_fee) as s from orders where status in ('paid', 'fulfilled') and paid_on >= ${from} and paid_on < ${to}`);
  return r?.s ?? 0;
}

/** ปี (ค.ศ.) ที่มีการขาย */
export async function paidYears(db: Db): Promise<number[]> {
  const rows = await db.all<{ y: string }>(sql`select distinct substr(paid_on, 1, 4) as y from orders where status in ('paid', 'fulfilled') and paid_on is not null`);
  return rows.map((r) => Number(r.y));
}

/** ออเดอร์ที่ยังไม่ชำระ (ทุกปี) เก่าก่อน */
export async function unpaidOrders(db: Db) {
  return db.all<{ code: string; orderedOn: string; customer: string | null; total: number }>(sql`
    select o.code as code, o.ordered_on as orderedOn, c.name as customer,
           o.ship_fee + coalesce((select sum(i.qty * i.unit_price) from order_items i where i.order_id = o.id), 0) as total
      from orders o left join customers c on c.id = o.customer_id
     where o.status = 'awaiting_payment'
     order by o.ordered_on, o.id`);
}

// ---------- ส่งออก CSV ----------

export async function exportOrders(db: Db) {
  return db.all<Record<string, string | number | null>>(sql`
    select o.code, o.ordered_on, o.status, o.channel, c.name as customer, c.phone,
           (select group_concat(i.label || ' x' || i.qty, ' / ') from order_items i where i.order_id = o.id) as items,
           coalesce((select sum(i.qty * i.unit_price) from order_items i where i.order_id = o.id), 0) as subtotal,
           o.ship_fee, o.paid_on, o.pay_method, o.ship_method, o.tracking_no, o.fulfilled_on, o.note
      from orders o left join customers c on c.id = o.customer_id
     order by o.ordered_on desc, o.id desc`);
}

export async function exportCustomers(db: Db) {
  return db.all<Record<string, string | number | null>>(sql`
    select c.name, c.phone, c.line_name, c.address, c.notes,
           (select count(*) from orders o where o.customer_id = c.id and o.status in ('paid', 'fulfilled')) as orders,
           coalesce((select sum(i.qty * i.unit_price) from order_items i join orders o on o.id = i.order_id
                      where o.customer_id = c.id and o.status in ('paid', 'fulfilled')), 0) as spent,
           (select max(o.ordered_on) from orders o where o.customer_id = c.id and o.status != 'cancelled') as last_order
      from customers c
     order by c.name`);
}

export async function exportHives(db: Db) {
  return db.all<Record<string, string | number | null>>(sql`
    select h.code, s.name_th as species, h.status, h.origin, h.origin_place, h.acquired_on, h.queen_born_on, h.box_type,
           h.purchase_price, sp.name as supplier, h.for_sale, h.sale_price, h.sold_price, h.sold_on,
           coalesce((select sum(e.honey_ml) from hive_events e where e.hive_id = h.id and e.type = 'honey_harvest'), 0) as honey_ml,
           (select count(*) from hive_events e where e.hive_id = h.id and e.type = 'honey_harvest' and coalesce(e.honey_ml, 0) > 0) as harvests,
           h.notes
      from hives h
      left join species s on s.id = h.species_id
      left join suppliers sp on sp.id = h.supplier_id
     order by h.code`);
}
