import { describe, expect, it } from 'vitest';
import { errorResponse, etagMatches, jsonResponse } from './http.ts';

describe('etagMatches', () => {
  const etag = '"abc123"';
  it.each([['"abc123"'], ['abc123'], ['W/"abc123"'], ['"x", "abc123"'], ['*'], ['  "abc123"  ']])('ตรงกัน: %s', (h) => expect(etagMatches(h, etag)).toBe(true));
  it.each([[null], [undefined], [''], ['"zzz"'], ['abc1234'], ['"abc12"']])('ไม่ตรง: %s', (h) => expect(etagMatches(h as string, etag)).toBe(false));
});

describe('jsonResponse & errorResponse', () => {
  it('jsonResponse ตั้ง Content-Type พร้อม utf-8 และสถานะถูกต้อง', async () => {
    const res = jsonResponse({ message: 'ทดสอบ' }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await res.json()).toEqual({ message: 'ทดสอบ' });
  });

  it('errorResponse คืน { error } พร้อมสถานะที่ระบุ', async () => {
    const res = errorResponse('เกิดข้อผิดพลาด', 400);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await res.json()).toEqual({ error: 'เกิดข้อผิดพลาด' });
  });
});
