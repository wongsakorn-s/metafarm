import { describe, expect, it } from 'vitest';
import { CSP, securityHeaders } from './security-headers.ts';

describe('securityHeaders', () => {
  it('dev: ไม่ใส่ CSP/HSTS (dev server ใช้ websocket ของตัวเอง)', () => {
    const h = securityHeaders({ prod: false, https: false });
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(h['Strict-Transport-Security']).toBeUndefined();
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });
  it('production + https: มี CSP และ HSTS', () => {
    const h = securityHeaders({ prod: true, https: true });
    expect(h['Content-Security-Policy']).toBe(CSP);
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/);
  });
  it('production บน http (เช่น preview ในเครื่อง): มี CSP แต่ไม่มี HSTS', () => {
    const h = securityHeaders({ prod: true, https: false });
    expect(h['Content-Security-Policy']).toBeDefined();
    expect(h['Strict-Transport-Security']).toBeUndefined();
  });
  it('CSP: ปิดทุกอย่างที่ไม่จำเป็น และอนุญาตเฉพาะ YouTube nocookie ในเฟรม', () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("form-action 'self'");
    expect(CSP).toContain('frame-src https://www.youtube-nocookie.com');
    expect(CSP).not.toMatch(/\*|https?:\/\/(?!www\.youtube-nocookie\.com)/); // ไม่มี wildcard หรือโดเมนอื่น
  });
});
