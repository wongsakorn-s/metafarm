import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, userFromToken } from './server/auth.ts';
import { securityHeaders } from './lib/security-headers.ts';
import { getDb } from './server/db.ts';
import { getSettings } from './server/settings.ts';
import { isOwner, ownerOnlyPath, passwordChangeAllowed } from './lib/permissions.ts';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

/** หน้าและ API ใต้ /admin และ /media ต้องล็อกอิน (ยกเว้นหน้า login) */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const needsAuth = (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/media/')) && !PUBLIC_ADMIN_PATHS.has(pathname);

  if (needsAuth) {
    const user = await userFromToken(getDb(), ctx.cookies.get(SESSION_COOKIE)?.value);
    if (!user) {
      if (pathname.startsWith('/media/')) return new Response('Unauthorized', { status: 401 });
      return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname + ctx.url.search)}`);
    }
    ctx.locals.user = user;
    const isGet = ctx.request.method === 'GET' || ctx.request.method === 'HEAD';
    // รหัสผ่านชั่วคราว (เจ้าของสร้าง/รีเซ็ตให้) → ต้องเปลี่ยนก่อนใช้หน้าอื่น
    if (user.mustChangePassword && !pathname.startsWith('/media/') && !passwordChangeAllowed(pathname)) {
      if (!isGet) return new Response('ต้องเปลี่ยนรหัสผ่านก่อน', { status: 403 });
      return ctx.redirect('/admin/account?first=1');
    }
    // หมวดขาย ตั้งค่า และจัดการผู้ใช้ = เจ้าของเท่านั้น (กันทั้งเปิดหน้า ส่งฟอร์ม และดาวน์โหลดไฟล์)
    if (!isOwner(user) && ownerOnlyPath(pathname)) {
      if (!isGet || /\.[a-z0-9]+$/i.test(pathname)) return new Response('ไม่มีสิทธิ์', { status: 403, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
      return next('/admin/forbidden');
    }
  }

  // โหลดการตั้งค่าเว็บ (ช่องทางติดต่อ ฯลฯ) ให้หน้าสาธารณะ — ข้ามไฟล์ (มีนามสกุล), รูป, และหลังบ้านที่ไม่ใช้
  if (!needsAuth && !pathname.startsWith('/img/') && !pathname.startsWith('/admin') && !/\.[a-z0-9]+$/i.test(pathname)) {
    ctx.locals.settings = await getSettings(getDb());
  }

  const res = await next();
  if (needsAuth || pathname === '/admin/login') {
    // หน้าหลังบ้านห้ามถูก cache และห้ามถูกค้นหา — ยกเว้นรูป /media ที่ตั้ง private cache เอง (คีย์ไม่เปลี่ยนเนื้อหา)
    if (!pathname.startsWith('/media/') || res.status >= 400) res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else if (ctx.locals.settings && !ctx.locals.settings.contact.confirmed) {
    // ช่องทางติดต่อยังเป็นตัวอย่าง = เว็บทดลอง → ห้ามติดผลค้นหา (หายเองเมื่อเจ้าของติ๊กยืนยันที่ ⚙️ ตั้งค่า)
    res.headers.set('X-Robots-Tag', 'noindex');
  }
  for (const [k, v] of Object.entries(securityHeaders({ prod: import.meta.env.PROD, https: ctx.url.protocol === 'https:' }))) res.headers.set(k, v);
  return res;
});
