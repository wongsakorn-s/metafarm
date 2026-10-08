import { describe, expect, it } from 'vitest';
import { failureOf, outcomeOf, pendingSummary, recordLabel, timeoutFor, type Field } from './outbox-core.ts';

const at = (path: string) => `http://localhost:4321${path}`;

describe('outcomeOf', () => {
  it('สำเร็จ → ลบออกจากคิว พร้อมหน้าที่จะไปต่อ', () => {
    expect(outcomeOf({ status: 200, url: at('/admin/hives/A12'), json: { ok: true, message: 'บันทึกแล้ว', redirect: '/admin/hives/A12?saved=honey' } }))
      .toEqual({ kind: 'done', redirect: '/admin/hives/A12?saved=honey', message: 'บันทึกแล้ว' });
  });
  it('ข้อมูลผิด (422) → ค้างในคิวพร้อมเหตุผล ไม่ลองซ้ำเอง', () => {
    expect(outcomeOf({ status: 422, url: at('/admin/hives/A12'), json: { ok: false, message: 'ไม่พบรัง A99999' } })).toEqual({ kind: 'invalid', message: 'ไม่พบรัง A99999' });
  });
  it('ล็อกอินหมดอายุ (เด้งไปหน้าล็อกอิน) / 403 → รอคนจัดการ', () => {
    expect(outcomeOf({ status: 200, url: at('/admin/login?next=%2Fadmin'), json: null }).kind).toBe('session');
    expect(outcomeOf({ status: 403, url: at('/admin/hives/A12'), json: null }).kind).toBe('session');
  });
  it('เซิร์ฟเวอร์ขัดข้อง → ลองใหม่ทีหลัง', () => {
    expect(outcomeOf({ status: 503, url: at('/admin/hives/A12'), json: null })).toEqual({ kind: 'retry', reason: 'server' });
  });
  it('ตอบไม่ใช่ JSON → ถือว่าผิด (ไม่ลบเงียบ ๆ)', () => {
    expect(outcomeOf({ status: 200, url: at('/admin/hives/A12'), json: null }).kind).toBe('invalid');
    expect(outcomeOf({ status: 404, url: at('/admin/hives/A1'), json: null })).toEqual({ kind: 'invalid', message: 'ส่งไม่สำเร็จ (404)' });
  });
  it('ไม่ได้คำตอบ → ลองใหม่', () => {
    expect(failureOf(new TypeError('Failed to fetch'), false)).toEqual({ kind: 'retry', reason: 'network' });
    expect(failureOf(new DOMException('x', 'AbortError'), true)).toEqual({ kind: 'retry', reason: 'timeout' });
  });
});

describe('timeoutFor', () => {
  it('บันทึกงาน 15 วิ · รูปตามขนาด ไม่เกิน 3 นาที', () => {
    expect(timeoutFor('record', 0)).toBe(15_000);
    expect(timeoutFor('photo', 2 * 1048576)).toBe(70_000);
    expect(timeoutFor('photo', 50 * 1048576)).toBe(180_000);
  });
});

describe('recordLabel', () => {
  it('สรุปค่าที่กรอก', () => {
    const f: Field[] = [['intent', 'honey'], ['honeyMl', '1200'], ['propolisG', ''], ['note', 'ฝนตกเมื่อวาน']];
    expect(recordLabel('A12 · เก็บน้ำหวาน', f)).toBe('A12 · เก็บน้ำหวาน 1,200 มล. "ฝนตกเมื่อวาน"');
    expect(recordLabel('A5 · แยกรัง', [['targetCode', 'a150']])).toBe('A5 · แยกรัง → A150');
    expect(recordLabel('A5 · เปลี่ยนสถานะ', [['status', 'collapsed'], ['collapseReason', 'มดกิน']])).toBe('A5 · เปลี่ยนสถานะ → ล่ม "มดกิน"');
    expect(recordLabel('A5 · หมายเหตุ', [['note', 'ก'.repeat(40)]])).toBe(`A5 · หมายเหตุ "${'ก'.repeat(30)}…"`);
  });
});

describe('pendingSummary', () => {
  it('แยกรอส่งกับต้องแก้', () => {
    expect(pendingSummary([])).toEqual({ count: 0, text: '', needsAction: false });
    expect(pendingSummary([{ status: 'pending' }, { status: 'pending' }])).toEqual({ count: 2, text: 'รอส่ง 2', needsAction: false });
    expect(pendingSummary([{ status: 'pending' }, { status: 'failed' }, { status: 'session' }])).toEqual({ count: 3, text: 'รอส่ง 1 · ต้องแก้ 2', needsAction: true });
  });
});
