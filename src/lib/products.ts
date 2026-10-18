// ตัวช่วยแสดงสินค้า (ไม่ผูกกับ runtime)

/** ใต้ราคาสินค้าทุกจุดบนหน้าสาธารณะ (เจ้าของฟาร์ม 2026-10-10: ค่าส่งคิดแยก ไม่แสดงอัตรา) — ไม่ใช้กับค่าอบรม */
export const SHIPPING_NOTE = 'ยังไม่รวมค่าขนส่ง';

/** "1,590 บาท" — ใช้บนหน้าสาธารณะ */
export const formatPrice = (n: number) => `${n.toLocaleString('th-TH')} บาท`;

/** ราคาบนการ์ด (ไม่ใช้คำว่า "เริ่ม" — เจ้าของขอ 2026-10-18): ราคาเดียว = "1,600 บาท" · หลายราคา = ช่วง "1,600–1,800 บาท" · ไม่มีราคา = '' */
export function priceRange(prices: number[]): string {
  if (!prices.length) return '';
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? formatPrice(lo) : `${lo.toLocaleString('th-TH')}–${formatPrice(hi)}`;
}

export const categoryLabel = { hive_box: 'รังเปล่า', honey: 'น้ำผึ้ง', other: 'อื่น ๆ' } as const;

/** ข้อความสถานะสินค้า — เก็บแค่ "มี/ไม่มี" ไม่เปิดเผยจำนวนสต็อกจริง */
export const stockLabel = (inStock: boolean) =>
  inStock ? { text: 'มีสินค้า', tone: 'bg-palm-100 text-palm-900' } : { text: 'สอบถามสต็อกก่อนสั่ง', tone: 'bg-honey-100 text-honey-700' };

/** ข้อความที่ส่งไปแชต LINE เมื่อกดสั่ง */
/** ข้อความสั่งซื้อทาง LINE — ราคาตัวอย่าง (sample) ไม่ใส่ตัวเลข เพื่อไม่ให้ลูกค้าส่งราคาที่ยังไม่ยืนยันมาเหมือนเป็นราคาตกลง */
export function orderMessage(name: string, opts: { variant?: string; price?: number; code?: string; sample?: boolean } = {}): string {
  const parts = [`สนใจสั่งซื้อ ${name}`];
  if (opts.code) parts[0] = `สนใจรัง ${opts.code}`;
  if (opts.variant) parts.push(`(${opts.variant})`);
  if (opts.price != null) parts.push(opts.sample ? 'ขอทราบราคาปัจจุบัน' : `ราคา ${formatPrice(opts.price)}`);
  return parts.join(' ');
}

/** "50 มล." / null */
export const sizeLabel = (ml: number | null | undefined) => (ml ? `${ml.toLocaleString('th-TH')} มล.` : null);

/**
 * ชื่อตัวเลือกพร้อมขนาด: "Size เล็ก · 50 มล." — ไม่ต่อขนาดซ้ำถ้าชื่อมีตัวเลขขนาดอยู่แล้ว ("ขวด 175 มล." ไม่เป็น "ขวด 175 มล. · 175 มล.")
 */
export function variantName(label: string, sizeMl: number | null | undefined, sep = ' · '): string {
  const size = sizeLabel(sizeMl);
  return size && !label.includes(String(sizeMl)) ? `${label}${sep}${size}` : label;
}

/** ราคาต่อ 100 มล. ช่วยเทียบความคุ้มของขนาด (ปัดเป็นจำนวนเต็ม) */
export const pricePer100ml = (priceThb: number, sizeMl: number) => Math.round((priceThb / sizeMl) * 100);
