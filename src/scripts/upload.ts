// ส่งรูปจากเบราว์เซอร์ไปหลังบ้าน + แปลข้อผิดพลาดเป็นข้อความที่เจ้าของฟาร์มเข้าใจ (ภาษาไทย)
// แยก 6 กรณี: สัญญาณหลุด / ส่งนานเกิน / ล็อกอินหมดอายุ / เซิร์ฟเวอร์ขัดข้อง / ผู้ใช้ส่งผิด / เซิร์ฟเวอร์ไม่รับรูป (เช่นเต็มแล้ว)

export type UploadErrorKind = 'network' | 'timeout' | 'session' | 'server' | 'client' | 'rejected';

export class UploadError extends Error {
  constructor(
    public kind: UploadErrorKind,
    public status?: number,
    /** ข้อความจากเซิร์ฟเวอร์ (ภาษาไทย) สำหรับ 'rejected' */
    public detail?: string,
  ) {
    super(`${kind}${status ? ` ${status}` : ''}`);
  }
}

/** ผลที่เซิร์ฟเวอร์ตอบกลับเมื่อขอแบบ JSON (Accept: application/json) */
export interface UploadResult {
  ok: boolean;
  /** สรุปผลภาษาไทย เช่น "เพิ่มแล้ว 2 รูป · ข้าม 1 ไฟล์ (...)" */
  message: string;
  added?: number;
  skipped?: { name: string; reason: string }[];
  /** หน้าที่ควรไปต่อ (ถ้ามี) */
  redirect?: string;
}

/** ข้อความสำหรับแสดงให้ผู้ใช้ (ไม่มีศัพท์เทคนิค) */
export function describeUploadError(err: unknown): string {
  if (err instanceof UploadError) {
    switch (err.kind) {
      case 'network':
        return 'สัญญาณอินเทอร์เน็ตไม่พอ รูปยังไม่ได้ถูกส่ง — ลองใหม่เมื่อสัญญาณดีขึ้น (ส่งซ้ำได้ ระบบไม่บันทึกรูปซ้ำ)';
      case 'timeout':
        return 'ส่งรูปนานเกินไป (สัญญาณอ่อน) — ลองใหม่เมื่อสัญญาณดีขึ้น (ส่งซ้ำได้ ระบบไม่บันทึกรูปซ้ำ)';
      case 'session':
        return 'หมดเวลาการเข้าสู่ระบบ รูปยังไม่ได้ถูกบันทึก — กรุณาล็อกอินใหม่แล้วลองอีกครั้ง';
      case 'server':
        return `ระบบขัดข้องชั่วคราว (${err.status}) รูปยังไม่ได้ถูกบันทึก — ลองใหม่อีกครั้ง`;
      case 'client':
        return err.status === 413 ? 'ไฟล์ใหญ่เกินไป — ลองถ่ายใหม่หรือเลือกรูปที่เล็กกว่านี้' : `ส่งรูปไม่สำเร็จ (${err.status}) — ลองใหม่อีกครั้ง`;
      case 'rejected':
        return `ไม่ได้บันทึกรูป: ${err.detail ?? 'ระบบไม่รับไฟล์นี้'}`;
    }
  }
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) return describeUploadError(new UploadError('timeout'));
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
  if (!res.ok && !res.redirected && res.status !== 422) return new UploadError(res.status >= 500 ? 'server' : 'client', res.status);
  return null;
}

/** ผล JSON → สำเร็จจริงหรือไม่ (เซิร์ฟเวอร์อาจตอบ "ข้ามทุกไฟล์" เช่นช่องรูปเต็ม/ไม่ใช่รูป) */
export function checkResult(r: UploadResult): UploadResult {
  if (!r.ok) throw new UploadError('rejected', 422, r.message);
  return r;
}

/** เวลารอสูงสุด: 30 วินาที + 20 วินาทีต่อ MB (เน็ตในสวนช้า) ไม่เกิน 3 นาที */
export function uploadTimeoutMs(bytes: number): number {
  return Math.min(180_000, 30_000 + Math.ceil(bytes / 1048576) * 20_000);
}

/** ส่งฟอร์ม (multipart) แล้วคืนผลเมื่อสำเร็จจริงเท่านั้น — มีเวลาหมด ไม่ค้างหมุนตลอดไป */
export async function postUpload(url: string, body: FormData, bytes = 0): Promise<UploadResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), uploadTimeoutMs(bytes));
  try {
    const res = await fetch(url, { method: 'POST', body, credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctrl.signal });
    const problem = classifyResponse(res);
    if (problem) throw problem;
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: true, message: '', redirect: res.url };
    return checkResult((await res.json()) as UploadResult);
  } catch (e) {
    if (ctrl.signal.aborted) throw new UploadError('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** รหัสชุดอัปโหลด: ใช้ซ้ำเมื่อกดส่งใหม่ เซิร์ฟเวอร์จะไม่บันทึกรูปเดิมซ้ำ */
export const newBatchId = () => crypto.randomUUID();
