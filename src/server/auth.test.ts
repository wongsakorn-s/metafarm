// ล็อกอิน/เปลี่ยนรหัสผ่านบนฐานข้อมูล D1 จริง (ชั่วคราว): จำกัดการเดารหัส รวมถึงตอนส่งคำขอพร้อมกันจำนวนมาก
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../lib/auth/password.ts';
import { LIMITS } from '../lib/auth/throttle.ts';
import { changeName, changePassword, emailFailures, login } from './auth.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
let hash = '';
let seq = 0;
const PASS = 'correct-horse-battery';

beforeAll(async () => {
  t = await testDb();
  hash = await hashPassword(PASS);
}, 60_000);
afterAll(() => t?.close());

/** ผู้ใช้ใหม่ต่อ test (ตัวนับไม่ปนกัน) */
async function user() {
  const n = ++seq;
  const email = `u${n}@metafarm.local`;
  const r = await t.d1.prepare(`INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, 'staff', 1) RETURNING id`).bind(email, `ผู้ใช้ ${n}`, hash).first<{ id: number }>();
  return { email, id: r!.id, n };
}
const failures = async (email: string) => (await emailFailures(t.db, [email])).get(email)!.n;

describe('login', () => {
  it('ส่งรหัสผิดพร้อมกัน 25 คำขอ (คนละ IP) → ตรวจรหัสรวมทั้งหน้าต่างเวลาได้ไม่เกินขีดต่ออีเมล', async () => {
    const u = await user();
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => login(t.db, u.email, `wrong-${i}`, `10.${u.n}.0.${i}`)));
    const burst = rs.filter((r) => !r.ok && r.reason === 'invalid').length;
    expect(burst).toBeLessThanOrEqual(LIMITS.email);
    expect(await failures(u.email)).toBe(burst);
    // ลองต่อทีละครั้งจนล็อก: รวมทั้งหมดต้องตรวจได้พอดีขีด (ไม่เกิน และไม่ล็อกเกินจริง)
    let more = 0;
    for (let i = 0; i < 30; i++) {
      const r = await login(t.db, u.email, 'wrong', `10.${u.n}.9.${i}`);
      if (!r.ok && r.reason === 'locked') break;
      more++;
    }
    expect(burst + more).toBe(LIMITS.email);
  }, 60_000);

  it('ล็อกแล้ว: รหัสถูกก็เข้าไม่ได้ และการลองต่อไม่ยืดเวลาล็อก', async () => {
    const u = await user();
    for (let i = 0; i < LIMITS.email; i++) expect(await login(t.db, u.email, 'wrong', `10.${u.n}.1.${i}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(await login(t.db, u.email, PASS, `10.${u.n}.2.1`)).toEqual({ ok: false, reason: 'locked' });
    expect(await login(t.db, u.email, 'wrong', `10.${u.n}.2.2`)).toEqual({ ok: false, reason: 'locked' });
    expect(await failures(u.email)).toBe(LIMITS.email);
  });

  it('ล็อกอินสำเร็จไม่นับเป็นครั้งที่ผิด', async () => {
    const u = await user();
    for (let i = 0; i < 3; i++) await login(t.db, u.email, 'wrong', `10.${u.n}.3.${i}`);
    expect((await login(t.db, u.email, PASS, `10.${u.n}.3.9`)).ok).toBe(true);
    expect(await failures(u.email)).toBe(3);
  });

  it('IPv6 ในช่วง /64 เดียวกัน นับเป็นที่เดียว (เปลี่ยนเลขท้ายไม่ได้โควตาใหม่)', async () => {
    const u = await user();
    for (let i = 1; i <= LIMITS.pair; i++) await login(t.db, u.email, 'wrong', `2001:db8:${u.n}:7::${i}`);
    expect(await login(t.db, u.email, PASS, `2001:db8:${u.n}:7:abcd::99`)).toEqual({ ok: false, reason: 'locked' });
    expect((await login(t.db, u.email, PASS, `2001:db8:${u.n}:8::1`)).ok).toBe(true);
  });
});

describe('changePassword', () => {
  const tries = (u: { id: number; email: string }, current: string) =>
    changePassword(t.db, { id: u.id, email: u.email, name: 'x', role: 'staff', mustChangePassword: false }, undefined, { current, next: 'a-brand-new-password', confirm: 'a-brand-new-password' });

  it('เดารหัสเดิมผิดพร้อมกัน 12 คำขอ → ตรวจได้ไม่เกิน 5 ครั้ง แล้วรหัสถูกก็ต้องรอ', async () => {
    const u = await user();
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => tries(u, `wrong-${i}`)));
    let checked = rs.filter((r) => !r.ok && r.error === 'รหัสผ่านเดิมไม่ถูกต้อง').length;
    expect(checked).toBeLessThanOrEqual(5);
    for (let i = 0; i < 10; i++) {
      const r = await tries(u, 'wrong');
      if (!r.ok && r.error.includes('รอ 15 นาที')) break;
      checked++;
    }
    expect(checked).toBe(5);
    expect(await tries(u, PASS)).toMatchObject({ ok: false, error: expect.stringContaining('รอ 15 นาที') });
  }, 60_000);
});

describe('changeName', () => {
  it('เปลี่ยนชื่อตัวเองได้ · ตัดช่องว่างหัวท้าย · เว้นว่างไม่ได้ · ยาวเกิน 60 ไม่ได้ · ชื่อเดิมไม่ถือเป็น error', async () => {
    const u = await user();
    const me = { id: u.id, email: u.email, name: `ผู้ใช้ ${u.n}`, role: 'staff' as const, mustChangePassword: false };
    expect(await changeName(t.db, me, '  ชื่อใหม่  ')).toEqual({ ok: true });
    expect((await t.d1.prepare('SELECT name FROM users WHERE id = ?').bind(u.id).first<{ name: string }>())!.name).toBe('ชื่อใหม่');
    expect(await changeName(t.db, me, '')).toMatchObject({ ok: false, error: 'กรอกชื่อ' });
    expect(await changeName(t.db, me, '   ')).toMatchObject({ ok: false, error: 'กรอกชื่อ' });
    expect(await changeName(t.db, me, 'ก'.repeat(61))).toMatchObject({ ok: false, error: expect.stringContaining('60') });
    expect(await changeName(t.db, me, 'ชื่อใหม่')).toEqual({ ok: true }); // ชื่อเดิม (หลัง trim) — ไม่ error แต่ไม่เขียนทับไม่จำเป็น
  });
});
