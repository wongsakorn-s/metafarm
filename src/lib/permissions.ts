// สิทธิ์ผู้ใช้หลังบ้าน (Phase 5.1): เจ้าของ (owner) ทำได้ทุกอย่าง · พนักงาน (staff) ทำงานรังได้ แต่ไม่เห็นเรื่องเงิน
// ตรวจ 3 ชั้น: middleware กัน path (ownerOnlyPath) · ฝั่งเซิร์ฟเวอร์ไม่รับช่องเงินจากพนักงาน · หน้าเว็บซ่อนเมนู/ช่อง
// ตารางสิทธิ์เต็ม: docs/12-phase5-plan.md

export type Role = 'owner' | 'staff';
export const roleLabel: Record<Role, string> = { owner: 'เจ้าของ', staff: 'พนักงาน' };

export const isOwner = (u: { role: string } | null | undefined): boolean => u?.role === 'owner';

/** หน้า/คำขอที่เฉพาะเจ้าของ (ทั้ง GET และ POST): หมวดขายทั้งหมด ตั้งค่าเว็บ และจัดการผู้ใช้ */
const OWNER_ONLY = ['/admin/orders', '/admin/customers', '/admin/products', '/admin/reports', '/admin/settings', '/admin/readiness', '/admin/users'];

export function ownerOnlyPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '').toLowerCase();
  return OWNER_ONLY.some((x) => p === x || p.startsWith(`${x}/`));
}

/** หน้าที่เข้าได้ระหว่างบังคับเปลี่ยนรหัสผ่านชั่วคราว */
export const passwordChangeAllowed = (pathname: string) => ['/admin/account', '/admin/logout'].includes(pathname.replace(/\/+$/, ''));

/** ตัดรหัสออเดอร์ออกจากข้อความ (เช่นหมายเหตุ "ขายตามออเดอร์ S2569-001" ในประวัติรัง) สำหรับพนักงาน */
export const maskOrderCodes = (text: string) => text.replace(/\s*\bS\d{4}-\d+\b/g, '');

type HiveStatus = 'active' | 'sold' | 'collapsed' | 'unknown';

/**
 * สถานะที่ผู้ใช้เปลี่ยนรังไปได้ — "ขายแล้ว" เป็นเรื่องของเจ้าของ (ผ่านออเดอร์) พนักงานจึง
 * เปลี่ยนได้แค่ ยังอยู่ ↔ ล่ม และแตะรังที่ขายแล้วไม่ได้
 */
export function statusTargets(role: Role, from: HiveStatus): ('active' | 'sold' | 'collapsed')[] {
  const all = (['active', 'sold', 'collapsed'] as const).filter((s) => s !== from);
  if (role === 'owner') return [...all];
  if (from === 'sold') return [];
  return all.filter((s) => s !== 'sold');
}
