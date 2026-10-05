// สร้าง sitemap.xml / robots.txt (ไม่ผูกกับ runtime) — ใช้ origin ของคำขอ จึงถูกต้องทั้งบนเครื่องและเมื่อมีโดเมนจริง

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildSitemap(origin: string, paths: string[]): string {
  const unique = [...new Set(paths)];
  const urls = unique.map((p) => `  <url><loc>${esc(new URL(p, origin).href)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** preview = ช่องทางติดต่อยังเป็นข้อมูลตัวอย่าง → ห้ามเครื่องมือค้นหาเก็บทั้งเว็บ (กันข้อมูลจำลองค้างใน Google) */
export function buildRobots(origin: string, preview = false): string {
  if (preview) return ['User-agent: *', 'Disallow: /', ''].join('\n');
  return ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /media/', '', `Sitemap: ${new URL('/sitemap.xml', origin).href}`, ''].join('\n');
}
