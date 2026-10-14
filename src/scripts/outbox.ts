// คิวรอส่ง (Phase 5.5) — ฝั่งเบราว์เซอร์: เก็บใน IndexedDB · ส่งทันที · เน็ตหลุด/ช้า = รอส่งเอง
// ใช้กับฟอร์มบันทึกงานรัง (<form data-outbox="A12 · เก็บน้ำหวาน">) และรูป (sendOrQueue จากสคริปต์หน้าเพจ)
// ส่งซ้ำปลอดภัย: บันทึกงานมีคีย์ idem · รูปมีรหัสชุด batch — เซิร์ฟเวอร์ไม่บันทึกซ้ำ
// ส่งเมื่อ: เปิดหน้า · กลับมาออนไลน์ · สลับกลับมาที่แอป · ทุก 30 วินาทีระหว่างที่ยังมีรายการ (ไม่ใช้ service worker — ทำงานเหมือนกันทั้ง Android และ iPhone)
// บันทึกงานส่งก่อนรูป · รูปที่หมดเวลา/เซิร์ฟเวอร์ขัดข้อง เว้นระยะก่อนลองเอง (ไม่อัปโหลดซ้ำทุก 30 วินาที) — กด "ส่งตอนนี้" หรือสัญญาณกลับมา ส่งทันที
import { afterSend, failureOf, isDue, outcomeOf, pendingSummary, recordLabel, resetForRetry, sendOrder, stopsRun, timeoutFor, type Field, type OutboxItem, type Outcome, type ResponseInfo } from './outbox-core';

const DB_NAME = 'metafarm-outbox';
const STORE = 'items';

/** งานกับฐานข้อมูลในเครื่องที่ค้างนานกว่านี้ = ถือว่าล้ม (WebKit บางครั้งค้างไม่ตอบ — ปุ่มจะได้ไม่ค้าง "กำลังบันทึก…") */
const IDB_TIMEOUT = 8_000;
const within = <T,>(p: Promise<T>, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`IndexedDB ${what}: ไม่ตอบใน ${IDB_TIMEOUT / 1000} วินาที`)), IDB_TIMEOUT);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

// เปิดฐานข้อมูลครั้งเดียวแล้วใช้ซ้ำ (WebKit/iPhone ค้างเมื่อเปิด-ปิดการเชื่อมต่อถี่ ๆ)
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= within(
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        const db = req.result;
        // ปิดเอง (เช่นเบราว์เซอร์ล้างข้อมูล) → เปิดใหม่ครั้งหน้า
        db.onclose = () => (dbPromise = null);
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    }),
    'open',
  ).catch((e: unknown) => { dbPromise = null; throw e; });
  return dbPromise;
}
/** ทิ้งการเชื่อมต่อเดิม (เปิดใหม่ครั้งหน้า) */
function reconnect(): void {
  const old = dbPromise;
  dbPromise = null;
  old?.then((db) => db.close()).catch(() => {});
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode); // การเชื่อมต่อที่หลุดแล้ว: โยน InvalidStateError ตรงนี้
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB: ยกเลิก'));
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  try {
    return await within(tx(await openDb(), mode, fn), 'transaction');
  } catch {
    // iPhone: สลับไปแอปอื่นนาน ๆ แล้วกลับมา การเชื่อมต่อหลุดโดยไม่มีเหตุการณ์ close ("Connection to Indexed Database server lost")
    // → ทุกการบันทึกล้มจนกว่าจะโหลดหน้าใหม่ · เปิดใหม่แล้วลองอีกครั้งเดียว (ล้มอีก = ล้มจริง เช่นพื้นที่เต็ม)
    reconnect();
    return within(tx(await openDb(), mode, fn), 'transaction');
  }
}

export const listItems = async () => ((await run('readonly', (s) => s.getAll())) as OutboxItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const save = (item: OutboxItem) => run('readwrite', (s) => s.put(item));
/** เขียนทับเฉพาะถ้ารายการยังอยู่ — ระหว่างที่ส่ง ถ้าถูกลบจากหน้า "รอส่ง" หรืออีกแท็บส่งไปแล้ว ผลที่มาทีหลังจะไม่ทำให้กลับมา */
const saveIfExists = (item: OutboxItem) =>
  run('readwrite', (s) => {
    const r = s.get(item.id);
    r.onsuccess = () => { if (r.result) s.put(item); };
    return r;
  });
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
  const started = Date.now();
  try {
    const res = await fetch(item.url, { method: 'POST', body: formDataOf(item.fields), credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctrl.signal });
    let json: ResponseInfo['json'] = null;
    let broken = false;
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      try { json = (await res.json()) as ResponseInfo['json']; } catch { broken = true; } // คำตอบขาดกลางทาง
    }
    return outcomeOf({ status: res.status, url: res.url, json, broken });
  } catch (e) {
    return failureOf(e, timedOut, Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

/** กันส่งรายการเดียวกันพร้อมกัน (หลายแท็บ / กดส่งระหว่างที่ส่งเบื้องหลัง) — ซ้ำก็ไม่เสียหายแต่เปลืองเน็ต */
const inFlight = new Set<string>();
const withLock = <T,>(fn: () => Promise<T>): Promise<T> =>
  navigator.locks ? (navigator.locks.request('metafarm-outbox', fn) as Promise<T>) : fn();

async function apply(item: OutboxItem, o: Outcome): Promise<void> {
  const next = afterSend(item, o, Date.now());
  if (next) await saveIfExists(next);
  else await run('readwrite', (s) => s.delete(item.id));
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
    try {
      if (o.kind === 'invalid') await run('readwrite', (s) => s.delete(item.id));
      else await apply(item, o);
    } catch {
      /* เขียนผลลงเครื่องไม่ได้ — รายการยังอยู่ในคิว ส่งซ้ำได้ปลอดภัย (เซิร์ฟเวอร์ไม่บันทึกซ้ำ) */
    }
    return o;
  } finally {
    inFlight.delete(item.id);
    notify();
  }
}

/** ส่งรายการที่ค้าง (ของผู้ใช้ที่ล็อกอินอยู่) หนึ่งรอบ — บันทึกงานก่อนรูป · เจอเน็ตหลุด/ช้า/ล็อกอินหมดอายุก็หยุดรอรอบหน้า (คืน true) */
async function flushOnce(force: boolean): Promise<boolean> {
  let stopped = false;
  try {
    await withLock(async () => {
      const me = currentUser();
      const now = Date.now();
      for (const item of sendOrder(await listItems())) {
        if (item.userId !== me.id || item.status === 'failed' || inFlight.has(item.id) || !isDue(item, now, force)) continue;
        inFlight.add(item.id);
        try {
          const o = await send(item);
          await apply(item, o);
          if (stopsRun(o)) { stopped = true; break; }
        } finally {
          inFlight.delete(item.id);
        }
      }
    });
  } catch {
    /* เปิดฐานข้อมูลในเครื่องไม่ได้ — ลองใหม่รอบหน้า */
    stopped = true;
  }
  return stopped;
}

let running: Promise<void> | null = null;
/** มีคนขอส่งระหว่างที่กำลังส่ง → ส่งอีกรอบเมื่อจบ (true = ไม่รอเว้นระยะ) */
let again: boolean | null = null;
/** รอบที่กำลังส่ง: ไม่รอเว้นระยะไหม และเริ่มเมื่อไร (รวมคำขอซ้ำจากเหตุการณ์เดียวกัน) */
let current = { force: false, at: 0 };
/**
 * ส่งรายการที่ค้าง · force = ไม่รอเว้นระยะ (กด "ส่งตอนนี้" / สัญญาณเพิ่งกลับมา)
 * ถ้ากำลังส่งอยู่ จะส่งอีกรอบต่อท้าย (เดิมกด "ส่งตอนนี้" ระหว่างส่งเบื้องหลังแล้วไม่เกิดอะไร):
 * - คำขอแบบ force ได้รอบใหม่เสมอ แม้รอบเดิมหยุดเพราะเน็ตไม่ดี (สัญญาณอาจเพิ่งกลับมาระหว่างรอบนั้น)
 *   ยกเว้นมาซ้ำภายใน 1.5 วินาทีหลังรอบ force เพิ่งเริ่ม (เช่นเหตุการณ์ online ยิงสองครั้ง) — นับเป็นรอบเดียว
 * - คำขอตามรอบเวลา: รอบเดิมหยุดเพราะเน็ตไม่ดี → ไม่ส่งซ้ำทันที (เปลืองเน็ตเปล่า ๆ)
 */
export function flush(force = false): Promise<void> {
  if (!('indexedDB' in window)) return Promise.resolve();
  if (running) {
    if (!(force && current.force && Date.now() - current.at < 1_500)) again = (again ?? false) || force;
    return running;
  }
  running = (async () => {
    try {
      let f = force;
      for (;;) {
        current = { force: f, at: Date.now() };
        const stopped = await flushOnce(f);
        const next = again;
        again = null;
        if (next === null || (stopped && !next)) break;
        f = next;
      }
    } finally {
      running = null;
      notify();
    }
  })();
  return running;
}

/** ส่งรายการที่ต้องแก้/รอล็อกอิน อีกครั้ง (กดจากหน้าคิว) — เริ่มนับครั้งที่ล้มใหม่ */
export async function retryItem(id: string): Promise<void> {
  const item = (await listItems()).find((i) => i.id === id);
  if (item) await save(resetForRetry(item));
  await flush(true);
}

// ---------- หน้าจอ ----------

async function notify(): Promise<void> {
  let items: OutboxItem[];
  try {
    items = await listItems();
  } catch {
    // อ่านไม่ได้ ≠ ไม่มีรายการ — คงแถบ/คำเตือนเดิมไว้ (เดิมแถบหายและออกจากระบบโดยไม่เตือน ทั้งที่ยังมีของค้าง)
    return;
  }
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

/** ข้อความแจ้งชั่วคราว (ล่างจอ) — กล่องอยู่ในหน้าตลอด (role=status) เปลี่ยนแค่ข้อความ โปรแกรมอ่านหน้าจอจึงอ่านให้ทุกครั้ง */
export function toast(message: string): void {
  const el = document.getElementById('outbox-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('opacity-0');
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(setTimeout(() => {
    el.classList.add('opacity-0');
    el.textContent = '';
  }, 6000));
}

export const UNSAVED_MSG = 'ยังไม่ได้บันทึก — สัญญาณไม่ดี และเครื่องนี้เก็บไว้ให้ไม่ได้ (ที่เก็บเต็ม หรือเปิดเบราว์เซอร์แบบส่วนตัวอยู่) ข้อมูลยังอยู่ในหน้านี้ ลองกดบันทึกอีกครั้งเมื่อสัญญาณดีขึ้น';
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

/** ข้อความในฟอร์ม (อยู่บนสุดของฟอร์ม ไม่หายเอง) */
function formNote(form: HTMLFormElement, text: string): void {
  let note = form.querySelector<HTMLElement>('[data-outbox-note]');
  if (!note) {
    note = document.createElement('p');
    note.dataset.outboxNote = '';
    note.setAttribute('role', 'status');
    note.className = 'rounded-xl bg-honey-50 p-3 text-sm font-medium';
    form.insertBefore(note, form.firstChild);
  }
  note.textContent = text;
}

/** ฟอร์มบันทึกงานรัง: เก็บ → ส่ง · ส่งได้ = ไปหน้าผลตามเดิม · ข้อมูลผิด = ส่งฟอร์มปกติให้เซิร์ฟเวอร์แสดงช่องที่ผิด · ส่งไม่ได้ = เก็บไว้ ทำรายการต่อได้ */
function bindForm(form: HTMLFormElement): void {
  form.addEventListener('submit', async (e) => {
    if (!('indexedDB' in window) || form.dataset.outboxNative) return;
    e.preventDefault();
    const buttons = [...form.querySelectorAll<HTMLButtonElement>('button[type=submit], button:not([type])')];
    const restore = () => buttons.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label ?? b.textContent; delete b.dataset.label; });
    let o: Outcome;
    let fields: Field[];
    try {
      fields = await fieldsOf(new FormData(form, e.submitter));
      buttons.forEach((b) => { b.dataset.label ??= b.textContent ?? ''; b.disabled = true; b.textContent = 'กำลังบันทึก…'; });
      o = await sendOrQueue({ kind: 'record', url: form.action || location.href, fields, label: recordLabel(form.dataset.outbox || 'บันทึก', fields), bytes: 0 });
    } catch {
      // ผิดพลาดในเครื่อง (อ่านฟอร์ม/ฐานข้อมูลในเครื่อง) — ปุ่มไม่ค้าง ข้อมูลยังอยู่ในฟอร์ม
      restore();
      toast(UNSAVED_MSG);
      return;
    }
    if (o.kind === 'done') {
      // บอกก่อนโหลดหน้า: สัญญาณอ่อน หน้าใหม่อาจโหลดไม่ขึ้น แต่รายการบันทึกแล้ว (กดย้อนกลับจะเห็นข้อความนี้ ไม่ต้องบันทึกซ้ำ)
      formNote(form, 'บันทึกแล้ว — กำลังโหลดหน้า…');
      toast('บันทึกแล้ว');
      return go(o.redirect);
    }
    if (o.kind === 'unsaved') {
      restore();
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
    restore();
    for (const el of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=hidden]):not([type=date]):not([type=checkbox]):not([type=radio]), textarea')) el.value = el.name === 'queenCells' ? '1' : '';
    const idem = form.querySelector<HTMLInputElement>('input[name=idem]');
    if (idem) idem.value = crypto.randomUUID();
    formNote(form, o.kind === 'session' ? SESSION_QUEUED_MSG : QUEUED_MSG);
    toast(o.kind === 'session' ? SESSION_QUEUED_MSG : QUEUED_MSG);
  });
}

export function init(): void {
  if (!('indexedDB' in window) || !document.body.dataset.userId) return;
  document.querySelectorAll<HTMLFormElement>('form[data-outbox]').forEach(bindForm);
  document.body.dataset.outboxReady = '1'; // ใช้ใน check:offline (รอให้สคริปต์พร้อมก่อนตัดเน็ต)
  // สัญญาณเพิ่งกลับมา → ส่งทันทีไม่รอเว้นระยะ · สลับกลับมาที่แอป/ทุก 30 วินาที → ตามระยะ
  window.addEventListener('online', () => void flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void flush(); });
  // กลับมาหน้าเดิมด้วยปุ่มย้อนกลับ (หน้าในหน่วยความจำ): ฟอร์มที่เคยส่งแบบปกติ กลับมาใช้คิวรอส่ง
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) document.querySelectorAll<HTMLFormElement>('form[data-outbox-native]').forEach((f) => delete f.dataset.outboxNative);
  });
  setInterval(() => {
    if (!document.querySelector('[data-outbox-badge]:not([hidden])')) return;
    void flush();
  }, 30_000);
  void flush();
}
