// ตัวดูรูป (lightbox) — กดรูปแล้วขึ้นภาพใหญ่บนหน้าเดิม ไม่ต้องเปิดหน้าใหม่ (เจ้าของขอ 2026-10-11)
// ใช้กับทั้งเว็บสาธารณะและหลังบ้าน (โหลดจาก PublicLayout + AdminLayout)
//
// วิธีใช้ในหน้า:
//   <a href="/img/<คีย์>" data-zoom data-caption="คำบรรยาย" aria-label="ดูรูปขยาย: …"><img …></a>
//     • href = รูปเต็ม (ไม่มี JS = เปิดรูปตามลิงก์ปกติ) · data-zoom-src ระบุรูปเต็มแทน href ได้
//     • data-caption = คำบรรยาย (ไม่ใส่ = ใช้ alt ของรูปข้างใน)
//     • data-credit + data-credit-href = เครดิตภาพ (ผู้ถ่าย · สัญญาอนุญาต) ที่ต้องแสดงตามสัญญา CC
//   <ul data-zoom-group> … </ul>  รูปใน group เดียวกันเลื่อนดูต่อกันได้ (ไม่มี group = รูปเดียว)
//   รูปใน Markdown (.prose-mf img) ขยายได้เอง ไม่ต้องใส่อะไร
//
// ความสามารถ: ← → / ปุ่ม / ปัดซ้าย-ขวา เลื่อนรูป · Esc / ปุ่ม ✕ / แตะพื้นหลัง ปิด · ปุ่มขยายดูเต็มขนาด (เลื่อนดูในภาพได้)
// แสดงรูปย่อที่มีอยู่แล้วทันที แล้วสลับเป็นรูปเต็มเมื่อโหลดเสร็จ · โหลดรูปข้างเคียงรอไว้ · ปุ่มทุกปุ่ม ≥ 44px

interface Item { src: string; thumb: string; alt: string; caption: string; credit: string; creditHref: string }

const ICONS = {
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
} as const;

const svg = (name: keyof typeof ICONS) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="size-6">${ICONS[name]}</svg>`;

const BTN = 'grid size-12 shrink-0 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

let dlg: HTMLDialogElement;
let stage: HTMLElement, img: HTMLImageElement, note: HTMLElement, counter: HTMLElement, cap: HTMLElement, credit: HTMLElement;
let prevBtn: HTMLButtonElement, nextBtn: HTMLButtonElement, zoomBtn: HTMLButtonElement;
let items: Item[] = [];
let index = 0;
let zoomed = false;
let token = 0; // ป้องกันรูปที่โหลดช้ามาทับรูปที่เลื่อนไปแล้ว

function build() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className = 'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-neutral-950 p-0 text-white backdrop:bg-black';
  dlg.setAttribute('aria-label', 'ดูรูปขยาย');
  dlg.dataset.lightbox = '';
  dlg.innerHTML = `
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p data-lb-counter class="rounded-full bg-black/55 px-3 py-2 text-sm tabular-nums" aria-live="polite"></p>
        <div class="flex gap-2">
          <button type="button" data-lb-zoom class="${BTN}" aria-pressed="false" aria-label="ขยายดูเต็มขนาด">${svg('zoomIn')}</button>
          <button type="button" data-lb-close class="${BTN}" aria-label="ปิด">${svg('close')}</button>
        </div>
      </div>
      <div data-lb-stage class="relative flex min-h-0 flex-1 overflow-auto" style="touch-action: pan-y pinch-zoom">
        <img data-lb-img alt="" class="m-auto h-full w-full select-none object-contain" draggable="false" />
        <p data-lb-status role="status" class="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-white/80"></p>
        <button type="button" data-lb-prev class="${BTN} absolute left-2 top-1/2 -translate-y-1/2" aria-label="รูปก่อนหน้า">${svg('prev')}</button>
        <button type="button" data-lb-next class="${BTN} absolute right-2 top-1/2 -translate-y-1/2" aria-label="รูปถัดไป">${svg('next')}</button>
      </div>
      <div class="min-h-[3.5rem] space-y-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
        <p data-lb-cap class="text-base"></p>
        <p data-lb-credit class="text-sm text-white/70"></p>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const q = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  stage = q('[data-lb-stage]'); img = q<HTMLImageElement>('[data-lb-img]'); note = q('[data-lb-status]');
  counter = q('[data-lb-counter]'); cap = q('[data-lb-cap]'); credit = q('[data-lb-credit]');
  prevBtn = q<HTMLButtonElement>('[data-lb-prev]'); nextBtn = q<HTMLButtonElement>('[data-lb-next]'); zoomBtn = q<HTMLButtonElement>('[data-lb-zoom]');

  q('[data-lb-close]').addEventListener('click', () => dlg.close());
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  zoomBtn.addEventListener('click', () => setZoom(!zoomed));
  // แตะพื้นที่ว่างรอบรูป = ปิด · แตะรูป = สลับขยาย/พอดีจอ
  stage.addEventListener('click', (e) => { if (e.target === stage) dlg.close(); });
  img.addEventListener('click', (e) => {
    if (!zoomed && img.naturalWidth) {
      const r = img.getBoundingClientRect();
      const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      const inside = Math.abs(e.clientX - (r.left + r.width / 2)) <= w / 2 && Math.abs(e.clientY - (r.top + r.height / 2)) <= h / 2;
      if (!inside) { dlg.close(); return; }
    }
    setZoom(!zoomed);
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { document.documentElement.classList.remove('overflow-hidden'); img.removeAttribute('src'); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });

  // ปัดซ้าย-ขวาเพื่อเลื่อนรูป (เฉพาะตอนไม่ได้ขยาย — ตอนขยายปัดคือเลื่อนดูในภาพ)
  let sx = 0, sy = 0, tracking = false;
  stage.addEventListener('pointerdown', (e) => { tracking = e.pointerType !== 'mouse' && !zoomed; sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { tracking = false; });
}

function setZoom(on: boolean) {
  zoomed = on;
  zoomBtn.setAttribute('aria-pressed', String(on));
  zoomBtn.setAttribute('aria-label', on ? 'ย่อให้พอดีจอ' : 'ขยายดูเต็มขนาด');
  zoomBtn.innerHTML = svg(on ? 'zoomOut' : 'zoomIn');
  img.classList.toggle('cursor-zoom-in', !on);
  img.classList.toggle('cursor-zoom-out', on);
  if (on) {
    // ขนาดจริงของรูป (เลื่อนดูในภาพได้) — ไม่เล็กกว่าความกว้างจอ
    img.classList.remove('h-full', 'w-full', 'object-contain');
    img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
    img.style.width = `${Math.max(img.naturalWidth, stage.clientWidth)}px`; img.style.height = 'auto';
    stage.scrollTo({ left: (stage.scrollWidth - stage.clientWidth) / 2, top: (stage.scrollHeight - stage.clientHeight) / 2 });
  } else {
    img.classList.add('h-full', 'w-full', 'object-contain');
    img.style.maxWidth = img.style.maxHeight = img.style.width = img.style.height = '';
  }
}

function preload(i: number) {
  const it = items[i];
  if (it) { const p = new Image(); p.decoding = 'async'; p.src = it.src; }
}

function show(i: number) {
  index = (i + items.length) % items.length;
  const it = items[index]!;
  const mine = ++token;
  setZoom(false);
  counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
  counter.hidden = items.length <= 1;
  prevBtn.hidden = nextBtn.hidden = items.length <= 1;
  cap.textContent = it.caption;
  credit.replaceChildren();
  if (it.credit) {
    if (it.creditHref) { const a = document.createElement('a'); a.href = it.creditHref; a.target = '_blank'; a.rel = 'noopener'; a.className = 'underline'; a.textContent = it.credit; credit.appendChild(a); }
    else credit.textContent = it.credit;
  }
  img.alt = it.alt;
  // รูปย่อที่มีอยู่แล้วขึ้นก่อนทันที (เบลอเล็กน้อย) แล้วสลับเป็นรูปเต็มเมื่อโหลดเสร็จ
  img.style.filter = it.thumb && it.thumb !== it.src ? 'blur(2px)' : '';
  img.src = it.thumb || it.src;
  note.textContent = 'กำลังโหลดรูป…';
  const full = new Image();
  full.decoding = 'async';
  full.onload = () => { if (mine !== token) return; img.src = it.src; img.style.filter = ''; note.textContent = ''; };
  full.onerror = () => { if (mine !== token) return; img.style.filter = ''; note.textContent = 'โหลดรูปเต็มไม่ได้ — แสดงรูปที่มีอยู่'; };
  full.src = it.src;
  preload(index + 1); preload(index - 1);
}

function go(step: number) {
  if (items.length > 1) show(index + step);
}

const fullUrl = (u: string) => u.replace(/[?&]w=thumb\b/, '');

function describe(el: Element): Item {
  const inner = el instanceof HTMLImageElement ? el : el.querySelector('img');
  const src = fullUrl((el as HTMLElement).dataset.zoomSrc ?? (el instanceof HTMLAnchorElement ? el.href : inner?.currentSrc || inner?.src || ''));
  const thumb = inner?.currentSrc || inner?.src || '';
  const alt = inner?.alt ?? '';
  const d = (el as HTMLElement).dataset;
  return { src, thumb, alt, caption: d.caption ?? alt, credit: d.credit ?? '', creditHref: d.creditHref ?? '' };
}

/** รูปทั้งหมดในกลุ่มเดียวกันกับรูปที่กด (data-zoom-group · รูปใน Markdown ถือเป็นกลุ่มเดียวกัน) */
function groupOf(el: Element): Element[] {
  const root = el.closest('[data-zoom-group], .prose-mf');
  if (!root) return [el];
  return root.matches('.prose-mf') && !root.hasAttribute('data-zoom-group')
    ? [...root.querySelectorAll('img')]
    : [...root.querySelectorAll('[data-zoom]')];
}

function open(el: Element) {
  build();
  const group = groupOf(el);
  items = group.map(describe).filter((i) => i.src);
  if (!items.length) return;
  index = Math.max(0, group.indexOf(el));
  document.documentElement.classList.add('overflow-hidden'); // ไม่ให้หน้าข้างหลังเลื่อน
  if (!dlg.open) dlg.showModal();
  show(index);
  dlg.querySelector<HTMLElement>('[data-lb-close]')!.focus();
}

const TARGET = '[data-zoom], .prose-mf img';

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // เปิดแท็บใหม่ด้วย Ctrl/⌘+คลิกได้ตามปกติ
  const el = (e.target as Element | null)?.closest(TARGET);
  if (!el || (el.closest('dialog[data-lightbox]'))) return;
  e.preventDefault();
  open(el);
});

// รูปใน Markdown เป็น <img> เฉย ๆ → ให้โฟกัสด้วยคีย์บอร์ดและกด Enter/Space เปิดได้
function enhanceProse() {
  document.querySelectorAll<HTMLImageElement>('.prose-mf img').forEach((i) => {
    if (i.closest('a')) return;
    i.tabIndex = 0;
    i.setAttribute('role', 'button');
    i.setAttribute('aria-label', `ดูรูปขยาย: ${i.alt}`.trim());
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
  });
}
enhanceProse();
