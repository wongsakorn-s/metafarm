import { describe, expect, it } from 'vitest';
import { hashPassword, newToken, passwordProblem, sha256Hex, timingSafeEqual, verifyPassword } from './password.ts';

describe('password', () => {
  it('hash แล้ว verify ผ่าน และใช้ salt ต่างกันทุกครั้ง', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
  });

  it('รหัสผิด / รูปแบบเสีย / รอบสูงเกินกำหนด → ไม่ผ่าน', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong password!', h)).toBe(false);
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$99999999$AAAA$AAAA')).toBe(false);
  });

  it('รหัสผ่านภาษาไทยใช้ได้', async () => {
    const h = await hashPassword('รหัสลับของฟาร์ม123');
    expect(await verifyPassword('รหัสลับของฟาร์ม123', h)).toBe(true);
  });

  it('timingSafeEqual', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });

  it('passwordProblem', () => {
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('long enough pw')).toBeNull();
  });

  it('token สุ่มไม่ซ้ำ และ hash คงที่', async () => {
    expect(newToken()).not.toBe(newToken());
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
