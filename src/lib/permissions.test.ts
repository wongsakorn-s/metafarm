import { describe, expect, it } from 'vitest';
import { canDeleteRecord, canManageFarm, canManageUsers, managerOnlyPath, maskOrderCodes, ownerOnlyPath, passwordChangeAllowed, pathAllowed, statusTargets } from './permissions.ts';
import { passwordProblem, tempPassword } from './auth/password.ts';

describe('pathAllowed (เจ้าของ / แอดมิน / พนักงาน)', () => {
  const owner = { role: 'owner' }, admin = { role: 'admin' }, staff = { role: 'staff' };
  it('หมวดขาย ตั้งค่า = เจ้าของและแอดมิน', () => {
    for (const p of ['/admin/orders', '/admin/orders/new', '/admin/orders/S2569-001', '/admin/customers/3', '/admin/products', '/admin/reports', '/admin/reports/export/orders.csv', '/admin/settings', '/admin/settings/home', '/admin/settings/video', '/admin/readiness', '/admin/gallery', '/admin/Orders']) {
      expect([pathAllowed(owner, p), pathAllowed(admin, p), pathAllowed(staff, p)], p).toEqual([true, true, false]);
    }
  });
  it('จัดการผู้ใช้ = เจ้าของเท่านั้น', () => {
    for (const p of ['/admin/users', '/admin/users/', '/admin/Users']) {
      expect(ownerOnlyPath(p), p).toBe(true);
      expect([pathAllowed(owner, p), pathAllowed(admin, p), pathAllowed(staff, p)], p).toEqual([true, false, false]);
    }
  });
  it('งานรัง ล็อต ผลผลิต บัญชีตัวเอง = ทุกบทบาทเข้าได้', () => {
    for (const p of ['/admin', '/admin/hives', '/admin/hives/A12', '/admin/hives/A12/edit', '/admin/hives/new', '/admin/lots', '/admin/lots/H2569-10-1/labels', '/admin/production', '/admin/quick', '/admin/photos', '/admin/todo', '/admin/more', '/admin/account', '/admin/ordersx', '/admin/usersettings']) {
      expect(managerOnlyPath(p) || ownerOnlyPath(p), p).toBe(false);
      expect(pathAllowed(staff, p), p).toBe(true);
    }
  });
});

describe('canManageFarm / canManageUsers', () => {
  it('ขาย/เงิน: เจ้าของ + แอดมิน · ผู้ใช้: เจ้าของเท่านั้น', () => {
    expect(['owner', 'admin', 'staff'].map((role) => canManageFarm({ role }))).toEqual([true, true, false]);
    expect(['owner', 'admin', 'staff'].map((role) => canManageUsers({ role }))).toEqual([true, false, false]);
    expect(canManageFarm(null)).toBe(false);
    expect(canManageUsers(undefined)).toBe(false);
  });
});

describe('statusTargets', () => {
  it('เจ้าของ/แอดมินเปลี่ยนได้ทุกสถานะ', () => {
    expect(statusTargets('admin', 'sold')).toEqual(['active', 'collapsed']);
    expect(statusTargets('owner', 'active')).toEqual(['sold', 'collapsed']);
    expect(statusTargets('owner', 'sold')).toEqual(['active', 'collapsed']);
  });
  it('พนักงาน: ยังอยู่ ↔ ล่ม เท่านั้น · รังที่ขายแล้วแตะไม่ได้', () => {
    expect(statusTargets('staff', 'active')).toEqual(['collapsed']);
    expect(statusTargets('staff', 'collapsed')).toEqual(['active']);
    expect(statusTargets('staff', 'sold')).toEqual([]);
    expect(statusTargets('staff', 'unknown')).toEqual(['active', 'collapsed']);
  });
});

describe('passwordChangeAllowed', () => {
  it('ระหว่างบังคับเปลี่ยนรหัส เข้าได้แค่บัญชีและออกจากระบบ', () => {
    expect(passwordChangeAllowed('/admin/account')).toBe(true);
    expect(passwordChangeAllowed('/admin/logout')).toBe(true);
    expect(passwordChangeAllowed('/admin')).toBe(false);
    expect(passwordChangeAllowed('/admin/hives')).toBe(false);
  });
});

describe('maskOrderCodes', () => {
  it('ตัดรหัสออเดอร์ ข้อความอื่นคงเดิม', () => {
    expect(maskOrderCodes('ขายตามออเดอร์ S2569-001')).toBe('ขายตามออเดอร์');
    expect(maskOrderCodes('ยกเลิกออเดอร์ S2569-012 แล้วคืนรัง')).toBe('ยกเลิกออเดอร์ แล้วคืนรัง');
    expect(maskOrderCodes('รังแข็งแรง A12')).toBe('รังแข็งแรง A12');
  });
});

describe('tempPassword', () => {
  it('ยาวพอ ไม่มีตัวที่สับสน และไม่ซ้ำกัน', () => {
    const a = tempPassword();
    expect(a).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(a).not.toMatch(/[01OlI]/);
    expect(passwordProblem(a)).toBeNull();
    expect(new Set(Array.from({ length: 50 }, tempPassword)).size).toBe(50);
  });
});

describe('ลบบันทึกที่กรอกผิด', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z');
  const rec = (createdBy: number | null, hoursAgo: number) => ({ createdBy, createdAt: new Date(now - hoursAgo * 3_600_000).toISOString() });
  it('เจ้าของ/แอดมินลบได้ทุกรายการ ไม่จำกัดเวลา', () => {
    expect(canDeleteRecord({ id: 1, role: 'owner' }, rec(9, 500), now)).toBe(true);
    expect(canDeleteRecord({ id: 1, role: 'admin' }, rec(null, 500), now)).toBe(true);
  });
  it('พนักงาน: เฉพาะของตัวเองภายใน 24 ชม.', () => {
    const staff = { id: 2, role: 'staff' };
    expect(canDeleteRecord(staff, rec(2, 1), now)).toBe(true);
    expect(canDeleteRecord(staff, rec(2, 25), now)).toBe(false);
    expect(canDeleteRecord(staff, rec(3, 1), now)).toBe(false);
    expect(canDeleteRecord(staff, rec(null, 1), now)).toBe(false);
    expect(canDeleteRecord(staff, { createdBy: 2, createdAt: 'ไม่ใช่วันที่' }, now)).toBe(false);
    expect(canDeleteRecord(null, rec(2, 1), now)).toBe(false);
  });
});
