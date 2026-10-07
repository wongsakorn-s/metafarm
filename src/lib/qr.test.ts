import { describe, expect, it } from 'vitest';
import { qrSvg } from './qr.ts';

describe('qrSvg', () => {
  it('สร้าง SVG ที่มี viewBox และพื้นขาว (สแกนได้บนฉลาก)', () => {
    const s = qrSvg('https://example.com/lot/H2569-10-1');
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toMatch(/viewBox="0 0 (\d+) \1"/);
    expect(s).toContain('fill="#fff"');
    expect(s.match(/h1v1h-1z/g)!.length).toBeGreaterThan(100);
  });
  it('ป้ายกำกับไม่หลุดเครื่องหมายคำพูด', () => {
    expect(qrSvg('x', 'a"b')).toContain('aria-label="ab"');
  });
});
