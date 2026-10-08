// กันเขียนทับกัน (Phase 5.3) — optimistic concurrency ด้วย updated_at เป็น "เวอร์ชัน"
// ฟอร์มแก้ไขส่งเวอร์ชันที่เห็นตอนเปิดหน้า (hidden "version") → เซิร์ฟเวอร์ UPDATE ... WHERE updated_at = version
// ไม่ตรง = มีคนบันทึกแถวนี้ไปก่อน → ไม่บันทึก แสดงค่าล่าสุดเทียบกับที่กรอกไว้ ให้ตรวจแล้วกดบันทึกอีกครั้ง

export const CONFLICT_ERROR = 'มีคนบันทึกข้อมูลนี้ไปก่อนระหว่างที่คุณแก้อยู่ — ยังไม่ได้บันทึกของคุณ ตรวจค่าล่าสุดด้านล่าง แล้วกดบันทึกอีกครั้ง';

export interface FieldDiff { key: string; label: string; mine: string; latest: string }

const norm = (v: unknown) => (v == null ? '' : String(v).replace(/\r\n/g, '\n').trim());

/**
 * ช่องที่ "ค่าที่คุณกรอก" ต่างจาก "ค่าล่าสุดในระบบ" (เทียบเฉพาะช่องที่มีป้ายชื่อ)
 * — ช่องที่ตรงกันอยู่แล้วไม่ต้องสนใจ ไม่ว่าใครแก้
 */
export function differingFields(mine: Record<string, unknown>, latest: Record<string, unknown>, labels: Record<string, string>): FieldDiff[] {
  return Object.entries(labels)
    .filter(([k]) => norm(mine[k]) !== norm(latest[k]))
    .map(([key, label]) => ({ key, label, mine: norm(mine[key]), latest: norm(latest[key]) }));
}

/** เวลาแบบสั้นสำหรับบอกว่าแก้ล่าสุดเมื่อไร (เวลาไทย) เช่น "14:05 น." หรือ "8 ต.ค. 14:05 น." ถ้าไม่ใช่วันนี้ */
export function shortStamp(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const bkk = (x: Date) => new Date(x.getTime() + 7 * 3600e3);
  const a = bkk(d), b = bkk(now);
  const hm = `${String(a.getUTCHours()).padStart(2, '0')}:${String(a.getUTCMinutes()).padStart(2, '0')} น.`;
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return hm;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${a.getUTCDate()} ${months[a.getUTCMonth()]} ${hm}`;
}
