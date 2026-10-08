// แฮชรหัสผ่านด้วย PBKDF2-SHA256 ผ่าน WebCrypto (ใช้ได้ทั้ง Cloudflare Workers และ Node)
// หมายเหตุ: Workers จำกัด PBKDF2 ไม่เกิน 100,000 รอบ
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, HASH_BITS);
}

/** รูปแบบ: pbkdf2$<iterations>$<salt b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const iterations = Number(iter);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false;
  const actual = new Uint8Array(await derive(password, unb64(salt), iterations));
  return timingSafeEqual(actual, unb64(hash));
}

/** เทียบแบบเวลาคงที่ */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** รหัสผ่านขั้นต่ำ: ยาวอย่างน้อย 10 ตัวอักษร */
export function passwordProblem(password: string): string | null {
  return password.length < 10 ? 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร' : null;
}

/** รหัสผ่านชั่วคราวที่อ่าน/พิมพ์ง่าย (ตัด 0 O 1 l I ที่สับสน) เช่น "k7Qm-x9Tb-R4pz" — 12 ตัว + ขีด */
export function tempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** token สุ่มสำหรับ cookie (base64url, 32 ไบต์) และ hash ที่เก็บในฐานข้อมูล */
export function newToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
