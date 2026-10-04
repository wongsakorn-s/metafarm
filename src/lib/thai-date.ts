/**
 * แปลงวันที่แบบที่เจ้าของฟาร์มเขียนใน Excel เป็น ISO (ค.ศ.)
 * รองรับ: "25 มีค. 2565", "14 มิย. 65", "29 ส.ค. 2565", "8 Aug. 2023", "2 Jun. 2024",
 *         "มีค. 2566" (มีแค่เดือน) และข้อความที่มีวันที่ปนอยู่ เช่น "Queen's Birthday : 29 สค. 2565"
 */
/** ข้อความที่แสดงเมื่อยังไม่ทราบข้อมูล (รอเจ้าของฟาร์มกรอก) */
export const UNKNOWN = '???';

export type DatePrecision = 'day' | 'month' | 'year';
export interface ParsedDate {
  iso: string; // YYYY-MM-DD (ค.ศ.); ถ้า precision = 'month' วันที่จะเป็น 01
  precision: DatePrecision;
}

const THAI_MONTHS: Record<string, number> = {
  มค: 1, กพ: 2, มีค: 3, เมย: 4, พค: 5, มิย: 6,
  กค: 7, สค: 8, กย: 9, ตค: 10, พย: 11, ธค: 12,
};
const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// เดือนไทยอาจมีจุดหรือไม่มี เช่น "ส.ค." / "สค." / "สค"
const THAI_MONTH_RE = '(ม\\.?ค|ก\\.?พ|มี\\.?ค|เม\\.?ย|พ\\.?ค|มิ\\.?ย|ก\\.?ค|ส\\.?ค|ก\\.?ย|ต\\.?ค|พ\\.?ย|ธ\\.?ค)\\.?';
const EN_MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const MONTH_RE = `(?:${THAI_MONTH_RE}|${EN_MONTH_RE})`;

const FULL_RE = new RegExp(`(\\d{1,2})\\s*${MONTH_RE}\\s*(\\d{4}|\\d{2})(?!\\d)`, 'i');
const MONTH_ONLY_RE = new RegExp(`(?:^|[^\\d])${MONTH_RE}\\s*(\\d{4}|\\d{2})(?!\\d)`, 'i');

function monthOf(thai: string | undefined, en: string | undefined): number | null {
  if (thai) return THAI_MONTHS[thai.replace(/\./g, '')] ?? null;
  if (en) return EN_MONTHS[en.toLowerCase().slice(0, 3)] ?? null;
  return null;
}

/** ปี 2 หลักถือเป็น พ.ศ. (65 → 2565), ปี ≥ 2400 เป็น พ.ศ., นอกนั้นเป็น ค.ศ. */
export function toCeYear(raw: string): number {
  let y = Number(raw);
  if (raw.length === 2) y += 2500;
  return y >= 2400 ? y - 543 : y;
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseThaiDate(input: string | null | undefined): ParsedDate | null {
  if (!input) return null;
  const s = input.replace(/\s+/g, ' ');

  const full = FULL_RE.exec(s);
  if (full) {
    const [, d, thai, en, y] = full;
    const m = monthOf(thai, en);
    const out = m && iso(toCeYear(y!), m, Number(d));
    // มีวันครบแต่วันที่ไม่ถูกต้อง (เช่น 31 ก.พ.) → ไม่เดาเป็นแค่เดือน
    return out ? { iso: out, precision: 'day' } : null;
  }

  const mo = MONTH_ONLY_RE.exec(s);
  if (mo) {
    const [, thai, en, y] = mo;
    const m = monthOf(thai, en);
    const out = m && iso(toCeYear(y!), m, 1);
    if (out) return { iso: out, precision: 'month' };
  }
  return null;
}

const TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** แสดงผลแบบไทย: "2025-08-29" → "29 ส.ค. 2568" (ไม่มีข้อมูล → "???") */
export function formatThaiDate(isoDate: string | null | undefined, precision: DatePrecision = 'day'): string {
  if (!isoDate) return UNKNOWN;
  const [y, m, d] = isoDate.split('-').map(Number);
  const month = TH_MONTH_SHORT[(m ?? 1) - 1];
  const yearBe = (y ?? 0) + 543;
  if (precision === 'year') return String(yearBe);
  return precision === 'month' ? `${month} ${yearBe}` : `${d} ${month} ${yearBe}`;
}
