// สิทธิ์ผู้ใช้หลังบ้าน (Phase 5.1): เจ้าของ (owner) ทำได้ทุกอย่าง · พนักงาน (staff) ทำงานรังได้ แต่ไม่เห็นเรื่องเงิน
// แอดมิน (admin, 2026-10-10): เหมือนเจ้าของทุกอย่าง ยกเว้นจัดการผู้ใช้ (เพิ่ม/ปิด/เปลี่ยนบทบาท) — กันแอดมินยึดบัญชี
// ตรวจ 3 ชั้น: middleware กัน path (ownerOnlyPath) · ฝั่งเซิร์ฟเวอร์ไม่รับช่องเงินจากพนักงาน · หน้าเว็บซ่อนเมนู/ช่อง
// ตารางสิทธิ์เต็ม: docs/12-phase5-plan.md

export type Role = 'owner' | 'admin' | 'staff';
export const ROLES: Role[] = ['owner', 'admin', 'staff'];
export const roleLabel: Record<Role, string> = { owner: 'เจ้าของ', admin: 'แอดมิน', staff: 'พนักงาน' };
export const roleHint: Record<Role, string> = {
  owner: 'ทำได้ทุกอย่าง รวมจัดการผู้ใช้',
  admin: 'เหมือนเจ้าของ ยกเว้นจัดการผู้ใช้',
  staff: 'งานรังเท่านั้น ไม่เห็นเรื่องเงิน/ลูกค้า',
};

/** เห็นและจัดการเรื่องขาย เงิน ลูกค้า ตั้งค่าเว็บ (เจ้าของ + แอดมิน) */
export const canManageFarm = (u: { role: string } | null | undefined): boolean => u?.role === 'owner' || u?.role === 'admin';
/** จัดการผู้ใช้และบทบาท (เจ้าของเท่านั้น) */
export const canManageUsers = (u: { role: string } | null | undefined): boolean => u?.role === 'owner';

/** หน้า/คำขอเฉพาะเจ้าของและแอดมิน (ทั้ง GET และ POST): หมวดขายทั้งหมด และตั้งค่าเว็บ */
const MANAGER_ONLY = ['/admin/orders', '/admin/customers', '/admin/products', '/admin/reports', '/admin/settings', '/admin/readiness'];
/** หน้าเฉพาะเจ้าของ: จัดการผู้ใช้ */
const OWNER_ONLY = ['/admin/users'];
const under = (list: string[], pathname: string) => {
  const p = pathname.replace(/\/+$/, '').toLowerCase();
  return list.some((x) => p === x || p.startsWith(`${x}/`));
};
export const managerOnlyPath = (pathname: string) => under(MANAGER_ONLY, pathname);
export const ownerOnlyPath = (pathname: string) => under(OWNER_ONLY, pathname);
/** ผู้ใช้นี้เข้า path นี้ได้ไหม (middleware) */
export const pathAllowed = (u: { role: string } | null | undefined, pathname: string) =>
  ownerOnlyPath(pathname) ? canManageUsers(u) : managerOnlyPath(pathname) ? canManageFarm(u) : true;

/** ช่วงเวลาที่พนักงานลบรายการที่ตัวเองบันทึกผิดได้ (หลังจากนั้นให้เจ้าของ/แอดมินลบ) */
export const OWN_DELETE_HOURS = 24;
export const DELETE_DENIED = `ลบได้เฉพาะรายการที่ตัวเองบันทึกภายใน ${OWN_DELETE_HOURS} ชั่วโมง — ให้เจ้าของหรือแอดมินลบให้`;
/**
 * ลบบันทึกที่กรอกผิด (เหตุการณ์รัง การบรรจุขวด ล็อต): เจ้าของ/แอดมินลบได้ทุกรายการ ·
 * พนักงานลบได้เฉพาะของตัวเองภายใน 24 ชม. (แก้พิมพ์ผิดเองได้ทันที ไม่ต้องรอเจ้าของ)
 */
export function canDeleteRecord(u: { id: number; role: string } | null | undefined, rec: { createdBy: number | null; createdAt: string }, now = Date.now()): boolean {
  if (!u) return false;
  if (canManageFarm(u)) return true;
  const at = Date.parse(rec.createdAt);
  return rec.createdBy === u.id && Number.isFinite(at) && now - at < OWN_DELETE_HOURS * 3_600_000;
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
  if (role === 'owner' || role === 'admin') return [...all];
  if (from === 'sold') return [];
  return all.filter((s) => s !== 'sold');
}
