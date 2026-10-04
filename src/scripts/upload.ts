// ส่งรูปจากเบราว์เซอร์ไปหลังบ้าน + แปลข้อผิดพลาดเป็นข้อความที่เจ้าของฟาร์มเข้าใจ (ภาษาไทย)
// แยก 4 กรณี: สัญญาณหลุด / ล็อกอินหมดอายุ / เซิร์ฟเวอร์ขัดข้อง / ผู้ใช้ส่งผิด

export type UploadErrorKind = 'network' | 'session' | 'server' | 'client';

export class UploadError extends Error {
  constructor(
    public kind: UploadErrorKind,
    public status?: number,
  ) {
    super(`${kind}${status ? ` ${status}` : ''}`);
  }
}

/** ข้อความสำหรับแสดงให้ผู้ใช้ (ไม่มีศัพท์เทคนิค) */
export function describeUploadError(err: unknown): string {
  if (err instanceof UploadError) {
    switch (err.kind) {
      case 'network':
        return 'สัญญาณอินเทอร์เน็ตไม่พอ รูปยังไม่ได้ถูกส่ง — ลองใหม่เมื่อสัญญาณดีขึ้น';
      case 'session':
        return 'หมดเวลาการเข้าสู่ระบบ รูปยังไม่ได้ถูกบันทึก — กรุณาล็อกอินใหม่แล้วลองอีกครั้ง';
      case 'server':
        return `ระบบขัดข้องชั่วคราว (${err.status}) รูปยังไม่ได้ถูกบันทึก — ลองใหม่อีกครั้ง`;
      case 'client':
        return err.status === 413 ? 'ไฟล์ใหญ่เกินไป — ลองถ่ายใหม่หรือเลือกรูปที่เล็กกว่านี้' : `ส่งรูปไม่สำเร็จ (${err.status}) — ลองใหม่อีกครั้ง`;
    }
  }
  // fetch ที่ล้มเหลวเพราะเครือข่าย: Chrome/Edge "Failed to fetch", Safari "Load failed", Firefox "NetworkError…"
  if (err instanceof TypeError || (err instanceof Error && /failed to fetch|load failed|networkerror|network request failed/i.test(err.message))) {
    return describeUploadError(new UploadError('network'));
  }
  return 'ส่งรูปไม่สำเร็จ ไม่ทราบสาเหตุ — ลองใหม่อีกครั้ง';
}

/** ผลของคำขอ → ผิดพลาดหรือไม่ (แยกออกมาเพื่อทดสอบได้โดยไม่ต้องมีเครือข่าย) */
export function classifyResponse(res: { ok: boolean; redirected: boolean; status: number; url: string }): UploadError | null {
  // ล็อกอินหมดอายุ: เซิร์ฟเวอร์เด้งไปหน้าล็อกอิน (ตอบ 200) — ห้ามนับเป็นสำเร็จ
  let path = '';
  try { path = new URL(res.url).pathname; } catch { /* ignore */ }
  if (path.startsWith('/admin/login')) return new UploadError('session', res.status);
  if (!res.ok && !res.redirected) return new UploadError(res.status >= 500 ? 'server' : 'client', res.status);
  return null;
}

/** ส่งฟอร์ม (multipart) และคืน Response เมื่อสำเร็จจริงเท่านั้น */
export async function postUpload(url: string, body: FormData): Promise<Response> {
  const res = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
  const problem = classifyResponse(res);
  if (problem) throw problem;
  return res;
}
