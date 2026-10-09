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
  /** ต้องทำอะไรก่อนส่งต่อได้ (สถานะ session): ล็อกอินใหม่ หรือเปิดหน้าบัญชี (เปลี่ยนรหัสผ่านชั่วคราว) */
  fix?: 'login' | 'account';
  /** ส่งแล้วเสียเวลา/เน็ตแต่ไม่ผ่าน (รูปหมดเวลา, เซิร์ฟเวอร์ขัดข้อง) กี่ครั้ง — ใช้เว้นระยะการลองเอง */
  slow?: number;
  /** เซิร์ฟเวอร์ขัดข้องกับรายการนี้กี่ครั้ง */
  serverErrors?: number;
  /** ไม่ลองเองก่อนเวลานี้ (ms) — กด "ส่งตอนนี้" หรือสัญญาณเพิ่งกลับมา ส่งได้เลย */
  nextAt?: number;
}

/** ผลการส่งหนึ่งครั้ง */
export type Outcome =
  | { kind: 'done'; redirect?: string; message?: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'session'; message: string; fix: 'login' | 'account' }
  | { kind: 'retry'; reason: 'network' | 'timeout' | 'server' }
  /** ส่งไม่ได้ และเก็บลงเครื่องก็ไม่ได้ — ข้อมูลยังอยู่ในฟอร์ม */
  | { kind: 'unsaved' };

export interface ResponseInfo {
  status: number;
  url: string;
  /** body เป็น JSON (เซิร์ฟเวอร์ตอบ Accept: application/json) */
  json: { ok?: boolean; message?: string; redirect?: string } | null;
  /** บอกว่าเป็น JSON แต่อ่านไม่ครบ (สัญญาณหลุดกลางคำตอบ / หมดเวลาระหว่างอ่าน) */
  broken?: boolean;
}

const SESSION_MSG = 'ล็อกอินหมดอายุ — ล็อกอินใหม่แล้วระบบจะส่งต่อให้เอง';

/** แปลผลจากเซิร์ฟเวอร์ → ทำอะไรต่อกับรายการนี้ */
export function outcomeOf(r: ResponseInfo): Outcome {
  let path = '';
  try { path = new URL(r.url).pathname; } catch { /* ignore */ }
  // ล็อกอินหมดอายุ: middleware เด้งไปหน้าล็อกอิน (fetch ตาม redirect แล้วได้ 200)
  if (path.startsWith('/admin/login')) return { kind: 'session', message: SESSION_MSG, fix: 'login' };
  // ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อน / บัญชีไม่มีสิทธิ์ — ต้องให้คนจัดการ ไม่ลองซ้ำเอง
  if (r.status === 403) return { kind: 'session', message: 'ส่งไม่ได้ (ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อน หรือบัญชีไม่มีสิทธิ์) — เปิดหน้าบัญชีของฉัน', fix: 'account' };
  // คำตอบขาดกลางทาง: เซิร์ฟเวอร์อาจบันทึกแล้ว — ส่งซ้ำได้ปลอดภัย (เดิมนับเป็น "ข้อมูลผิด" แล้วรายการค้างเป็นต้องแก้ทั้งที่บันทึกแล้ว)
  if (r.broken) return { kind: 'retry', reason: 'network' };
  // เซิร์ฟเวอร์ขัดข้อง/ยุ่ง/ขอให้ช้าลง → ลองใหม่ทีหลัง
  if (r.status >= 500 || [408, 425, 429].includes(r.status)) return { kind: 'retry', reason: 'server' };
  if (r.json?.ok) return { kind: 'done', redirect: r.json.redirect, message: r.json.message };
  if (r.json && r.json.ok === false) return { kind: 'invalid', message: r.json.message || 'ข้อมูลไม่ถูกต้อง' };
  if (r.status >= 200 && r.status < 300) return { kind: 'invalid', message: 'เซิร์ฟเวอร์ตอบไม่ตรงรูปแบบ — เปิดหน้ารังแล้วบันทึกใหม่' };
  return { kind: 'invalid', message: `ส่งไม่สำเร็จ (${r.status})` };
}

/** หลุดหลังส่งไปนานเท่านี้ = เสียเน็ตไปแล้ว (นับเหมือนหมดเวลา) · หลุดทันที = ไม่มีสัญญาณ ไม่เสียอะไร */
export const SLOW_FAIL_MS = 5_000;

/** fetch ล้มเหลว (ไม่ได้คำตอบเลย) → ลองใหม่ทีหลัง */
export function failureOf(err: unknown, timedOut: boolean, elapsedMs = 0): Outcome {
  if (timedOut || elapsedMs >= SLOW_FAIL_MS) return { kind: 'retry', reason: 'timeout' };
  void err;
  return { kind: 'retry', reason: 'network' };
}

/** เว้นระยะก่อนลองเองครั้งถัดไป หลังส่งแล้วไม่ผ่านแบบเสียเน็ต n ครั้งติด: 30 วิ → 1 → 2 → 4 → 8 → 10 นาที */
export const backoffMs = (n: number) => (n <= 0 ? 0 : Math.min(600_000, 30_000 * 2 ** (n - 1)));
/** เซิร์ฟเวอร์ขัดข้องกับรายการเดิมครบเท่านี้ = น่าจะเป็นปัญหาของรายการนี้ (ไม่ใช่สัญญาณ) → เลิกลองเอง ให้คนดู */
export const MAX_SERVER_ERRORS = 8;
export const SERVER_FAILED_MSG = 'เซิร์ฟเวอร์ขัดข้องกับรายการนี้หลายครั้ง — กด "ส่งอีกครั้ง" ภายหลัง ถ้ายังไม่ผ่านให้แจ้งผู้ดูแลระบบ';

/**
 * ผลการส่ง → รายการหลังส่ง (null = ส่งแล้ว ลบออกจากคิว)
 * เว้นระยะเฉพาะครั้งที่เสียเน็ต/ภาระเซิร์ฟเวอร์: รูปที่หมดเวลา และเซิร์ฟเวอร์ขัดข้อง
 * บันทึกงาน (เล็กมาก) และเน็ตหลุดทันที ลองรอบหน้าได้เลย — ส่งขึ้นเร็วที่สุดเมื่อสัญญาณกลับ
 */
export function afterSend(item: OutboxItem, o: Outcome, now: number): OutboxItem | null {
  const attempts = item.attempts + 1;
  if (o.kind === 'done') return null;
  if (o.kind === 'invalid') return { ...item, attempts, status: 'failed', error: o.message, nextAt: undefined };
  if (o.kind === 'session') return { ...item, attempts, status: 'session', error: o.message, fix: o.fix, nextAt: undefined };
  if (o.kind !== 'retry') return item;
  const costly = o.reason === 'server' || (o.reason === 'timeout' && item.kind === 'photo');
  if (!costly) return { ...item, attempts, status: 'pending', error: undefined, nextAt: undefined };
  const slow = (item.slow ?? 0) + 1;
  const serverErrors = (item.serverErrors ?? 0) + (o.reason === 'server' ? 1 : 0);
  if (serverErrors >= MAX_SERVER_ERRORS) return { ...item, attempts, slow, serverErrors, status: 'failed', error: SERVER_FAILED_MSG, nextAt: undefined };
  return { ...item, attempts, slow, serverErrors, status: 'pending', error: undefined, nextAt: now + backoffMs(slow) };
}

/** ผู้ใช้กด "ส่งอีกครั้ง": เริ่มนับใหม่ */
export const resetForRetry = (item: OutboxItem): OutboxItem => ({ ...item, status: 'pending', error: undefined, fix: undefined, slow: 0, serverErrors: 0, nextAt: undefined });

/** ลำดับส่ง: บันทึกงานก่อนรูป (เล็กและสำคัญกว่า — รูปใหญ่ที่ส่งไม่ผ่านไม่ขวางบันทึก) แล้วตามเวลาที่บันทึก */
export const sendOrder = <T extends Pick<OutboxItem, 'kind' | 'createdAt'>>(items: T[]): T[] =>
  [...items].sort((a, b) => (a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'record' ? -1 : 1));

/** ถึงเวลาลองเองหรือยัง — force: ผู้ใช้กดส่ง / สัญญาณเพิ่งกลับมา */
export const isDue = (item: Pick<OutboxItem, 'nextAt'>, now: number, force: boolean) => force || !item.nextAt || item.nextAt <= now;

/** หยุดรอบนี้ไหม: เน็ตหลุด/ช้า/ล็อกอินหมดอายุ = รายการถัดไปก็ไม่ผ่าน · เซิร์ฟเวอร์ขัดข้องกับรายการเดียว = ส่งรายการอื่นต่อ */
export const stopsRun = (o: Outcome) => o.kind === 'session' || (o.kind === 'retry' && o.reason !== 'server');

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
