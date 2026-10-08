// คิวรอส่ง (Phase 5.5) — ส่วนที่ไม่แตะเบราว์เซอร์ (ทดสอบได้ใน Node)
// บันทึกงานรัง/รูป เก็บลงเครื่องก่อน แล้วส่ง · เน็ตหลุด/ช้า = รอส่งเองทีหลัง · ส่งซ้ำได้ปลอดภัย (คีย์ idem / batch ฝั่งเซิร์ฟเวอร์)

/**
 * ช่องในฟอร์ม: ข้อความ หรือไฟล์ — ไฟล์เก็บเป็น ArrayBuffer + ชื่อ + ชนิด
 * (WebKit/iPhone บางรุ่นเก็บ Blob/File ใน IndexedDB ไม่ได้ — DataCloneError)
 */
export type Field = [name: string, value: string] | [name: string, data: ArrayBuffer, filename: string, type: string];

export type ItemStatus = 'pending' | 'failed' | 'session';

export interface OutboxItem {
  id: string;
  /** รายการของผู้ใช้คนไหน — ส่งได้เฉพาะตอนผู้ใช้คนนั้นล็อกอินอยู่ */
  userId: number;
  userName: string;
  kind: 'record' | 'photo';
  url: string;
  fields: Field[];
  /** คำอธิบายสั้น เช่น "A12 · เก็บน้ำหวาน 300 มล." */
  label: string;
  createdAt: string;
  status: ItemStatus;
  /** เหตุผลที่ส่งไม่ผ่าน (ภาษาไทย) */
  error?: string;
  attempts: number;
  bytes: number;
}

/** ผลการส่งหนึ่งครั้ง */
export type Outcome =
  | { kind: 'done'; redirect?: string; message?: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'session'; message: string }
  | { kind: 'retry'; reason: 'network' | 'timeout' | 'server' }
  /** ส่งไม่ได้ และเก็บลงเครื่องก็ไม่ได้ — ข้อมูลยังอยู่ในฟอร์ม */
  | { kind: 'unsaved' };

export interface ResponseInfo {
  status: number;
  url: string;
  /** body เป็น JSON (เซิร์ฟเวอร์ตอบ Accept: application/json) */
  json: { ok?: boolean; message?: string; redirect?: string } | null;
}

const SESSION_MSG = 'ล็อกอินหมดอายุ — ล็อกอินใหม่แล้วระบบจะส่งต่อให้เอง';

/** แปลผลจากเซิร์ฟเวอร์ → ทำอะไรต่อกับรายการนี้ */
export function outcomeOf(r: ResponseInfo): Outcome {
  let path = '';
  try { path = new URL(r.url).pathname; } catch { /* ignore */ }
  // ล็อกอินหมดอายุ: middleware เด้งไปหน้าล็อกอิน (fetch ตาม redirect แล้วได้ 200)
  if (path.startsWith('/admin/login')) return { kind: 'session', message: SESSION_MSG };
  // ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อน / บัญชีไม่มีสิทธิ์ — ต้องให้คนจัดการ ไม่ลองซ้ำเอง
  if (r.status === 403) return { kind: 'session', message: 'ส่งไม่ได้ (ไม่มีสิทธิ์ หรือต้องเปลี่ยนรหัสผ่านก่อน) — เปิดหน้าบัญชีของฉัน' };
  if (r.status >= 500) return { kind: 'retry', reason: 'server' };
  if (r.json?.ok) return { kind: 'done', redirect: r.json.redirect, message: r.json.message };
  if (r.json && r.json.ok === false) return { kind: 'invalid', message: r.json.message || 'ข้อมูลไม่ถูกต้อง' };
  if (r.status >= 200 && r.status < 300) return { kind: 'invalid', message: 'เซิร์ฟเวอร์ตอบไม่ตรงรูปแบบ — เปิดหน้ารังแล้วบันทึกใหม่' };
  return { kind: 'invalid', message: `ส่งไม่สำเร็จ (${r.status})` };
}

/** fetch ล้มเหลว (ไม่ได้คำตอบเลย) → ลองใหม่ทีหลัง */
export function failureOf(err: unknown, timedOut: boolean): Outcome {
  if (timedOut) return { kind: 'retry', reason: 'timeout' };
  void err;
  return { kind: 'retry', reason: 'network' };
}

/** เวลารอคำตอบ: บันทึกงาน 15 วินาที · รูป 30 วินาที + 20 วินาที/MB (ไม่เกิน 3 นาที) */
export const timeoutFor = (kind: OutboxItem['kind'], bytes: number) =>
  kind === 'record' ? 15_000 : Math.min(180_000, 30_000 + Math.ceil(bytes / 1048576) * 20_000);

/** คำอธิบายรายการบันทึกงานรัง จากชื่อหัวข้อ + ค่าที่กรอก */
export function recordLabel(base: string, fields: Field[]): string {
  const get = (k: string) => {
    const f = fields.find((x) => x[0] === k);
    return f && typeof f[1] === 'string' ? f[1].trim() : '';
  };
  const parts = [base];
  if (get('honeyMl')) parts.push(`${Number(get('honeyMl')).toLocaleString('th-TH')} มล.`);
  if (get('propolisG')) parts.push(`ชัน ${Number(get('propolisG')).toLocaleString('th-TH')} ก.`);
  if (get('queenCells')) parts.push(`${get('queenCells')} ใบ`);
  if (get('targetCode')) parts.push(`→ ${get('targetCode').toUpperCase()}`);
  const status = ({ active: 'ยังอยู่', collapsed: 'ล่ม', sold: 'ขายแล้ว' } as Record<string, string>)[get('status')];
  if (status) parts.push(`→ ${status}`);
  const note = get('note') || get('collapseReason');
  if (note) parts.push(`"${note.length > 30 ? `${note.slice(0, 30)}…` : note}"`);
  return parts.join(' ');
}

/** ข้อความสรุปจำนวนที่รอส่ง (แถบด้านล่าง) */
export function pendingSummary(items: Pick<OutboxItem, 'status'>[]): { count: number; text: string; needsAction: boolean } {
  const waiting = items.filter((i) => i.status === 'pending').length;
  const stuck = items.length - waiting;
  if (items.length === 0) return { count: 0, text: '', needsAction: false };
  const text = [waiting && `รอส่ง ${waiting}`, stuck && `ต้องแก้ ${stuck}`].filter(Boolean).join(' · ');
  return { count: items.length, text, needsAction: stuck > 0 };
}
