import { describe, expect, it } from 'vitest';
import { isOwner, maskOrderCodes, ownerOnlyPath, passwordChangeAllowed, statusTargets } from './permissions.ts';
import { passwordProblem, tempPassword } from './auth/password.ts';

describe('ownerOnlyPath', () => {
  it('หมวดขาย ตั้งค่า และจัดการผู้ใช้ = เจ้าของเท่านั้น', () => {
    for (const p of ['/admin/orders', '/admin/orders/new', '/admin/orders/S2569-001', '/admin/customers/3', '/admin/products', '/admin/reports', '/admin/reports/export/orders.csv', '/admin/settings', '/admin/readiness', '/admin/users', '/admin/users/', '/admin/Orders']) {
      expect(ownerOnlyPath(p), p).toBe(true);
    }
  });
  it('งานรัง ล็อต ผลผลิต บัญชีตัวเอง = พนักงานเข้าได้', () => {
    for (const p of ['/admin', '/admin/hives', '/admin/hives/A12', '/admin/hives/A12/edit', '/admin/hives/new', '/admin/lots', '/admin/lots/H2569-10-1/labels', '/admin/production', '/admin/quick', '/admin/photos', '/admin/todo', '/admin/more', '/admin/account', '/admin/ordersx', '/admin/usersettings']) {
      expect(ownerOnlyPath(p), p).toBe(false);
    }
  });
});

describe('isOwner', () => {
  it('เฉพาะ role owner', () => {
    expect(isOwner({ role: 'owner' })).toBe(true);
    expect(isOwner({ role: 'staff' })).toBe(false);
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
  });
});

describe('statusTargets', () => {
  it('เจ้าของเปลี่ยนได้ทุกสถานะ', () => {
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
