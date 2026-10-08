import { and, eq, gt, sql } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { auditLogs, loginAttempts, sessions, users } from '../db/schema.ts';
import { newToken, passwordProblem, sha256Hex, verifyPassword, hashPassword } from '../lib/auth/password.ts';
import type { Db } from './db.ts';

export const SESSION_COOKIE = 'mf_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5; // ครั้ง
const WINDOW_MIN = 15; // นาที

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  /** ใช้รหัสผ่านชั่วคราวอยู่ → middleware บังคับไปหน้าเปลี่ยนรหัสผ่าน */
  mustChangePassword: boolean;
}

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

// hash ปลอมไว้เทียบเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบใกล้เคียงกัน (กันการเดาว่ามีอีเมลนี้หรือไม่)
let dummyHash: Promise<string> | undefined;

export type LoginResult = { ok: true; user: SessionUser; token: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function login(db: Db, emailRaw: string, password: string, ip: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const key = await sha256Hex(`${email}|${ip}`);
  const since = isoIn(-WINDOW_MIN * 60_000);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.keyHash, key), gt(loginAttempts.at, since)));
  if (n >= MAX_FAILURES) return { ok: false, reason: 'locked' };

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  dummyHash ??= hashPassword('dummy-password-for-timing');
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || !ok) {
    await db.insert(loginAttempts).values({ keyHash: key });
    // ล้างของเก่าเป็นครั้งคราวด้วย (เดิมล้างเฉพาะตอนล็อกอินสำเร็จ — บอทที่เดารหัสไม่หยุดทำให้ตารางโตไม่จำกัด)
    if (Math.random() < 0.05) await cleanup(db);
    return { ok: false, reason: 'invalid' };
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.keyHash, key));
  const token = newToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: await sha256Hex(token),
    expiresAt: isoIn(SESSION_DAYS * 86_400_000),
  });
  return { ok: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } };
}

export type ChangePasswordResult = { ok: true; otherSessionsEnded: boolean } | { ok: false; error: string };

/**
 * เปลี่ยนรหัสผ่านของตัวเอง: ต้องใส่รหัสผ่านเดิมให้ถูก (กันคนที่เปิดเครื่องค้างไว้มาเปลี่ยน)
 * ลองรหัสเดิมผิดซ้ำมีจำกัดเหมือนตอนล็อกอิน และเมื่อเปลี่ยนสำเร็จจะ "ออกจากระบบ" ทุกอุปกรณ์อื่น (เก็บเฉพาะ session ปัจจุบัน)
 */
export async function changePassword(
  db: Db,
  user: SessionUser,
  currentToken: string | undefined,
  input: { current: string; next: string; confirm: string },
  ip: string,
): Promise<ChangePasswordResult> {
  const problem = passwordProblem(input.next);
  if (problem) return { ok: false, error: problem };
  if (input.next !== input.confirm) return { ok: false, error: 'รหัสผ่านใหม่สองช่องไม่ตรงกัน' };
  if (input.next === input.current) return { ok: false, error: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม' };

  const key = await sha256Hex(`pwchange|${user.id}|${ip}`);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.keyHash, key), gt(loginAttempts.at, isoIn(-WINDOW_MIN * 60_000))));
  if (n >= MAX_FAILURES) return { ok: false, error: 'ใส่รหัสผ่านเดิมผิดหลายครั้งเกินไป กรุณารอ 15 นาที' };

  const row = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { passwordHash: true, active: true } });
  if (!row?.active || !(await verifyPassword(input.current, row.passwordHash))) {
    await db.insert(loginAttempts).values({ keyHash: key });
    return { ok: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  }

  const keepHash = currentToken ? await sha256Hex(currentToken) : '';
  await db.batch([
    db.update(users).set({ passwordHash: await hashPassword(input.next), mustChangePassword: false, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` }).where(eq(users.id, user.id)),
    db.delete(sessions).where(and(eq(sessions.userId, user.id), sql`${sessions.tokenHash} != ${keepHash}`)),
    db.delete(loginAttempts).where(eq(loginAttempts.keyHash, key)),
    db.insert(auditLogs).values({ userId: user.id, action: 'user.password_change', entity: 'user', entityId: user.id }),
  ]);
  return { ok: true, otherSessionsEnded: true };
}

export async function userFromToken(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, mustChangePassword: users.mustChangePassword })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, await sha256Hex(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1);
  const u = rows[0];
  return u?.active ? { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword } : null;
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
}

/** ลบ session หมดอายุ และบันทึกล็อกอินผิดที่เก่าเกินหน้าต่าง (เรียกตอนล็อกอินสำเร็จ และสุ่ม 5% ตอนล็อกอินผิด) */
export async function cleanup(db: Db) {
  const now = new Date().toISOString();
  await db.delete(sessions).where(sql`${sessions.expiresAt} < ${now}`);
  await db.delete(loginAttempts).where(sql`${loginAttempts.at} < ${isoIn(-WINDOW_MIN * 60_000)}`);
}

export function setSessionCookie(cookies: AstroCookies, token: string) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}
export const clearSessionCookie = (cookies: AstroCookies) => cookies.delete(SESSION_COOKIE, { path: '/' });
