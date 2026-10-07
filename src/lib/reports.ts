// รายงานยอดขาย/กำไร (Phase 4.4) — ฟังก์ชันล้วน รับรายการขายที่ดึงจากฐานข้อมูลแล้ว
// กำไร = ราคาขาย − ต้นทุน ต่อชิ้น · คิดเฉพาะรายการที่รู้ต้นทุน (ที่ไม่รู้แยกนับเป็น "ยังไม่มีต้นทุน")
// ค่าส่งไม่นับในยอดขายสินค้าและกำไร (เก็บจากลูกค้าเพื่อจ่ายค่าขนส่ง)

export interface SaleLine {
  orderCode: string;
  paidOn: string; // YYYY-MM-DD
  customerId: number | null;
  customer: string | null;
  kind: 'variant' | 'hive';
  variantId: number | null;
  label: string;
  qty: number;
  unitPrice: number;
  /** ต้นทุนต่อชิ้น · null = ยังไม่รู้ */
  unitCost: number | null;
}

export interface Summary {
  revenue: number;
  orders: number;
  /** ยอดขายของรายการที่รู้ต้นทุน */
  costedRevenue: number;
  cost: number;
  profit: number;
  /** รายการที่ยังไม่มีต้นทุน */
  uncosted: { lines: number; revenue: number };
}

const lineRevenue = (l: SaleLine) => l.qty * l.unitPrice;
const lineCost = (l: SaleLine) => Math.round(l.qty * (l.unitCost ?? 0));

export function summarize(lines: SaleLine[]): Summary {
  const s: Summary = { revenue: 0, orders: new Set(lines.map((l) => l.orderCode)).size, costedRevenue: 0, cost: 0, profit: 0, uncosted: { lines: 0, revenue: 0 } };
  for (const l of lines) {
    const rev = lineRevenue(l);
    s.revenue += rev;
    if (l.unitCost == null) {
      s.uncosted.lines++;
      s.uncosted.revenue += rev;
    } else {
      s.costedRevenue += rev;
      s.cost += lineCost(l);
    }
  }
  s.profit = s.costedRevenue - s.cost;
  return s;
}

/** ยอดขายรายเดือน (12 ช่อง ม.ค.–ธ.ค.) */
export function monthlyRevenue(lines: SaleLine[]): number[] {
  const out = Array(12).fill(0) as number[];
  for (const l of lines) {
    const m = Number(l.paidOn.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) out[m]! += lineRevenue(l);
  }
  return out;
}

export interface Seller { key: string; label: string; qty: number; revenue: number; profit: number | null }

/** สินค้าขายดี (เรียงตามยอดขาย) — ขวดแยกตามขนาด · รังรวมเป็นกลุ่มเดียว · กำไร null ถ้ามีบางรายการไม่รู้ต้นทุน */
export function bestSellers(lines: SaleLine[]): Seller[] {
  const m = new Map<string, Seller & { known: boolean }>();
  for (const l of lines) {
    const key = l.kind === 'hive' ? 'hive' : `v${l.variantId ?? l.label}`;
    const cur = m.get(key) ?? { key, label: l.kind === 'hive' ? 'รังชันโรง' : l.label, qty: 0, revenue: 0, profit: 0, known: true };
    cur.qty += l.qty;
    cur.revenue += lineRevenue(l);
    if (l.unitCost == null) cur.known = false;
    else cur.profit = (cur.profit ?? 0) + lineRevenue(l) - lineCost(l);
    m.set(key, cur);
  }
  return [...m.values()]
    .map(({ known, ...s }) => ({ ...s, profit: known ? s.profit : null }))
    .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label, 'th'));
}

export interface TopCustomer { id: number; name: string; orders: number; revenue: number }

/** ลูกค้าที่ซื้อมากที่สุด (ไม่นับออเดอร์ที่ไม่ระบุลูกค้า) */
export function topCustomers(lines: SaleLine[], limit = 10): TopCustomer[] {
  const m = new Map<number, { name: string; orders: Set<string>; revenue: number }>();
  for (const l of lines) {
    if (l.customerId == null) continue;
    const cur = m.get(l.customerId) ?? { name: l.customer ?? '???', orders: new Set<string>(), revenue: 0 };
    cur.orders.add(l.orderCode);
    cur.revenue += lineRevenue(l);
    m.set(l.customerId, cur);
  }
  return [...m]
    .map(([id, c]) => ({ id, name: c.name, orders: c.orders.size, revenue: c.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
    .slice(0, limit);
}

/** ปีที่เลือกได้ (ค.ศ.) — ปีที่มีการขาย + ปีปัจจุบัน ใหม่ก่อน */
export function reportYears(paidYears: number[], current: number): number[] {
  return [...new Set([current, ...paidYears.filter((y) => Number.isInteger(y) && y > 2000 && y <= current)])].sort((a, b) => b - a);
}

/** อ่านปีจาก query (?year=ค.ศ.) — ผิดรูปแบบหรือเกินปีปัจจุบันใช้ปีปัจจุบัน */
export function parseYear(raw: string | null, current: number): number {
  const y = Number(raw);
  return Number.isInteger(y) && y >= 2000 && y <= current ? y : current;
}
