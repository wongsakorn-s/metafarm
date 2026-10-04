import { describe, expect, it } from 'vitest';
import { provinceOf } from './place.ts';

describe('provinceOf', () => {
  it.each([
    ['อ.สายบุรี จ.ปัตตานี', 'ปัตตานี'],
    ['ต. ตะลุบัน อ.สายบุรี จ.ปัตตานี', 'ปัตตานี'],
    ['อ.มายอ  จ.ปัตตานี', 'ปัตตานี'],
    ['อ.เมือง จ.สงขลา', 'สงขลา'],
    ['จ.ภูเก็ต', 'ภูเก็ต'],
    ['พัทลุง', 'พัทลุง'],
    ['ภูเก็ต', 'ภูเก็ต'],
    ['ปัตตานี (ขอนไม้)', 'ปัตตานี'],
    ['นาราธิวาส', 'นราธิวาส'],
  ])('%s → %s', (input, expected) => expect(provinceOf(input)).toBe(expected));

  it.each([[null], [undefined], [''], ['  '], ['อ.สทิงพระ'], ['ต.หนองไร่']])('ไม่มีจังหวัด (%s) → null', (input) => expect(provinceOf(input)).toBeNull());
});
