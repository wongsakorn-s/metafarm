import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, userFromToken } from './server/auth.ts';
import { securityHeaders } from './lib/security-headers.ts';
import { getDb } from './server/db.ts';
import { getSettings } from './server/settings.ts';

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
  }

  // โหลดการตั้งค่าเว็บ (ช่องทางติดต่อ ฯลฯ) ให้หน้าสาธารณะ — ข้ามไฟล์ (มีนามสกุล), รูป, และหลังบ้านที่ไม่ใช้
  if (!needsAuth && !pathname.startsWith('/img/') && !pathname.startsWith('/admin') && !/\.[a-z0-9]+$/i.test(pathname)) {
    ctx.locals.settings = await getSettings(getDb());
  }

  const res = await next();
  if (needsAuth || pathname === '/admin/login') {
    // หน้าหลังบ้านห้ามถูก cache และห้ามถูกค้นหา
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  for (const [k, v] of Object.entries(securityHeaders({ prod: import.meta.env.PROD, https: ctx.url.protocol === 'https:' }))) res.headers.set(k, v);
  return res;
});
