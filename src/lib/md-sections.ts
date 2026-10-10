// แบ่งบทความ Markdown (HTML ที่คอมไพล์แล้ว) ตามหัวข้อ ## — แยกจาก content.ts เพื่อให้ทดสอบได้โดยไม่ต้องโหลดไฟล์ .md
/** หัวข้อหลัก (h2) หนึ่งส่วนของบทความ — html = เนื้อหาใต้หัวข้อ (ไม่รวมตัวหัวข้อ) */
export interface MdSection {
  id: string;
  /** ข้อความล้วน (ใช้จับคู่กับ frontmatter `sections`) */
  title: string;
  /** หัวข้อแบบมีตัวเอียง/ตัวหนาตาม Markdown */
  titleHtml: string;
  html: string;
}

/**
 * แบ่งบทความตามหัวข้อ ## — หน้าความรู้ (ชันโรง/น้ำผึ้ง) จัดแต่ละหัวข้อเป็นส่วนของหน้าเอง (มีรูป/กรอบเน้น)
 * เนื้อหายังแก้ใน Markdown ได้ตามเดิม · intro = ข้อความก่อนหัวข้อแรก (ถ้ามี)
 */
export async function sectionsOf(md: { compiledContent(): string | Promise<string> }): Promise<{ intro: string; sections: MdSection[] }> {
  const parts = (await md.compiledContent()).split(/(?=<h2[\s>])/);
  const intro = parts[0]?.startsWith('<h2') ? '' : (parts.shift() ?? '').trim();
  const sections = parts.map((p) => {
    const m = p.match(/^<h2(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/h2>/);
    const titleHtml = m?.[2] ?? '';
    return { id: m?.[1] ?? '', title: titleHtml.replace(/<[^>]+>/g, '').trim(), titleHtml, html: p.slice(m?.[0].length ?? 0).trim() };
  });
  return { intro, sections };
}
