// คิวรอส่ง (Phase 5.5) — ฝั่งเบราว์เซอร์: เก็บใน IndexedDB · ส่งทันที · เน็ตหลุด/ช้า = รอส่งเอง
// ใช้กับฟอร์มบันทึกงานรัง (<form data-outbox="A12 · เก็บน้ำหวาน">) และรูป (sendOrQueue จากสคริปต์หน้าเพจ)
// ส่งซ้ำปลอดภัย: บันทึกงานมีคีย์ idem · รูปมีรหัสชุด batch — เซิร์ฟเวอร์ไม่บันทึกซ้ำ
// ส่งเมื่อ: เปิดหน้า · กลับมาออนไลน์ · สลับกลับมาที่แอป · ทุก 30 วินาทีระหว่างที่ยังมีรายการ (ไม่ใช้ service worker — ทำงานเหมือนกันทั้ง Android และ iPhone)
import { failureOf, outcomeOf, pendingSummary, recordLabel, timeoutFor, type Field, type OutboxItem, type Outcome, type ResponseInfo } from './outbox-core';

const DB_NAME = 'metafarm-outbox';
const STORE = 'items';

// เปิดฐานข้อมูลครั้งเดียวแล้วใช้ซ้ำ (WebKit/iPhone ค้างเมื่อเปิด-ปิดการเชื่อมต่อถี่ ๆ)
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => {
      const db = req.result;
      // ปิดเอง (เช่นเบราว์เซอร์ล้างข้อมูล) → เปิดใหม่ครั้งหน้า
      db.onclose = () => (dbPromise = null);
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const listItems = async () => ((await run('readonly', (s) => s.getAll())) as OutboxItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const save = (item: OutboxItem) => run('readwrite', (s) => s.put(item));
export const removeItem = (id: string) => run('readwrite', (s) => s.delete(id)).then(notify);

/** ผู้ใช้ที่ล็อกอินอยู่ (AdminLayout ใส่ไว้ที่ body) */
export const currentUser = () => ({ id: Number(document.body.dataset.userId), name: document.body.dataset.userName ?? '' });

/** ฟอร์ม → ช่องที่เก็บลงเครื่องได้ (ไฟล์อ่านเป็น ArrayBuffer) */
export async function fieldsOf(fd: FormData): Promise<Field[]> {
  const out: Field[] = [];
  for (const [k, v] of fd) {
    if (typeof v === 'string') out.push([k, v]);
    else out.push([k, await (v as File).arrayBuffer(), (v as File).name || 'file', (v as File).type || 'application/octet-stream']);
  }
  return out;
}
function formDataOf(fields: Field[]): FormData {
  const fd = new FormData();
  for (const f of fields) if (f.length === 4) fd.append(f[0], new Blob([f[1]], { type: f[3] }), f[2]); else fd.append(f[0], f[1]);
  return fd;
}

/** ส่งหนึ่งรายการ (มีเวลาหมด ไม่ค้างหมุน) */
async function send(item: OutboxItem): Promise<Outcome> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutFor(item.kind, item.bytes));
  try {
    const res = await fetch(item.url, { method: 'POST', body: formDataOf(item.fields), credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctrl.signal });
    const json = (res.headers.get('content-type') ?? '').includes('application/json') ? ((await res.json().catch(() => null)) as ResponseInfo['json']) : null;
    return outcomeOf({ status: res.status, url: res.url, json });
  } catch (e) {
    return failureOf(e, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

/** กันส่งรายการเดียวกันพร้อมกัน (หลายแท็บ / กดส่งระหว่างที่ส่งเบื้องหลัง) — ซ้ำก็ไม่เสียหายแต่เปลืองเน็ต */
const inFlight = new Set<string>();
const withLock = <T,>(fn: () => Promise<T>): Promise<T> =>
  navigator.locks ? (navigator.locks.request('metafarm-outbox', fn) as Promise<T>) : fn();

async function apply(item: OutboxItem, o: Outcome): Promise<void> {
  if (o.kind === 'done') await run('readwrite', (s) => s.delete(item.id));
  else if (o.kind === 'invalid') await save({ ...item, status: 'failed', error: o.message, attempts: item.attempts + 1 });
  else if (o.kind === 'session') await save({ ...item, status: 'session', error: o.message, attempts: item.attempts + 1 });
  else await save({ ...item, status: 'pending', error: undefined, attempts: item.attempts + 1 });
}

/**
 * เก็บลงเครื่องก่อน แล้วลองส่งทันที (ผู้ใช้รอดูผล)
 * - done: ส่งแล้ว (ลบจากคิว) · invalid: ข้อมูลผิด (ลบจากคิว ให้หน้าเพจแสดงข้อผิดพลาดเอง)
 * - session / retry: ค้างในคิว ส่งเองทีหลัง
 */
export async function sendOrQueue(input: Omit<OutboxItem, 'id' | 'userId' | 'userName' | 'createdAt' | 'status' | 'attempts'>): Promise<Outcome> {
  const me = currentUser();
  const item: OutboxItem = { ...input, id: crypto.randomUUID(), userId: me.id, userName: me.name, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 };
  try {
    await save(item);
  } catch {
    // เก็บลงเครื่องไม่ได้ (โหมดส่วนตัว/พื้นที่เต็ม) → ส่งตรงอย่างเดียว · ส่งไม่ได้ต้องบอกตามจริง (ห้ามบอกว่าเก็บไว้แล้ว)
    const o = await send(item);
    return o.kind === 'retry' || o.kind === 'session' ? { kind: 'unsaved' } : o;
  }
  void navigator.storage?.persist?.();
  inFlight.add(item.id);
  try {
    const o = await send(item);
    if (o.kind === 'invalid') await run('readwrite', (s) => s.delete(item.id));
    else await apply(item, o);
    return o;
  } finally {
    inFlight.delete(item.id);
    notify();
  }
}

let flushing = false;
/** ส่งรายการที่ค้าง (ของผู้ใช้ที่ล็อกอินอยู่) ตามลำดับ — เจอเน็ตหลุด/ล็อกอินหมดอายุก็หยุดรอรอบหน้า */
export async function flush(): Promise<void> {
  if (flushing || !('indexedDB' in window)) return;
  flushing = true;
  try {
    await withLock(async () => {
      const me = currentUser();
      for (const item of await listItems()) {
        if (item.userId !== me.id || item.status === 'failed' || inFlight.has(item.id)) continue;
        const o = await send(item);
        await apply(item, o);
        if (o.kind === 'retry' || o.kind === 'session') break;
      }
    });
  } catch {
    /* เปิดฐานข้อมูลในเครื่องไม่ได้ — ไม่มีอะไรค้าง */
  } finally {
    flushing = false;
    notify();
  }
}

/** ส่งรายการที่ต้องแก้/รอล็อกอิน อีกครั้ง (กดจากหน้าคิว) */
export async function retryItem(id: string): Promise<void> {
  const item = (await listItems()).find((i) => i.id === id);
  if (item) await save({ ...item, status: 'pending', error: undefined });
  await flush();
}

// ---------- หน้าจอ ----------

async function notify(): Promise<void> {
  let items: OutboxItem[] = [];
  try { items = await listItems(); } catch { /* ignore */ }
  const mine = items.filter((i) => i.userId === currentUser().id);
  const s = pendingSummary(mine);
  document.querySelectorAll<HTMLElement>('[data-outbox-badge]').forEach((el) => {
    el.hidden = s.count === 0;
    // สลับทั้งคู่: ถ้าเพิ่มแค่ bg-danger สีส้มเดิมยังชนะ (อยู่หลังกว่าใน CSS ที่ build แล้ว)
    el.classList.toggle('bg-danger', s.needsAction);
    el.classList.toggle('bg-honey-700', !s.needsAction);
    const t = el.querySelector('[data-outbox-text]');
    if (t) t.textContent = s.text;
  });
  // ออกจากระบบระหว่างมีรายการค้าง → เตือนก่อน (รายการยังอยู่ในเครื่องนี้ ส่งต่อเมื่อล็อกอินอีกครั้ง)
  document.querySelectorAll<HTMLFormElement>('form[action="/admin/logout"]').forEach((f) => {
    f.dataset.confirm = s.count
      ? `ยังมี ${s.count} รายการที่ยังไม่ได้ส่งขึ้นระบบ — ถ้าออกจากระบบ รายการจะรออยู่ในเครื่องนี้ และส่งต่อเมื่อคุณล็อกอินอีกครั้ง\n\nออกจากระบบใช่ไหม?`
      : 'ออกจากระบบใช่ไหม?';
  });
  window.dispatchEvent(new CustomEvent('outbox:change', { detail: mine }));
}

/** ข้อความแจ้งชั่วคราว (ล่างจอ) */
export function toast(message: string): void {
  const el = document.getElementById('outbox-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(setTimeout(() => (el.hidden = true), 6000));
}

export const UNSAVED_MSG = 'ยังไม่ได้บันทึก — สัญญาณไม่ดี และเครื่องนี้เก็บรายการไว้ไม่ได้ (พื้นที่เต็มหรือโหมดส่วนตัว) ข้อมูลยังอยู่ในฟอร์ม ลองกดบันทึกอีกครั้งเมื่อสัญญาณดีขึ้น';
export const QUEUED_MSG = 'เก็บไว้ในเครื่องแล้ว — สัญญาณไม่ดี ระบบจะส่งเองเมื่อสัญญาณกลับมา (ดูได้ที่ "รอส่ง")';
export const SESSION_QUEUED_MSG = 'เก็บไว้ในเครื่องแล้ว — แต่ล็อกอินหมดอายุ ล็อกอินใหม่แล้วระบบจะส่งต่อให้';

/** ไปหน้าผลจากเซิร์ฟเวอร์ — ถ้าต่างกันแค่ #hash เบราว์เซอร์จะแค่เลื่อนหน้า จึงต้องโหลดใหม่เอง */
function go(redirect?: string): void {
  const u = new URL(redirect ?? location.href, location.href);
  if (u.pathname + u.search === location.pathname + location.search) {
    location.hash = u.hash;
    location.reload();
  } else location.assign(u.href);
}

/** ฟอร์มบันทึกงานรัง: เก็บ → ส่ง · ส่งได้ = ไปหน้าผลตามเดิม · ข้อมูลผิด = ส่งฟอร์มปกติให้เซิร์ฟเวอร์แสดงช่องที่ผิด · ส่งไม่ได้ = เก็บไว้ ทำรายการต่อได้ */
function bindForm(form: HTMLFormElement): void {
  form.addEventListener('submit', async (e) => {
    if (!('indexedDB' in window) || form.dataset.outboxNative) return;
    e.preventDefault();
    const fd = new FormData(form, e.submitter);
    const fields = await fieldsOf(fd);
    const buttons = [...form.querySelectorAll<HTMLButtonElement>('button[type=submit], button:not([type])')];
    buttons.forEach((b) => { b.dataset.label ??= b.textContent ?? ''; b.disabled = true; b.textContent = 'กำลังบันทึก…'; });
    const o = await sendOrQueue({ kind: 'record', url: form.action || location.href, fields, label: recordLabel(form.dataset.outbox || 'บันทึก', fields), bytes: 0 });
    if (o.kind === 'done') return go(o.redirect);
    if (o.kind === 'unsaved') {
      buttons.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label ?? b.textContent; delete b.dataset.label; });
      toast(UNSAVED_MSG);
      return;
    }
    if (o.kind === 'invalid') {
      // ให้เซิร์ฟเวอร์แสดงข้อผิดพลาดตรงช่องตามปกติ (คีย์ idem เดิม — ไม่มีอะไรถูกบันทึกไปแล้ว)
      form.dataset.outboxNative = '1';
      HTMLFormElement.prototype.submit.call(form);
      return;
    }
    // เก็บไว้ในเครื่อง: ล้างช่องที่กรอก (คงวันที่) + คีย์ใหม่ สำหรับรายการถัดไป
    buttons.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label ?? b.textContent; delete b.dataset.label; });
    for (const el of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=hidden]):not([type=date]):not([type=checkbox]):not([type=radio]), textarea')) el.value = el.name === 'queenCells' ? '1' : '';
    const idem = form.querySelector<HTMLInputElement>('input[name=idem]');
    if (idem) idem.value = crypto.randomUUID();
    let note = form.querySelector<HTMLElement>('[data-outbox-note]');
    if (!note) {
      note = document.createElement('p');
      note.dataset.outboxNote = '';
      note.setAttribute('role', 'status');
      note.className = 'rounded-xl bg-honey-50 p-3 text-sm font-medium';
      form.insertBefore(note, form.firstChild);
    }
    note.textContent = o.kind === 'session' ? SESSION_QUEUED_MSG : QUEUED_MSG;
    toast(o.kind === 'session' ? SESSION_QUEUED_MSG : QUEUED_MSG);
  });
}

export function init(): void {
  if (!('indexedDB' in window) || !document.body.dataset.userId) return;
  document.querySelectorAll<HTMLFormElement>('form[data-outbox]').forEach(bindForm);
  document.body.dataset.outboxReady = '1'; // ใช้ใน check:offline (รอให้สคริปต์พร้อมก่อนตัดเน็ต)
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void flush(); });
  setInterval(() => {
    if (!document.querySelector('[data-outbox-badge]:not([hidden])')) return;
    void flush();
  }, 30_000);
  void flush();
}
