import { describe, expect, it } from 'vitest';
import { afterSend, backoffMs, failureOf, isDue, MAX_SERVER_ERRORS, outcomeOf, pendingSummary, recordLabel, resetForRetry, sendOrder, stopsRun, timeoutFor, type Field, type OutboxItem } from './outbox-core.ts';

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

describe('outcomeOf: กรณีสัญญาณไม่ดี', () => {
  it('คำตอบขาดกลางทาง (JSON อ่านไม่ครบ) → ส่งซ้ำ ไม่นับเป็นข้อมูลผิด', () => {
    expect(outcomeOf({ status: 200, url: at('/admin/hives/A12'), json: null, broken: true })).toEqual({ kind: 'retry', reason: 'network' });
  });
  it('เซิร์ฟเวอร์ยุ่ง/ขอให้ช้าลง (408 · 425 · 429) → ลองใหม่ทีหลัง', () => {
    for (const status of [408, 425, 429]) expect(outcomeOf({ status, url: at('/admin/hives/A12'), json: null })).toEqual({ kind: 'retry', reason: 'server' });
  });
  it('บอกว่าต้องทำอะไร: ล็อกอินใหม่ หรือเปิดหน้าบัญชี (403)', () => {
    expect(outcomeOf({ status: 200, url: at('/admin/login'), json: null })).toMatchObject({ kind: 'session', fix: 'login' });
    expect(outcomeOf({ status: 403, url: at('/admin/hives/A12'), json: null })).toMatchObject({ kind: 'session', fix: 'account' });
  });
  it('หลุดหลังส่งไปนาน = เสียเน็ตแล้ว (นับเหมือนหมดเวลา) · หลุดทันที = ไม่มีสัญญาณ', () => {
    expect(failureOf(new TypeError('x'), false, 200)).toEqual({ kind: 'retry', reason: 'network' });
    expect(failureOf(new TypeError('x'), false, 40_000)).toEqual({ kind: 'retry', reason: 'timeout' });
  });
});

describe('afterSend: ทำอะไรต่อกับรายการ', () => {
  const NOW = 1_000_000;
  const item = (kind: OutboxItem['kind'], extra: Partial<OutboxItem> = {}): OutboxItem => ({ id: '1', userId: 1, userName: 'ก', kind, url: '/admin/hives/A1', fields: [], label: 'A1', createdAt: '2026-10-10T01:00:00Z', status: 'pending', attempts: 0, bytes: 0, ...extra });

  it('ส่งแล้ว = ลบ · ข้อมูลผิด = ต้องแก้ · ล็อกอินหมดอายุ = รอพร้อมบอกวิธีแก้', () => {
    expect(afterSend(item('record'), { kind: 'done' }, NOW)).toBeNull();
    expect(afterSend(item('record'), { kind: 'invalid', message: 'ผิด' }, NOW)).toMatchObject({ status: 'failed', error: 'ผิด', attempts: 1 });
    expect(afterSend(item('record'), { kind: 'session', message: 'x', fix: 'account' }, NOW)).toMatchObject({ status: 'session', fix: 'account' });
  });
  it('บันทึกงานหมดเวลา / เน็ตหลุดทันที → ลองรอบหน้าได้เลย (ไม่เว้นระยะ)', () => {
    expect(afterSend(item('record'), { kind: 'retry', reason: 'timeout' }, NOW)?.nextAt).toBeUndefined();
    expect(afterSend(item('photo'), { kind: 'retry', reason: 'network' }, NOW)?.nextAt).toBeUndefined();
  });
  it('รูปหมดเวลา → เว้นระยะเพิ่มขึ้นเรื่อย ๆ (ไม่อัปโหลดซ้ำทุก 30 วินาที)', () => {
    let it1 = item('photo');
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      it1 = afterSend(it1, { kind: 'retry', reason: 'timeout' }, NOW)!;
      waits.push((it1.nextAt! - NOW) / 1000);
    }
    expect(waits).toEqual([30, 60, 120, 240, 480, 600, 600]);
    expect(it1.status).toBe('pending');
    expect(backoffMs(0)).toBe(0);
  });
  it(`เซิร์ฟเวอร์ขัดข้องกับรายการเดิม ${MAX_SERVER_ERRORS} ครั้ง → เลิกลองเอง ให้คนดู · กดส่งอีกครั้งแล้วเริ่มนับใหม่`, () => {
    let it1 = item('record');
    for (let i = 0; i < MAX_SERVER_ERRORS - 1; i++) it1 = afterSend(it1, { kind: 'retry', reason: 'server' }, NOW)!;
    expect(it1.status).toBe('pending');
    it1 = afterSend(it1, { kind: 'retry', reason: 'server' }, NOW)!;
    expect(it1).toMatchObject({ status: 'failed', error: expect.stringContaining('ขัดข้อง') });
    expect(resetForRetry(it1)).toMatchObject({ status: 'pending', serverErrors: 0, slow: 0, nextAt: undefined, error: undefined });
  });
});

describe('ลำดับและจังหวะการส่ง', () => {
  it('บันทึกงานก่อนรูป แล้วตามเวลา', () => {
    const list = [
      { id: 'p1', kind: 'photo' as const, createdAt: '2026-10-10T01:00:00Z' },
      { id: 'r2', kind: 'record' as const, createdAt: '2026-10-10T01:05:00Z' },
      { id: 'r1', kind: 'record' as const, createdAt: '2026-10-10T01:01:00Z' },
      { id: 'p0', kind: 'photo' as const, createdAt: '2026-10-10T00:59:00Z' },
    ];
    expect(sendOrder(list).map((x) => x.id)).toEqual(['r1', 'r2', 'p0', 'p1']);
  });
  it('รอเว้นระยะ เว้นแต่ผู้ใช้กดส่ง/สัญญาณเพิ่งกลับมา', () => {
    expect(isDue({}, 100, false)).toBe(true);
    expect(isDue({ nextAt: 200 }, 100, false)).toBe(false);
    expect(isDue({ nextAt: 200 }, 100, true)).toBe(true);
    expect(isDue({ nextAt: 200 }, 200, false)).toBe(true);
  });
  it('หยุดรอบเมื่อเน็ตไม่ดี/ล็อกอินหมดอายุ · เซิร์ฟเวอร์ขัดข้องกับรายการเดียวไม่ขวางรายการอื่น', () => {
    expect(stopsRun({ kind: 'retry', reason: 'network' })).toBe(true);
    expect(stopsRun({ kind: 'retry', reason: 'timeout' })).toBe(true);
    expect(stopsRun({ kind: 'session', message: '', fix: 'login' })).toBe(true);
    expect(stopsRun({ kind: 'retry', reason: 'server' })).toBe(false);
    expect(stopsRun({ kind: 'invalid', message: '' })).toBe(false);
    expect(stopsRun({ kind: 'done' })).toBe(false);
  });
});
