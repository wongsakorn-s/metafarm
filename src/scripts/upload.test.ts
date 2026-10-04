import { describe, expect, it } from 'vitest';
import { classifyResponse, describeUploadError, UploadError } from './upload.ts';

const res = (o: Partial<{ ok: boolean; redirected: boolean; status: number; url: string }>) => ({ ok: true, redirected: false, status: 200, url: 'http://x/admin/photos', ...o });

describe('classifyResponse', () => {
  it('สำเร็จปกติ และสำเร็จหลังถูก redirect ไปหน้ารัง/คิว', () => {
    expect(classifyResponse(res({}))).toBeNull();
    expect(classifyResponse(res({ redirected: true, url: 'http://x/admin/hives/A25/media?msg=ok' }))).toBeNull();
  });
  it('ถูกเด้งไปหน้าล็อกอิน (ตอบ 200) = ล็อกอินหมดอายุ ห้ามนับว่าสำเร็จ', () => {
    const e = classifyResponse(res({ redirected: true, url: 'http://x/admin/login?next=%2Fadmin%2Fphotos' }));
    expect(e).toBeInstanceOf(UploadError);
    expect(e?.kind).toBe('session');
  });
  it('5xx = ระบบขัดข้อง, 4xx = ผู้ใช้ส่งผิด', () => {
    expect(classifyResponse(res({ ok: false, status: 503 }))?.kind).toBe('server');
    expect(classifyResponse(res({ ok: false, status: 413 }))?.kind).toBe('client');
    expect(classifyResponse(res({ ok: false, status: 403 }))?.kind).toBe('client');
  });
});

describe('describeUploadError', () => {
  it('ข้อความภาษาไทยที่ไม่มีศัพท์เทคนิค และบอกว่ารูปยังไม่ถูกบันทึก', () => {
    for (const e of [new UploadError('network'), new UploadError('session'), new UploadError('server', 502), new TypeError('Failed to fetch'), new Error('Load failed')]) {
      const m = describeUploadError(e);
      expect(m).toMatch(/[฀-๿]/);
      expect(m).not.toMatch(/fetch|TypeError|Load failed|undefined/i);
    }
    expect(describeUploadError(new UploadError('network'))).toContain('สัญญาณ');
    expect(describeUploadError(new UploadError('session'))).toContain('ล็อกอินใหม่');
    expect(describeUploadError(new UploadError('server', 502))).toContain('502');
    expect(describeUploadError(new UploadError('client', 413))).toContain('ใหญ่เกินไป');
  });
  it('เครือข่ายล้มเหลวทุกเบราว์เซอร์ (Chrome/Safari/Firefox) ได้ข้อความเดียวกัน', () => {
    const net = describeUploadError(new UploadError('network'));
    expect(describeUploadError(new TypeError('Failed to fetch'))).toBe(net);
    expect(describeUploadError(new TypeError('Load failed'))).toBe(net);
    expect(describeUploadError(new Error('NetworkError when attempting to fetch resource.'))).toBe(net);
  });
  it('ไม่ทราบสาเหตุ → ข้อความกลาง ๆ ไม่ใช่ข้อความดิบของเครื่อง', () => {
    expect(describeUploadError(new Error('boom'))).toBe('ส่งรูปไม่สำเร็จ ไม่ทราบสาเหตุ — ลองใหม่อีกครั้ง');
    expect(describeUploadError('x')).toContain('ไม่ทราบสาเหตุ');
  });
});
