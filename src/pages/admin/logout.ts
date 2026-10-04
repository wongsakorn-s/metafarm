import type { APIRoute } from 'astro';
import { clearSessionCookie, logout, SESSION_COOKIE } from '../../server/auth.ts';
import { getDb } from '../../server/db.ts';

export const prerender = false;

// POST เท่านั้น (กัน logout ผ่านลิงก์/รูปจากเว็บอื่น) — Astro ตรวจ Origin ของฟอร์มให้อยู่แล้ว
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await logout(getDb(), cookies.get(SESSION_COOKIE)?.value);
  clearSessionCookie(cookies);
  return redirect('/admin/login', 303);
};
