import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ICONS } from './icons.ts';

// รายชื่อไอคอนอยู่สองที่ (ตาราง ICONS ใน lib/icons.ts + รายชื่อไฟล์ใน import.meta.glob ของ Icon.astro) — ต้องตรงกันและมีไฟล์จริง
const src = readFileSync('src/components/Icon.astro', 'utf8');
const table = Object.values(ICONS) as string[];
const globbed = (/icons\/\{([^}]+)\}\.svg/.exec(src)?.[1] ?? '').split(',');

describe('Icon.astro', () => {
  it('ทุกไอคอนในตารางถูกโหลด และไม่โหลดไอคอนที่ไม่ได้ใช้', () => {
    expect(new Set(globbed)).toEqual(new Set(table));
  });
  it('ไฟล์ SVG มีอยู่จริงใน lucide-static', () => {
    for (const f of table) expect(existsSync(`node_modules/lucide-static/icons/${f}.svg`), f).toBe(true);
  });
});
