// ดาวน์โหลด CSV จากหน้ารายงาน — อยู่ใต้ /admin จึงต้องล็อกอิน (middleware) · ห้าม cache (middleware ตั้ง no-store)
import type { APIRoute } from 'astro';
import { getDb } from '../../../../server/db.ts';
import { exportCustomers, exportHives, exportOrders, saleLines } from '../../../../server/reports.ts';
import { csvResponse, toCsv } from '../../../../lib/csv.ts';
import { parseYear } from '../../../../lib/reports.ts';
import { todayBangkok } from '../../../../lib/validation.ts';
import { channelLabel, orderStatusLabel, payMethodLabel, shipMethodLabel } from '../../../../lib/orders.ts';
import { boxLabel, originLabel, statusLabel } from '../../../../lib/labels.ts';

export const prerender = false;

const label = (m: Record<string, string>, k: unknown) => (k == null ? null : (m[String(k)] ?? String(k)));

export const GET: APIRoute = async ({ params }) => {
  const db = getDb();
  const file = params.file ?? '';
  const today = todayBangkok();

  const sales = /^sales-(\d{4})\.csv$/.exec(file);
  if (sales) {
    const year = parseYear(sales[1]!, Number(today.slice(0, 4)));
    if (String(year) !== sales[1]) return new Response('ไม่พบไฟล์', { status: 404 });
    const rows = await saleLines(db, year);
    return csvResponse(`รายการขาย-${year + 543}.csv`, toCsv(
      ['ออเดอร์', 'วันที่ชำระ', 'ลูกค้า', 'สินค้า', 'จำนวน', 'ราคาต่อชิ้น', 'ยอดขาย', 'ต้นทุนต่อชิ้น', 'กำไร'],
      rows.map((l) => {
        const cost = l.unitCost == null ? null : Math.round(l.unitCost * 100) / 100;
        return [l.orderCode, l.paidOn, l.customer, l.label, l.qty, l.unitPrice, l.qty * l.unitPrice, cost, cost == null ? null : l.qty * l.unitPrice - Math.round(l.qty * cost)];
      }),
    ), `sales-${year}.csv`);
  }

  if (file === 'orders.csv') {
    const rows = await exportOrders(db);
    return csvResponse(`ออเดอร์-${today}.csv`, toCsv(
      ['ออเดอร์', 'วันที่สั่ง', 'สถานะ', 'ช่องทาง', 'ลูกค้า', 'เบอร์', 'สินค้า', 'ยอดสินค้า', 'ค่าส่ง', 'รวม', 'วันที่ชำระ', 'วิธีชำระ', 'วิธีส่ง', 'เลขพัสดุ', 'วันที่ส่ง', 'หมายเหตุ'],
      rows.map((o) => [o.code, o.ordered_on, label(orderStatusLabel, o.status), label(channelLabel, o.channel), o.customer, o.phone, o.items, o.subtotal, o.ship_fee, Number(o.subtotal) + Number(o.ship_fee), o.paid_on, label(payMethodLabel, o.pay_method), label(shipMethodLabel, o.ship_method), o.tracking_no, o.fulfilled_on, o.note]),
    ), `orders-${today}.csv`);
  }

  if (file === 'customers.csv') {
    const rows = await exportCustomers(db);
    return csvResponse(`ลูกค้า-${today}.csv`, toCsv(
      ['ชื่อ', 'เบอร์', 'ชื่อไลน์', 'ที่อยู่', 'หมายเหตุ', 'ออเดอร์ที่ชำระแล้ว', 'ยอดซื้อรวม', 'สั่งล่าสุด'],
      rows.map((c) => [c.name, c.phone, c.line_name, c.address, c.notes, c.orders, c.spent, c.last_order]),
    ), `customers-${today}.csv`);
  }

  if (file === 'hives.csv') {
    const rows = await exportHives(db);
    return csvResponse(`รัง-${today}.csv`, toCsv(
      ['รหัส', 'ชนิด', 'สถานะ', 'ที่มา', 'ได้มาจาก', 'วันที่ได้มา', 'วันเกิดนางพญา', 'กล่อง', 'ราคาซื้อ', 'ผู้ขาย', 'ประกาศขาย', 'ราคาตั้งขาย', 'ราคาขายจริง', 'วันที่ขาย', 'น้ำผึ้งรวม (มล.)', 'เก็บน้ำหวาน (ครั้ง)', 'หมายเหตุ'],
      rows.map((h) => [h.code, h.species, label(statusLabel, h.status), label(originLabel, h.origin), h.origin_place, h.acquired_on, h.queen_born_on, label(boxLabel, h.box_type), h.purchase_price, h.supplier, h.for_sale ? 'ใช่' : '', h.sale_price, h.sold_price, h.sold_on, h.honey_ml, h.harvests, h.notes]),
    ), `hives-${today}.csv`);
  }

  return new Response('ไม่พบไฟล์', { status: 404 });
};
