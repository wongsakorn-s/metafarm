// ส่งออก CSV ให้เปิดใน Excel/Google Sheets ได้ทันที: UTF-8 มี BOM (ภาษาไทยไม่เพี้ยน) · บรรทัดแบบ CRLF
// กันสูตรแฝง (CSV injection): ข้อความที่ขึ้นต้นด้วย = + - @ tab CR จะเติม ' นำหน้า (ตัวเลขไม่แตะ)

export function csvCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'ใช่' : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** ชื่อไฟล์ภาษาไทยได้ (filename* แบบ RFC 5987) พร้อมชื่อสำรองตัวอักษรอังกฤษ */
export function csvResponse(filename: string, body: string, fallback = 'export.csv'): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
