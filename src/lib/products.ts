// ตัวช่วยแสดงสินค้า (ไม่ผูกกับ runtime)

/** "1,590 บาท" — ใช้บนหน้าสาธารณะ */
export const formatPrice = (n: number) => `${n.toLocaleString('th-TH')} บาท`;

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

/** ราคาต่อ 100 มล. ช่วยเทียบความคุ้มของขนาด (ปัดเป็นจำนวนเต็ม) */
export const pricePer100ml = (priceThb: number, sizeMl: number) => Math.round((priceThb / sizeMl) * 100);
