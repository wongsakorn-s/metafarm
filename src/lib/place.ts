// สมุดพกสาธารณะแสดงที่มาของรังที่ซื้อมาแค่ "ระดับจังหวัด" (ไม่เปิดตำบล/อำเภอของผู้ขาย)

// ชื่อที่เจ้าของฟาร์มสะกดเพี้ยนใน Excel → ชื่อที่ถูกต้อง
const ALIASES: Record<string, string> = { นาราธิวาส: 'นราธิวาส' };

/** "ต. ตะลุบัน อ.สายบุรี จ.ปัตตานี" → "ปัตตานี", "พัทลุง" → "พัทลุง", "อ.สทิงพระ" (ไม่มีจังหวัด) → null */
export function provinceOf(place: string | null | undefined): string | null {
  const s = (place ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const m = /จ\.\s*([^\s()]+)/.exec(s);
  const name = m ? m[1]! : /^(อ|ต)\./.test(s) ? null : s.replace(/\(.*?\)/g, '').trim();
  if (!name) return null;
  return ALIASES[name] ?? name;
}
