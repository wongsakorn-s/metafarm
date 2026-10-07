import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// drizzle เขียนคอลัมน์ของ query ที่ select จากตารางเดียวแบบไม่มีชื่อตาราง ("id") — ถ้าใส่ ${hives.id} ไว้ใน subquery
// SQLite จะผูก "id" กับตารางใน subquery แทน (เช่น m.id) ได้ผลผิดเงียบ ๆ (เคยทำให้คิวถ่ายรูปนับ 107 แทน 13)
// กฎ: ใน sql`…` ที่อ้างถึงแถวของ query ด้านนอก ให้เขียนชื่อตารางตรง ๆ เช่น hives.id
describe('subquery อ้างคอลัมน์ด้านนอกด้วยชื่อตารางเสมอ', () => {
  for (const f of readdirSync('src/server').filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    it(f, () => {
      const src = readFileSync(`src/server/${f}`, 'utf8');
      const bad = [...src.matchAll(/(?:from|join)\s+\w+\s+\w+\s+(?:on|where)[^`]*?=\s*\$\{(\w+)\.(\w+)\}/g)].map((m) => `\${${m[1]}.${m[2]}}`);
      expect(bad, `ใช้ชื่อตารางตรง ๆ แทน ${bad.join(', ')}`).toEqual([]);
    });
  }
});
