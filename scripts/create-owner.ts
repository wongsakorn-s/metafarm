// สร้าง/รีเซ็ตรหัสผ่านเจ้าของ ในฐานข้อมูลบนเครื่อง (local D1)
//
//   npm run user:create -- --email owner@metafarm.local --generate
//       สุ่มรหัสผ่านให้ แล้วเขียนไว้ที่ private/dev-owner.txt (ไม่ขึ้น git)
//   METAFARM_PASSWORD='รหัสผ่านของคุณ' npm run user:create -- --email you@example.com --name "ชื่อ"
//       ใช้รหัสผ่านจากตัวแปรสภาพแวดล้อม (ไม่ใส่ในบรรทัดคำสั่ง เพราะจะค้างใน history)
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getPlatformProxy } from 'wrangler';
import { hashPassword, passwordProblem } from '../src/lib/auth/password.ts';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string', default: 'เจ้าของฟาร์ม' }, generate: { type: 'boolean', default: false }, role: { type: 'string', default: 'owner' } },
});
const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('ต้องระบุ --email ที่ถูกต้อง');
if (values.role !== 'owner' && values.role !== 'staff') throw new Error('--role ต้องเป็น owner หรือ staff');

let password = process.env.METAFARM_PASSWORD;
if (values.generate) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  password = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => alphabet[b % alphabet.length]).join('');
}
if (!password) throw new Error('ต้องใส่ --generate หรือตั้ง METAFARM_PASSWORD');
const problem = passwordProblem(password);
if (problem) throw new Error(problem);

const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
try {
  await env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, role, active) VALUES (?1, ?2, ?3, ?4, 1)
     ON CONFLICT(email) DO UPDATE SET password_hash = ?3, name = ?2, role = ?4, active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  )
    .bind(email, values.name, await hashPassword(password), values.role)
    .run();
  // ล้าง session เดิมของผู้ใช้นี้เมื่อเปลี่ยนรหัสผ่าน
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?1)`).bind(email).run();
} finally {
  await dispose();
}

if (values.generate) {
  mkdirSync('private', { recursive: true });
  writeFileSync('private/dev-owner.txt', `อีเมล: ${email}\nรหัสผ่าน: ${password}\n(ใช้กับเครื่องนี้เท่านั้น เปลี่ยนได้ด้วยคำสั่ง npm run user:create)\n`);
  console.log(`สร้างผู้ใช้ ${email} แล้ว — อีเมลและรหัสผ่านอยู่ที่ private/dev-owner.txt`);
} else {
  console.log(`ตั้งรหัสผ่านของ ${email} แล้ว`);
}
