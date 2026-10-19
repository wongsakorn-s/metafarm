// จัดการผู้ใช้ (Phase 5.1) — เจ้าของเพิ่ม/ปิด/รีเซ็ตรหัสผ่านของพนักงานและแอดมินได้จากหลังบ้าน (ไม่ต้องรัน wrangler)
// เปลี่ยนบทบาท (2026-10-10): เจ้าของเปลี่ยนบทบาทผู้อื่นได้ (รวมเลื่อนเป็น/ลดจากเจ้าของ) · แก้บัญชีตัวเองไม่ได้ จึงเหลือเจ้าของอย่างน้อย 1 คนเสมอ
// บัญชีเจ้าของคนอื่น: เปลี่ยนบทบาทได้อย่างเดียว (ไม่ปิด/รีเซ็ตรหัสของเจ้าของด้วยกัน)
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditLogs, sessions, users } from '../db/schema.ts';
import { hashPassword, tempPassword } from '../lib/auth/password.ts';
import { canManageUsers, ROLES, type Role } from '../lib/permissions.ts';
import { unlockEmail, type SessionUser } from './auth.ts';
import type { Db } from './db.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const touch = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` };
const audit = (db: Db, by: SessionUser, action: string, userId: number | null, diff?: unknown) =>
  db.insert(auditLogs).values({ userId: by.id, action, entity: 'user', entityId: userId, diff: diff ?? null });

export const newStaffSchema = z.object({
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string('กรอกชื่อ').min(1, 'กรอกชื่อ').max(60, 'ยาวเกิน 60 ตัวอักษร')),
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.string('กรอกอีเมล').regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'อีเมลไม่ถูกต้อง').max(120)),
  idem: z.string().max(80).optional(),
  /** บทบาทของบัญชีใหม่: พนักงาน หรือ แอดมิน (เจ้าของ: เพิ่มเป็นแอดมินก่อนแล้วเปลี่ยนบทบาท) */
  role: z.preprocess((v) => v || 'staff', z.enum(['staff', 'admin'])),
});

export const roleSchema = z.object({ userId: z.coerce.number().int().positive(), role: z.enum(ROLES as [Role, ...Role[]]) });

export const renameSchema = z.object({
  userId: z.coerce.number().int().positive(),
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string('กรอกชื่อ').min(1, 'กรอกชื่อ').max(60, 'ยาวเกิน 60 ตัวอักษร')),
});

export async function listUsers(db: Db) {
  return db
    .select({
      id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, mustChangePassword: users.mustChangePassword, createdAt: users.createdAt,
      lastLogin: sql<string | null>`(select max(s.created_at) from sessions s where s.user_id = users.id)`,
    })
    .from(users)
    .orderBy(sql`case ${users.role} when 'owner' then 0 when 'admin' then 1 else 2 end`, asc(users.name));
}

/** บัญชีที่เจ้าของจัดการได้: ไม่ใช่ตัวเอง · ปิด/รีเซ็ต/ปลดล็อก ได้เฉพาะพนักงานและแอดมิน (ไม่แตะเจ้าของด้วยกัน) */
const staffTarget = async (db: Db, by: SessionUser, id: number, allowOwner = false) => {
  if (!canManageUsers(by)) return { error: 'เฉพาะเจ้าของเท่านั้น' } as const;
  if (id === by.id) return { error: 'แก้บัญชีของตัวเองจากหน้านี้ไม่ได้ — ใช้หน้าบัญชีของฉัน' } as const;
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) return { error: 'ไม่พบผู้ใช้' } as const;
  if (u.role === 'owner' && !allowOwner) return { error: 'บัญชีเจ้าของจัดการจากหน้านี้ไม่ได้ — เปลี่ยนบทบาทเป็นแอดมินก่อน' } as const;
  return { user: u } as const;
};

/**
 * เปลี่ยนบทบาท (เจ้าของเท่านั้น · แก้ตัวเองไม่ได้ → มีเจ้าของเหลืออย่างน้อย 1 คนเสมอ)
 * เปลี่ยนแล้วออกจากระบบทุกเครื่องของผู้นั้น — ล็อกอินใหม่แล้วเห็นเมนูตามบทบาทใหม่
 */
export async function changeRole(db: Db, by: SessionUser, d: z.output<typeof roleSchema>): Promise<Result> {
  const t = await staffTarget(db, by, d.userId, true);
  if ('error' in t) return { ok: false, error: t.error! };
  if (t.user.role === d.role) return { ok: true };
  await db.batch([
    db.update(users).set({ role: d.role, ...touch }).where(eq(users.id, d.userId)),
    db.delete(sessions).where(eq(sessions.userId, d.userId)),
    audit(db, by, 'user.role', d.userId, { from: t.user.role, to: d.role }),
  ]);
  return { ok: true };
}

/** เจ้าของแก้ชื่อผู้ใช้คนอื่น (แอดมิน/พนักงาน/เจ้าของคนอื่น) — ไม่กระทบรหัสผ่าน/เซสชัน แค่ชื่อที่โชว์ */
export async function renameStaff(db: Db, by: SessionUser, d: z.output<typeof renameSchema>): Promise<Result> {
  const name = d.name.trim();
  if (!name) return { ok: false, error: 'กรอกชื่อ' };
  if (name.length > 60) return { ok: false, error: 'ยาวเกิน 60 ตัวอักษร' };
  const t = await staffTarget(db, by, d.userId, true);
  if ('error' in t) return { ok: false, error: t.error! };
  if (t.user.name === name) return { ok: true };
  await db.batch([
    db.update(users).set({ name, ...touch }).where(eq(users.id, d.userId)),
    audit(db, by, 'user.name_change', d.userId, { from: t.user.name, to: name }),
  ]);
  return { ok: true };
}

/**
 * เพิ่มพนักงาน: สุ่มรหัสผ่านชั่วคราว (แสดงครั้งเดียว) และบังคับเปลี่ยนตอนเข้าใช้ครั้งแรก
 * ส่งฟอร์มซ้ำด้วยคีย์เดิม (กดสองครั้ง/รีเฟรช) → สุ่มรหัสใหม่ให้บัญชีเดิม เพราะรหัสครั้งแรกอาจไม่ได้เห็น
 */
export async function createStaff(db: Db, by: SessionUser, d: z.output<typeof newStaffSchema>): Promise<Result<{ id: number; password: string }>> {
  if (!canManageUsers(by)) return { ok: false, error: 'เฉพาะเจ้าของเท่านั้น' };
  const existing = await db.query.users.findFirst({ where: eq(users.email, d.email) });
  if (existing) {
    const mine = d.idem
      ? await db.select({ id: auditLogs.id }).from(auditLogs)
          .where(and(eq(auditLogs.action, 'user.create'), eq(auditLogs.entityId, existing.id), eq(auditLogs.userId, by.id), sql`json_extract(${auditLogs.diff}, '$.idem') = ${d.idem}`)).limit(1)
      : [];
    if (mine.length && existing.role !== 'owner') {
      const r = await resetStaffPassword(db, by, existing.id);
      return r.ok ? { ok: true, id: existing.id, password: r.password } : r;
    }
    return { ok: false, error: 'อีเมลนี้มีบัญชีอยู่แล้ว' };
  }
  const password = tempPassword();
  const [row] = await db.insert(users).values({ email: d.email, name: d.name, passwordHash: await hashPassword(password), role: d.role, active: true, mustChangePassword: true }).returning({ id: users.id });
  await audit(db, by, 'user.create', row!.id, { email: d.email, role: d.role, idem: d.idem ?? null });
  return { ok: true, id: row!.id, password };
}

/** ปิด/เปิดบัญชีพนักงาน — ปิดแล้วออกจากระบบทุกเครื่องทันที */
export async function setStaffActive(db: Db, by: SessionUser, id: number, active: boolean): Promise<Result> {
  const t = await staffTarget(db, by, id);
  if ('error' in t) return { ok: false, error: t.error! };
  if (t.user.active === active) return { ok: true };
  await db.batch([
    db.update(users).set({ active, ...touch }).where(eq(users.id, id)),
    db.delete(sessions).where(eq(sessions.userId, id)),
    audit(db, by, active ? 'user.enable' : 'user.disable', id),
  ]);
  return { ok: true };
}

/** ปลดล็อกพนักงานที่ใส่รหัสผิดเกินจำนวน (ตัวนับรายอีเมล) — เจ้าของยืนยันตัวตนกับพนักงานเองก่อนกด */
export async function unlockStaff(db: Db, by: SessionUser, id: number): Promise<Result> {
  const t = await staffTarget(db, by, id);
  if ('error' in t) return { ok: false, error: t.error! };
  await unlockEmail(db, t.user.email);
  await audit(db, by, 'user.unlock', id);
  return { ok: true };
}

/** รีเซ็ตรหัสผ่านพนักงาน (ลืมรหัส) — รหัสชั่วคราวใหม่ + ออกจากระบบทุกเครื่อง + บังคับเปลี่ยน */
export async function resetStaffPassword(db: Db, by: SessionUser, id: number): Promise<Result<{ password: string }>> {
  const t = await staffTarget(db, by, id);
  if ('error' in t) return { ok: false, error: t.error! };
  const password = tempPassword();
  await db.batch([
    db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, ...touch }).where(eq(users.id, id)),
    db.delete(sessions).where(eq(sessions.userId, id)),
    audit(db, by, 'user.password_reset', id),
  ]);
  return { ok: true, password };
}
