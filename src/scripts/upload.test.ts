import { describe, expect, it } from 'vitest';
import { checkResult, classifyResponse, describeUploadError, UploadError, uploadTimeoutMs } from './upload.ts';

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

describe('ผลอัปโหลดจากเซิร์ฟเวอร์ (JSON)', () => {
  it('422 = เซิร์ฟเวอร์ได้รับแต่ไม่บันทึก → ไม่ใช่ข้อผิดพลาดเครือข่าย ให้อ่านข้อความใน JSON', () => {
    expect(classifyResponse(res({ ok: false, status: 422 }))).toBeNull();
  });
  it('ข้ามทุกไฟล์ (เช่นช่องรูปเต็ม) ห้ามนับว่าสำเร็จ และบอกเหตุผลจากเซิร์ฟเวอร์', () => {
    let caught: unknown;
    try { checkResult({ ok: false, message: 'ข้าม 1 ไฟล์ (IMG_1.heic: ไม่ใช่รูป JPEG/PNG/WebP)' }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(UploadError);
    expect((caught as UploadError).kind).toBe('rejected');
    expect(describeUploadError(caught)).toContain('ไม่ใช่รูป JPEG/PNG/WebP');
    expect(checkResult({ ok: true, message: 'เพิ่มแล้ว 1 รูป', added: 1 }).added).toBe(1);
  });
  it('หมดเวลา: ข้อความภาษาไทย และบอกว่าส่งซ้ำได้ไม่บันทึกซ้ำ', () => {
    for (const e of [new UploadError('timeout'), new DOMException('aborted', 'AbortError')]) {
      const m = describeUploadError(e);
      expect(m).toContain('นานเกินไป');
      expect(m).toContain('ไม่บันทึกรูปซ้ำ');
    }
  });
  it('เวลารอตามขนาดไฟล์ มีเพดาน 3 นาที', () => {
    expect(uploadTimeoutMs(0)).toBe(30_000);
    expect(uploadTimeoutMs(1.5 * 1048576)).toBe(70_000);
    expect(uploadTimeoutMs(100 * 1048576)).toBe(180_000);
  });
});
