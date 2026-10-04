import { describe, expect, it } from 'vitest';
import { buildRobots, buildSitemap } from './sitemap.ts';

describe('sitemap', () => {
  it('สร้าง URL เต็มจาก origin และตัดรายการซ้ำ', () => {
    const xml = buildSitemap('https://example.com', ['/', '/passport/A1', '/passport/A1', '/products']);
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<loc>https://example.com/passport/A1</loc>');
    expect(xml.match(/passport\/A1</g)).toHaveLength(1);
    expect(xml.startsWith('<?xml')).toBe(true);
  });
  it('escape อักขระพิเศษ', () => {
    expect(buildSitemap('https://example.com', ['/x?a=1&b=2'])).toContain('a=1&amp;b=2');
  });
  it('robots.txt ปิด /admin และ /media และชี้ sitemap', () => {
    const r = buildRobots('http://localhost:4321');
    expect(r).toContain('Disallow: /admin');
    expect(r).toContain('Disallow: /media/');
    expect(r).toContain('Sitemap: http://localhost:4321/sitemap.xml');
  });
});
