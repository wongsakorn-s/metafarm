// รหัสรัง: ตัวอักษรอังกฤษ 1–3 ตัว + เลข 1–5 หลัก เช่น A25, B12, G108 (ตรงกับป้ายบนตัวรัง)
// ไม่ต้องเรียงลำดับ — เจ้าของอาจนำเข้ารหัสรังเก่าทีหลัง · id ภายในของรังไม่เกี่ยวกับรหัส (ฐานข้อมูลออกให้เอง)
// ใช้ไฟล์นี้ที่เดียวทุกที่ที่ตรวจ/แปลง/เรียงรหัสรัง (หน้าเว็บ ฟอร์ม สคริปต์)

export const HIVE_CODE_RE = /^[A-Z]{1,3}[1-9]\d{0,4}$/;

/**
 * แปลงสิ่งที่พิมพ์เป็นรหัสมาตรฐาน: ตัวใหญ่ · ตัดช่องว่าง/ขีด · ตัด 0 นำหน้าเลข (b-012 → B12)
 * พิมพ์แค่เลข → คืน null (ไม่เดาตัวอักษร — มีหลายชุดแล้ว ให้ผู้เรียกหาจากเลขแทน)
 */
export function normalizeHiveCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/[\s\-_.]/g, '');
  const m = /^([A-Z]{1,3})0*(\d{1,5})$/.exec(s);
  if (!m) return null;
  const code = `${m[1]}${Number(m[2])}`;
  return HIVE_CODE_RE.test(code) ? code : null;
}

export const isHiveCode = (s: string | null | undefined): s is string => !!s && HIVE_CODE_RE.test(s);

/** พิมพ์แค่ตัวเลข (เช่น 25) → เลข 25 · อย่างอื่น → null */
export function bareNumber(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim();
  return /^\d{1,5}$/.test(s) && Number(s) > 0 ? Number(s) : null;
}

export function splitHiveCode(code: string): { prefix: string; num: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  return m ? { prefix: m[1]!, num: Number(m[2]) } : { prefix: code, num: 0 };
}

/** เรียงแบบคนอ่าน: A2 < A10 < B1 */
export function compareHiveCodes(a: string, b: string): number {
  const x = splitHiveCode(a), y = splitHiveCode(b);
  return x.prefix === y.prefix ? x.num - y.num : x.prefix < y.prefix ? -1 : 1;
}

/** รหัสที่เสนอให้รังใหม่: ชุดตัวอักษรเดียวกับรังที่เพิ่มล่าสุด · เลขถัดจากเลขสูงสุดของชุดนั้น */
export function suggestNextCode(latest: string | null, codes: string[]): string {
  const prefix = latest ? splitHiveCode(latest).prefix : 'A';
  const max = codes.filter((c) => splitHiveCode(c).prefix === prefix).reduce((m, c) => Math.max(m, splitHiveCode(c).num), 0);
  return `${prefix}${max + 1}`;
}
