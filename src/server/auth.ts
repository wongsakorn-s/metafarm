import { and, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { auditLogs, loginAttempts, sessions, users } from '../db/schema.ts';
import { newToken, passwordProblem, sha256Hex, verifyPassword, hashPassword } from '../lib/auth/password.ts';
import { LIMITS, lockedBy, throttleKeys, WINDOW_MIN } from '../lib/auth/throttle.ts';
import type { Db } from './db.ts';
import type { Role } from '../lib/permissions.ts';

export const SESSION_COOKIE = 'mf_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5; // ครั้ง (เปลี่ยนรหัสผ่าน: ใส่รหัสเดิมผิด)

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** ใช้รหัสผ่านชั่วคราวอยู่ → middleware บังคับไปหน้าเปลี่ยนรหัสผ่าน */
  mustChangePassword: boolean;
}

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

// hash ปลอมไว้เทียบเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบใกล้เคียงกัน (กันการเดาว่ามีอีเมลนี้หรือไม่)
let dummyHash: Promise<string> | undefined;

export type LoginResult = { ok: true; user: SessionUser; token: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function login(db: Db, emailRaw: string, password: string, ip: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const raw = throttleKeys(email, ip);
  const keys = { pair: await sha256Hex(raw.pair), email: await sha256Hex(raw.email), ip: await sha256Hex(raw.ip) };
  // จดครั้งนี้ไว้ก่อน แล้วค่อยนับและตรวจรหัส — เดิมนับ → ตรวจรหัส (หลายสิบมิลลิวินาที) → ค่อยจดว่าผิด
  // ส่งคำขอพร้อมกันหลายร้อยครั้ง ทุกคำขอเห็นยอดเดิมก่อนใครจด จึงเดารหัสได้เกินขีดเท่าที่ส่งพร้อมกันได้
  const mine = await claimAttempt(db, Object.values(keys));
  const counts = await failureCounts(db, Object.values(keys));
  // ยอดรวมครั้งนี้ไปแล้ว → "ก่อนหน้า" (รวมคำขอที่กำลังตรวจอยู่พร้อมกัน) = ยอด − 1
  const n = { pair: (counts.get(keys.pair) ?? 1) - 1, email: (counts.get(keys.email) ?? 1) - 1, ip: (counts.get(keys.ip) ?? 1) - 1 };
  // ล็อกแล้ว → ตอบทันทีโดยไม่ตรวจรหัสผ่าน (เดาต่อไม่ได้ และไม่บอกว่ารหัสถูกหรือไม่)
  // ไม่นับครั้งนี้ (ลบที่จดไว้) — ล็อกหมดเวลา 15 นาทีหลังครั้งที่ผิดจริง ไม่ยืดไปเรื่อย ๆ ระหว่างที่บอทยังลองอยู่
  if (lockedBy(n).length) {
    await db.delete(loginAttempts).where(inArray(loginAttempts.id, mine));
    return { ok: false, reason: 'locked' };
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  dummyHash ??= hashPassword('dummy-password-for-timing');
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !user.active || !ok) {
    // ผิด: ครั้งนี้จดไว้แล้ว · บัญชีนี้เพิ่งถูกล็อกจากการเดารหัสหลาย IP → จดไว้ให้เจ้าของเห็น (เฉพาะบัญชีที่มีจริง ครั้งที่ถึงขีดพอดี)
    if (user && n.email + 1 === LIMITS.email) await db.insert(auditLogs).values({ userId: null, action: 'login.locked', entity: 'user', entityId: user.id });
    // ล้างของเก่าเป็นครั้งคราวด้วย (เดิมล้างเฉพาะตอนล็อกอินสำเร็จ — บอทที่เดารหัสไม่หยุดทำให้ตารางโตไม่จำกัด)
    if (Math.random() < 0.05) await cleanup(db);
    return { ok: false, reason: 'invalid' };
  }

  // สำเร็จ: ล้างเฉพาะคู่ อีเมล+IP นี้ — ตัวนับรายอีเมล/รายIP คงไว้ (บอทที่เดาอยู่ไม่ได้โควตาใหม่เพราะเจ้าของล็อกอินสำเร็จ)
  // และลบที่จดไว้ของครั้งนี้ (สำเร็จไม่นับเป็นครั้งที่ผิด)
  await db.delete(loginAttempts).where(or(eq(loginAttempts.keyHash, keys.pair), inArray(loginAttempts.id, mine)));
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
): Promise<ChangePasswordResult> {
  const problem = passwordProblem(input.next);
  if (problem) return { ok: false, error: problem };
  if (input.next !== input.confirm) return { ok: false, error: 'รหัสผ่านใหม่สองช่องไม่ตรงกัน' };
  if (input.next === input.current) return { ok: false, error: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม' };

  // นับต่อผู้ใช้ ไม่แยก IP (เดิมแยก IP: คนที่ได้เครื่องที่ล็อกอินค้างไว้ เปลี่ยน IP แล้วเดารหัสเดิมได้ไม่จำกัด)
  // จดก่อนตรวจ เหมือนล็อกอิน (ส่งพร้อมกันหลายคำขอก็ตรวจได้ไม่เกินขีด)
  const key = await sha256Hex(`pwchange|${user.id}`);
  const mine = await claimAttempt(db, [key]);
  const n = ((await failureCounts(db, [key])).get(key) ?? 1) - 1;
  if (n >= MAX_FAILURES) {
    await db.delete(loginAttempts).where(inArray(loginAttempts.id, mine));
    return { ok: false, error: 'ใส่รหัสผ่านเดิมผิดหลายครั้งเกินไป กรุณารอ 15 นาที' };
  }

  const row = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { passwordHash: true, active: true } });
  if (!row?.active || !(await verifyPassword(input.current, row.passwordHash))) return { ok: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' };

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

/** จดการลองหนึ่งครั้งไว้ก่อนตรวจรหัส (ทุกกุญแจ) — คืน id ไว้ลบทีหลังถ้าไม่นับ (ล็อกอยู่ / สำเร็จ) */
async function claimAttempt(db: Db, keyHashes: string[]): Promise<number[]> {
  const [first, ...rest] = keyHashes.map((k) => db.insert(loginAttempts).values({ keyHash: k }).returning({ id: loginAttempts.id }));
  const rows = await db.batch([first!, ...rest]);
  return rows.flat().map((r) => r.id);
}

/** จำนวนครั้งที่ผิดในหน้าต่างเวลา ต่อกุญแจ (hash) */
async function failureCounts(db: Db, keyHashes: string[]): Promise<Map<string, number>> {
  if (!keyHashes.length) return new Map();
  const rows = await db
    .select({ k: loginAttempts.keyHash, n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(inArray(loginAttempts.keyHash, keyHashes), gt(loginAttempts.at, isoIn(-WINDOW_MIN * 60_000))))
    .groupBy(loginAttempts.keyHash);
  return new Map(rows.map((r) => [r.k, r.n]));
}

/** ล็อกอินผิดต่ออีเมล (รวมทุก IP) ใน 15 นาทีล่าสุด — สำหรับหน้าจัดการผู้ใช้ */
export async function emailFailures(db: Db, emails: string[]): Promise<Map<string, { n: number; locked: boolean }>> {
  const hashes = await Promise.all(emails.map((e) => sha256Hex(throttleKeys(e, '').email)));
  const counts = await failureCounts(db, hashes);
  return new Map(emails.map((e, i) => {
    const n = counts.get(hashes[i]!) ?? 0;
    return [e, { n, locked: n >= LIMITS.email }];
  }));
}

/** ปลดล็อกรายอีเมล (เจ้าของกดให้พนักงานที่ถูกล็อก) — ตัวนับราย IP ยังอยู่ */
export async function unlockEmail(db: Db, email: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.keyHash, await sha256Hex(throttleKeys(email, '').email)));
}
