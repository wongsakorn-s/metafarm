/** เทียบ If-None-Match กับ ETag: ไม่สนเครื่องหมายคำพูดและ W/ (dev server บางตัวตัดเครื่องหมายคำพูดทิ้ง), รับหลายค่าและ "*" */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (s: string) => s.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  const want = bare(etag);
  return ifNoneMatch.split(',').some((v) => v.trim() === '*' || bare(v) === want);
}

/** คำขอจากสคริปต์อัปโหลด (fetch) ขอผลเป็น JSON — ฟอร์มธรรมดา (ไม่มี JS) ยังได้หน้าเว็บ/redirect ตามเดิม */
export function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

/** ตอบผลอัปโหลดเป็น JSON: ok=false ใช้สถานะ 422 (เซิร์ฟเวอร์ได้รับแล้วแต่ไม่บันทึก เช่นช่องรูปเต็ม) */
export function jsonResult(body: { ok: boolean; message: string; [k: string]: unknown }): Response {
  return new Response(JSON.stringify(body), { status: body.ok ? 200 : 422, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

/** ตอบกลับข้อมูลเป็น JSON พร้อมตั้งค่า Content-Type และ UTF-8 */
export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** ตอบกลับข้อผิดพลาดเป็น JSON ในรูปแบบ { error: message } */
export const errorResponse = (message: string, status: number): Response =>
  jsonResponse({ error: message }, status);

/** คำขอเขียนที่ไม่ใช่ฟอร์ม (เช่น PUT ไฟล์ใหญ่) ไม่ผ่านการตรวจ Origin ของ Astro — ตรวจเองว่ามาจากหน้าเว็บเราเอง (กัน CSRF) */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}
