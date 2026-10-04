// หัวข้อความปลอดภัยของทุกหน้า (ไม่ผูกกับ runtime ทดสอบได้)

/** Content-Security-Policy: โหลดได้เฉพาะจากเว็บเราเอง ยกเว้นเฟรมวิดีโอ YouTube (โหมดความเป็นส่วนตัวขั้นสูง) */
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Astro ฝังสคริปต์/สไตล์สั้น ๆ ในหน้า จึงต้อง 'unsafe-inline' (ยังกันโค้ดจากโดเมนอื่นได้)
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  'frame-src https://www.youtube-nocookie.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export interface HeaderOptions {
  /** build จริง (ไม่ใช่ dev server ซึ่งใช้ websocket/สคริปต์ของตัวเอง ซึ่ง CSP นี้จะบล็อก) */
  prod: boolean;
  /** คำขอมาทาง https */
  https: boolean;
}

export function securityHeaders({ prod, https }: HeaderOptions): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  if (prod) h['Content-Security-Policy'] = CSP;
  if (prod && https) h['Strict-Transport-Security'] = 'max-age=15552000'; // 6 เดือน (ยังไม่ includeSubDomains/preload)
  return h;
}
