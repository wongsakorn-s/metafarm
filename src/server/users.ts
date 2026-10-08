// จัดการผู้ใช้ (Phase 5.1) — เจ้าของเพิ่ม/ปิด/รีเซ็ตรหัสผ่านของ "พนักงาน" ได้จากหลังบ้าน (ไม่ต้องรัน wrangler)
// บัญชีเจ้าของไม่ถูกแตะจากหน้านี้ (กันปิดตัวเอง/ไม่เหลือเจ้าของ) — เจ้าของเพิ่มด้วย scripts/create-owner.ts เท่านั้น
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditLogs, sessions, users } from '../db/schema.ts';
import { hashPassword, tempPassword } from '../lib/auth/password.ts';
import { isOwner } from '../lib/permissions.ts';
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
});

export async function listUsers(db: Db) {
  return db
    .select({
      id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, mustChangePassword: users.mustChangePassword, createdAt: users.createdAt,
      lastLogin: sql<string | null>`(select max(s.created_at) from sessions s where s.user_id = users.id)`,
    })
    .from(users)
    .orderBy(sql`case ${users.role} when 'owner' then 0 else 1 end`, asc(users.name));
}

const staffTarget = async (db: Db, by: SessionUser, id: number) => {
  if (!isOwner(by)) return { error: 'เฉพาะเจ้าของเท่านั้น' } as const;
  if (id === by.id) return { error: 'แก้บัญชีของตัวเองจากหน้านี้ไม่ได้ — ใช้หน้าบัญชีของฉัน' } as const;
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) return { error: 'ไม่พบผู้ใช้' } as const;
  if (u.role !== 'staff') return { error: 'จัดการได้เฉพาะบัญชีพนักงาน' } as const;
  return { user: u } as const;
};

/**
 * เพิ่มพนักงาน: สุ่มรหัสผ่านชั่วคราว (แสดงครั้งเดียว) และบังคับเปลี่ยนตอนเข้าใช้ครั้งแรก
 * ส่งฟอร์มซ้ำด้วยคีย์เดิม (กดสองครั้ง/รีเฟรช) → สุ่มรหัสใหม่ให้บัญชีเดิม เพราะรหัสครั้งแรกอาจไม่ได้เห็น
 */
export async function createStaff(db: Db, by: SessionUser, d: z.output<typeof newStaffSchema>): Promise<Result<{ id: number; password: string }>> {
  if (!isOwner(by)) return { ok: false, error: 'เฉพาะเจ้าของเท่านั้น' };
  const existing = await db.query.users.findFirst({ where: eq(users.email, d.email) });
  if (existing) {
    const mine = d.idem
      ? await db.select({ id: auditLogs.id }).from(auditLogs)
          .where(and(eq(auditLogs.action, 'user.create'), eq(auditLogs.entityId, existing.id), eq(auditLogs.userId, by.id), sql`json_extract(${auditLogs.diff}, '$.idem') = ${d.idem}`)).limit(1)
      : [];
    if (mine.length && existing.role === 'staff') {
      const r = await resetStaffPassword(db, by, existing.id);
      return r.ok ? { ok: true, id: existing.id, password: r.password } : r;
    }
    return { ok: false, error: 'อีเมลนี้มีบัญชีอยู่แล้ว' };
  }
  const password = tempPassword();
  const [row] = await db.insert(users).values({ email: d.email, name: d.name, passwordHash: await hashPassword(password), role: 'staff', active: true, mustChangePassword: true }).returning({ id: users.id });
  await audit(db, by, 'user.create', row!.id, { email: d.email, role: 'staff', idem: d.idem ?? null });
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
