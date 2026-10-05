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
