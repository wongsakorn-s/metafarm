// แบ่งบทความตามหัวข้อ ## (หน้าชันโรงขนเงิน / น้ำผึ้งชันโรง จัดแต่ละหัวข้อเป็นส่วนของหน้า)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sectionsOf } from './md-sections.ts';

describe('sectionsOf', () => {
  it('แยกข้อความก่อนหัวข้อแรก + หัวข้อ (ข้อความล้วน/มีตัวเอียง) + เนื้อหาใต้หัวข้อ', async () => {
    const r = await sectionsOf({ compiledContent: async () => '<p>นำ</p>\n<h2 id="a">ก</h2>\n<p>หนึ่ง</p>\n<h2 id="b">ข (<em>Tetragonula</em>)</h2>\n<ul><li>สอง</li></ul>' });
    expect(r.intro).toBe('<p>นำ</p>');
    expect(r.sections).toEqual([
      { id: 'a', title: 'ก', titleHtml: 'ก', html: '<p>หนึ่ง</p>' },
      { id: 'b', title: 'ข (Tetragonula)', titleHtml: 'ข (<em>Tetragonula</em>)', html: '<ul><li>สอง</li></ul>' },
    ]);
  });
});

// แก้หัวข้อใน Markdown แล้ว frontmatter `sections` ไม่ตรง → รูป/กรอบของหัวข้อนั้นหายเงียบ ๆ จึงตรวจไว้
describe('frontmatter sections ของหน้าความรู้จับคู่กับหัวข้อ ## ได้ครบ', () => {
  for (const slug of ['stingless-bee', 'honey']) {
    it(slug, () => {
      const src = readFileSync(`content/pages/${slug}.md`, 'utf8');
      const titles = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.replace(/[*_]/g, '').trim());
      const headings = [...src.matchAll(/^\s+- heading: (.+)$/gm)].map((m) => m[1]!.trim());
      expect(headings.length).toBeGreaterThan(0);
      for (const h of headings) expect(titles.some((t) => t.startsWith(h)), `"${h}"`).toBe(true);
    });
  }
});
