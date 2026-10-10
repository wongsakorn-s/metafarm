// จัดการผู้ใช้บนฐานข้อมูล D1 จริง (ชั่วคราว): บทบาทแอดมิน และการเปลี่ยนบทบาท
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changeRole, createStaff, setStaffActive } from './users.ts';
import { testDb } from './test-d1.ts';
import type { SessionUser } from './auth.ts';

let t: Awaited<ReturnType<typeof testDb>>;
let n = 0;
beforeAll(async () => { t = await testDb(); }, 60_000);
afterAll(() => t?.close());

const add = async (role: 'staff' | 'admin') => {
  const r = await createStaff(t.db, t.owner, { name: `ผู้ใช้ ${++n}`, email: `u${n}@metafarm.local`, role });
  if (!r.ok) throw new Error(r.error);
  return { id: r.id, email: `u${n}@metafarm.local`, name: `ผู้ใช้ ${n}`, role, mustChangePassword: false } as SessionUser;
};
const roleOf = async (id: number) => (await t.d1.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: string }>())!.role;

describe('บทบาทแอดมิน', () => {
  it('เจ้าของเพิ่มแอดมินได้ · แอดมินจัดการผู้ใช้ไม่ได้', async () => {
    const admin = await add('admin');
    expect(await roleOf(admin.id)).toBe('admin');
    expect(await createStaff(t.db, admin, { name: 'x', email: 'x@metafarm.local', role: 'staff' })).toMatchObject({ ok: false });
    const staff = await add('staff');
    expect(await changeRole(t.db, admin, { userId: staff.id, role: 'admin' })).toMatchObject({ ok: false });
    expect(await setStaffActive(t.db, admin, staff.id, false)).toMatchObject({ ok: false });
  });
});

describe('เปลี่ยนบทบาท', () => {
  it('เจ้าของเปลี่ยนพนักงาน → แอดมิน → เจ้าของ และลดกลับได้ · ออกจากระบบทุกเครื่อง', async () => {
    const u = await add('staff');
    await t.d1.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h${u.id}', ?, '2099-01-01T00:00:00Z')`).bind(u.id).run();
    expect(await changeRole(t.db, t.owner, { userId: u.id, role: 'admin' })).toEqual({ ok: true });
    expect(await roleOf(u.id)).toBe('admin');
    const left = await t.d1.prepare('SELECT count(*) c FROM sessions WHERE user_id = ?').bind(u.id).first<{ c: number }>();
    expect(left!.c).toBe(0);
    expect(await changeRole(t.db, t.owner, { userId: u.id, role: 'owner' })).toEqual({ ok: true });
    expect(await changeRole(t.db, t.owner, { userId: u.id, role: 'admin' })).toEqual({ ok: true });
    expect(await roleOf(u.id)).toBe('admin');
  });

  it('เปลี่ยนบทบาทตัวเองไม่ได้ (เหลือเจ้าของอย่างน้อย 1 คนเสมอ)', async () => {
    expect(await changeRole(t.db, t.owner, { userId: t.owner.id, role: 'admin' })).toMatchObject({ ok: false });
    expect(await roleOf(t.owner.id)).toBe('owner');
  });

  it('บัญชีเจ้าของคนอื่น: เปลี่ยนบทบาทได้ แต่ปิดบัญชีตรง ๆ ไม่ได้', async () => {
    const u = await add('admin');
    await changeRole(t.db, t.owner, { userId: u.id, role: 'owner' });
    expect(await setStaffActive(t.db, t.owner, u.id, false)).toMatchObject({ ok: false });
    expect(await changeRole(t.db, t.owner, { userId: u.id, role: 'staff' })).toEqual({ ok: true });
  });
});
