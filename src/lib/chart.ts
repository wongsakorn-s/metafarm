// คำนวณสเกลของกราฟ SVG ฝั่งเซิร์ฟเวอร์ (ไม่มีไลบรารีกราฟ — หน้าโหลดเร็วบนมือถือในสวน)

/** ขอบบนของแกนเป็นเลขกลม: ขั้นที่เล็กที่สุดใน 1, 2, 2.5, 5 × 10ⁿ ที่ทำให้มีเส้นกริดไม่เกิน maxTicks เส้น */
export function niceScale(max: number, maxTicks = 5): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const mag = 10 ** Math.floor(Math.log10(max / maxTicks));
  for (const f of [1, 2, 2.5, 5, 10, 20]) {
    const step = f * mag;
    const n = Math.ceil(max / step - 1e-9);
    if (n <= maxTicks) return { max: n * step, step };
  }
  return { max, step: max / maxTicks };
}

/** ช่วงแกนสำหรับกราฟเส้น (ไม่เริ่มที่ 0) เช่นอุณหภูมิ — ขยายเป็นเลขกลมรอบข้อมูล */
export function niceRange(min: number, max: number, step = 2): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 1 };
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (lo === hi) { lo -= step; hi += step; }
  return { min: lo, max: hi, step };
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "2024-07" → "ก.ค. 67" (ปี พ.ศ. 2 หลัก) */
export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return withYear ? `${TH_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}` : TH_MONTHS[m - 1]!;
}

/** ตัวเลขแบบไทย ไม่มีทศนิยมเกินจำเป็น */
export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? '–' : n.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
