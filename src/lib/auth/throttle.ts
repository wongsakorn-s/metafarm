// จำกัดการล็อกอินผิด (Phase 5.2) — นับในหน้าต่าง 15 นาที แยก 3 กุญแจ (เก็บเป็น sha256 ในตาราง login_attempts):
//   pair  = อีเมล + IP     5 ครั้ง  (คนพิมพ์ผิดเอง/บอทตัวเดียว — ตามเดิม)
//   email = อีเมล ทุก IP   10 ครั้ง (บอทเปลี่ยน IP แล้วเดารหัสบัญชีเดิมต่อ)
//   ip    = IP ทุกอีเมล    30 ครั้ง (ไล่เดารหัสหลายบัญชีจากที่เดียว — เผื่อพนักงานใช้เน็ตเดียวกันหลายคน)
// ข้อแลกเปลี่ยน: ถ้ามีคนตั้งใจเดารหัสบัญชีเจ้าของ เจ้าของจะล็อกอิน "ใหม่" ไม่ได้ ~15 นาที
// (อุปกรณ์ที่ล็อกอินค้างอยู่ใช้ต่อได้ตามปกติ — session อยู่ 30 วัน)

export const WINDOW_MIN = 15;
export const LIMITS = { pair: 5, email: 10, ip: 30 } as const;
export type ThrottleKind = keyof typeof LIMITS;

/**
 * IP ที่ใช้นับ: IPv4 ตามเดิม · IPv6 ใช้ช่วง /64 (ผู้ให้บริการแจกทั้งช่วงให้บ้าน/เครื่องเดียว — เปลี่ยนเลขท้ายได้ไม่จำกัด
 * ถ้านับทีละที่อยู่ คนเดียวจะได้โควตาใหม่ทุกครั้งที่เปลี่ยน) · IPv4 ในรูป IPv6 (::ffff:1.2.3.4) = IPv4
 */
export function ipBucket(ip: string): string {
  const a = ip.trim().toLowerCase().replace(/%.*$/, '');
  if (!a.includes(':')) return a;
  const last = a.slice(a.lastIndexOf(':') + 1);
  if (last.includes('.')) return last;
  const [head = '', tail] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** ข้อความดิบของแต่ละกุญแจ (hash ก่อนเก็บ) — pair ใช้รูปแบบเดิม (อีเมล|IP) จึงนับต่อจากข้อมูลที่มีอยู่ได้ */
export function throttleKeys(email: string, ip: string): Record<ThrottleKind, string> {
  const e = email.trim().toLowerCase();
  const b = ipBucket(ip);
  return { pair: `${e}|${b}`, email: `email|${e}`, ip: `ip|${b}` };
}

/** กุญแจที่ถึงขีดจำกัดแล้ว (ว่าง = ลองได้) */
export function lockedBy(counts: Partial<Record<ThrottleKind, number>>): ThrottleKind[] {
  return (Object.keys(LIMITS) as ThrottleKind[]).filter((k) => (counts[k] ?? 0) >= LIMITS[k]);
}
