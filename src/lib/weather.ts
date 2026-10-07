// ข้อมูลสภาพอากาศจาก NASA POWER (ไม่ผูกกับ runtime — ทดสอบได้)
// แหล่ง: https://power.larc.nasa.gov — ข้อมูลรัฐบาลสหรัฐฯ ใช้ได้ทุกวัตถุประสงค์ ขอให้อ้างอิงแหล่งที่มา (แสดงในหน้าผลผลิต)
// หมายเหตุ: Open-Meteo แบบฟรีใช้ได้เฉพาะงานไม่เชิงพาณิชย์ จึงไม่ใช้ (ดู docs/11-phase4-plan.md)

export interface FarmLocation {
  lat: number;
  lng: number;
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  tMax: number | null;
  tMin: number | null;
  rainMm: number | null;
  humidity: number | null;
}

/** เดือนที่ฝนรวมน้อยกว่านี้ถือว่า "แล้ง" (มม./เดือน) — เกณฑ์ใช้ดูภาพรวม ไม่ใช่นิยามทางอุตุนิยมวิทยา */
export const DRY_MONTH_MM = 50;
/** NASA POWER มีข้อมูลช้ากว่าวันจริงไม่กี่วัน — ปีปัจจุบันถือว่าครบเมื่อมีถึง (วันนี้ − LAG) */
export const POWER_LAG_DAYS = 7;

export const POWER_ATTRIBUTION =
  'ข้อมูลสภาพอากาศ: NASA Langley Research Center, POWER Project (ทุน NASA Earth Science Division) — ค่าจากดาวเทียมและแบบจำลองสำหรับพิกัดฟาร์ม อาจต่างจากที่วัดได้จริงในสวน';

export function powerDailyUrl(loc: FarmLocation, startIso: string, endIso: string): string {
  const d = (s: string) => s.replaceAll('-', '');
  const q = new URLSearchParams({
    parameters: 'T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M',
    community: 'AG',
    longitude: loc.lng.toFixed(4),
    latitude: loc.lat.toFixed(4),
    start: d(startIso),
    end: d(endIso),
    format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
}

/** แปลงผลตอบกลับของ POWER เป็นแถวรายวัน · ค่า fill (-999) เป็น null · วันที่ไม่มีค่าใดเลยถูกข้าม (จะดึงใหม่ภายหลัง) */
export function parsePowerDaily(json: unknown): WeatherDay[] {
  const root = json as { properties?: { parameter?: Record<string, Record<string, number>> }; header?: { fill_value?: number } };
  const p = root?.properties?.parameter;
  if (!p || typeof p !== 'object') throw new Error('รูปแบบข้อมูล NASA POWER ไม่ถูกต้อง');
  const fill = root.header?.fill_value ?? -999;
  const val = (k: string, day: string) => {
    const v = p[k]?.[day];
    return typeof v === 'number' && Number.isFinite(v) && v !== fill && v > -900 ? v : null;
  };
  const days = new Set<string>(Object.values(p).flatMap((s) => Object.keys(s ?? {})));
  const out: WeatherDay[] = [];
  for (const day of [...days].sort()) {
    if (!/^\d{8}$/.test(day)) continue;
    const row: WeatherDay = {
      date: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
      tMax: val('T2M_MAX', day),
      tMin: val('T2M_MIN', day),
      rainMm: val('PRECTOTCORR', day),
      humidity: val('RH2M', day),
    };
    if (row.tMax == null && row.tMin == null && row.rainMm == null && row.humidity == null) continue;
    out.push(row);
  }
  return out;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dayOfYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * ปีที่ยังไม่ครบ (ต้องดึง) เรียงปีล่าสุดก่อน — ล่าสุดสำคัญที่สุดและเปลี่ยนบ่อยที่สุด
 * `have` = จำนวนวันที่มีข้อมูลแล้วของแต่ละปี · ปีแรกนับจาก startIso · ปีปัจจุบันนับถึง (วันนี้ − LAG)
 */
export function yearsToFetch(have: Record<number, number>, startIso: string, todayIso: string): { year: number; start: string; end: string }[] {
  const endAll = addDays(todayIso, -POWER_LAG_DAYS);
  const y0 = Number(startIso.slice(0, 4));
  const y1 = Number(endAll.slice(0, 4));
  const out: { year: number; start: string; end: string }[] = [];
  for (let y = y1; y >= y0; y--) {
    const start = y === y0 ? startIso : `${y}-01-01`;
    const end = y === y1 ? endAll : `${y}-12-31`;
    if (end < start) continue;
    const expected = dayOfYear(end) - dayOfYear(start) + 1;
    if ((have[y] ?? 0) < expected) out.push({ year: y, start, end: y === y1 ? todayIso : end });
  }
  return out;
}
export const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);

// ---------- รายเดือน ----------

export interface MonthWeather {
  month: string; // YYYY-MM
  rainMm: number | null;
  tMaxAvg: number | null;
  tMinAvg: number | null;
  humidityAvg: number | null;
  days: number;
}

/** รายการเดือน YYYY-MM ตั้งแต่ from ถึง to (รวมทั้งสองเดือน) */
export function monthRange(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number) as [number, number];
  const [ty, tm] = toMonth.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 1200) break;
  }
  return out;
}

/** เดือนแล้ง: ฝนรวมของเดือนน้อยกว่าเกณฑ์ และมีข้อมูลเกือบครบเดือน (กันเดือนปัจจุบันที่เพิ่งเริ่ม) */
export const isDryMonth = (w: MonthWeather | undefined) => !!w && w.rainMm != null && w.days >= 25 && w.rainMm < DRY_MONTH_MM;

/**
 * เทียบค่าเฉลี่ยต่อเดือนระหว่างเดือนแล้งกับเดือนปกติ — "ข้อสังเกต" ไม่ใช่การพิสูจน์เหตุผล
 * คืน null ถ้าข้อมูลน้อยเกินไป (แต่ละกลุ่มต้องมีอย่างน้อย minMonths เดือน)
 */
export function compareDryWet(months: { month: string; value: number }[], weather: Map<string, MonthWeather>, minMonths = 6) {
  const dry: number[] = [];
  const wet: number[] = [];
  for (const m of months) {
    const w = weather.get(m.month);
    if (!w || w.days < 25 || w.rainMm == null) continue;
    (isDryMonth(w) ? dry : wet).push(m.value);
  }
  if (dry.length < minMonths || wet.length < minMonths) return null;
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return { dryAvg: avg(dry), wetAvg: avg(wet), dryMonths: dry.length, wetMonths: wet.length };
}

// ---------- พิกัดฟาร์ม ----------

/** พิกัดโดยประมาณของ อ.ปลวกแดง จ.ระยอง — ใช้จนกว่าเจ้าของฟาร์มจะใส่พิกัดจริงที่หน้าตั้งค่า */
export const DEFAULT_FARM_LOCATION: FarmLocation = { lat: 12.98, lng: 101.22 };

/** รับข้อความพิกัด "12.98, 101.22" หรือลิงก์ Google Maps แบบยาวที่มี @lat,lng · จำกัดในประเทศไทย */
export function parseLatLng(input: string): FarmLocation | null {
  const s = input.trim();
  const m = /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(s) ?? /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106)) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
export const locationKey = (l: FarmLocation) => `${l.lat.toFixed(4)},${l.lng.toFixed(4)}`;
