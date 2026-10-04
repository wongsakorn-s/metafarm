import { describe, expect, it } from 'vitest';
import { etagMatches } from './http.ts';

describe('etagMatches', () => {
  const etag = '"abc123"';
  it.each([['"abc123"'], ['abc123'], ['W/"abc123"'], ['"x", "abc123"'], ['*'], ['  "abc123"  ']])('ตรงกัน: %s', (h) => expect(etagMatches(h, etag)).toBe(true));
  it.each([[null], [undefined], [''], ['"zzz"'], ['abc1234'], ['"abc12"']])('ไม่ตรง: %s', (h) => expect(etagMatches(h as string, etag)).toBe(false));
});
