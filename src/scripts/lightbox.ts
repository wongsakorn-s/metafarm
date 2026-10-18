// ตัวดูรูป (Lightbox) ระดับมืออาชีพ
// รองรับ: Pinch-to-zoom, Double-tap zoom, Mouse wheel zoom, Pan ลากเลื่อนเมื่อซูม,
// ปัดเปลี่ยนรูป, ปัดลงเพื่อปิด (Swipe down to dismiss), ปุ่มขยาย +, -, รีเซ็ต,
// และแถบรูปย่อ (Mini-thumbnails) ด้านล่าง

interface Item {
  src: string;
  thumb: string;
  alt: string;
  caption: string;
  credit: string;
  creditHref: string;
}

const ICONS = {
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
} as const;

const svg = (name: keyof typeof ICONS) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="size-5 sm:size-6">${ICONS[name]}</svg>`;

const BTN =
  'grid size-11 sm:size-12 shrink-0 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-all duration-150 hover:bg-black/85 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30 disabled:pointer-events-none';

let dlg: HTMLDialogElement;
let stage: HTMLElement, canvas: HTMLElement, img: HTMLImageElement, note: HTMLElement;
let counter: HTMLElement, cap: HTMLElement, credit: HTMLElement, thumbsContainer: HTMLElement;
let prevBtn: HTMLButtonElement, nextBtn: HTMLButtonElement;
let zoomInBtn: HTMLButtonElement, zoomOutBtn: HTMLButtonElement, zoomLevelBtn: HTMLButtonElement;
let closeBtn: HTMLButtonElement;

let items: Item[] = [];
let index = 0;
let currentGallery: HTMLElement | null = null;
let token = 0;

// สถานะการซูมและการเลื่อน (Transform state)
let scale = 1.0;
let tx = 0;
let ty = 0;

// การติดตามทัช / เมาส์ (Pointer tracking)
const pointers = new Map<number, { x: number; y: number }>();
let initialPinchDistance = 0;
let initialPinchScale = 1.0;
let isPanning = false;
let startX = 0, startY = 0;
let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
let isDismissing = false;

function build() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className =
    'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-neutral-950 p-0 text-white backdrop:bg-black/95 transition-colors duration-150';
  dlg.setAttribute('aria-label', 'ดูรูปขยาย');
  dlg.dataset.lightbox = '';
  dlg.innerHTML = `
    <div class="flex h-full flex-col select-none">
      <!-- แถบบน: ตัวนับ, ปุ่มซูม -, ระดับซูม, ปุ่มซูม +, ปุ่มปิด -->
      <div class="relative z-20 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p data-lb-counter class="rounded-full bg-black/60 px-3 py-1.5 text-xs sm:text-sm font-medium tabular-nums text-white/90 backdrop-blur" aria-live="polite"></p>
        <div class="flex items-center gap-1.5 sm:gap-2">
          <button type="button" data-lb-zoom-out class="${BTN}" aria-label="ย่อขนาด">${svg('zoomOut')}</button>
          <button type="button" data-lb-zoom-level class="grid min-w-12 h-11 sm:h-12 px-2.5 place-items-center rounded-full bg-black/60 text-xs sm:text-sm font-semibold text-white/90 backdrop-blur hover:bg-black/85 transition-all active:scale-95" aria-label="รีเซ็ตขนาด">100%</button>
          <button type="button" data-lb-zoom-in class="${BTN}" aria-label="ขยายขนาด">${svg('zoomIn')}</button>
          <button type="button" data-lb-close class="${BTN}" aria-label="ปิด">${svg('close')}</button>
        </div>
      </div>

      <!-- พื้นที่แสดงรูป (Stage) -->
      <div data-lb-stage class="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing" style="touch-action: none">
        <div data-lb-canvas class="relative flex items-center justify-center w-full h-full will-change-transform">
          <img data-lb-img alt="" class="max-h-full max-w-full select-none object-contain pointer-events-auto" draggable="false" />
        </div>
        <p data-lb-status role="status" class="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-white/80 drop-shadow"></p>
        <button type="button" data-lb-prev class="${BTN} absolute left-3 top-1/2 -translate-y-1/2 z-20 shadow-lg" aria-label="รูปก่อนหน้า">${svg('prev')}</button>
        <button type="button" data-lb-next class="${BTN} absolute right-3 top-1/2 -translate-y-1/2 z-20 shadow-lg" aria-label="รูปถัดไป">${svg('next')}</button>
      </div>

      <!-- แถบล่าง: รูปย่อยขนาดเล็ก + คำบรรยาย + เครดิตภาพ -->
      <div class="relative z-20 min-h-[4rem] space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div data-lb-thumbs class="flex justify-center gap-2 overflow-x-auto py-1 max-w-full scrollbar-none"></div>
        <p data-lb-cap class="text-sm sm:text-base font-medium text-white drop-shadow line-clamp-2 px-2"></p>
        <p data-lb-credit class="text-xs text-white/70 px-2"></p>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  const q = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  stage = q('[data-lb-stage]');
  canvas = q('[data-lb-canvas]');
  img = q<HTMLImageElement>('[data-lb-img]');
  note = q('[data-lb-status]');
  counter = q('[data-lb-counter]');
  cap = q('[data-lb-cap]');
  credit = q('[data-lb-credit]');
  thumbsContainer = q('[data-lb-thumbs]');

  prevBtn = q<HTMLButtonElement>('[data-lb-prev]');
  nextBtn = q<HTMLButtonElement>('[data-lb-next]');
  zoomInBtn = q<HTMLButtonElement>('[data-lb-zoom-in]');
  zoomOutBtn = q<HTMLButtonElement>('[data-lb-zoom-out]');
  zoomLevelBtn = q<HTMLButtonElement>('[data-lb-zoom-level]');
  closeBtn = q<HTMLButtonElement>('[data-lb-close]');

  // ปุ่มกด
  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  zoomInBtn.addEventListener('click', () => zoomBy(1.5));
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.5));
  zoomLevelBtn.addEventListener('click', () => (scale > 1.05 ? resetZoom(true) : zoomTo(2.5, true)));

  // คีย์บอร์ด
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.3); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.3); }
    else if (e.key === '0') { e.preventDefault(); resetZoom(true); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  // ล้อหมุนเมาส์สำหรับซูม (Desktop Wheel Zoom)
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    zoomBy(factor, e.clientX, e.clientY);
  }, { passive: false });

  // การจัดการ Gesture ทัชและเมาส์ด้วย Pointer Events
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('overflow-hidden');
    img.removeAttribute('src');
    resetZoom(false);
  });
}

function updateTransform(animate = false) {
  if (!canvas) return;
  canvas.style.transition = animate ? 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
  canvas.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;

  // อัปเดตปุ่มซูมและระดับเปอร์เซ็นต์
  if (zoomLevelBtn) {
    zoomLevelBtn.textContent = `${Math.round(scale * 100)}%`;
  }
  if (zoomOutBtn) zoomOutBtn.disabled = scale <= 1.01;
  if (zoomInBtn) zoomInBtn.disabled = scale >= 3.99;

  // เปลี่ยนเคอร์เซอร์
  if (stage) {
    stage.style.cursor = scale > 1.05 ? 'grab' : 'default';
  }
}

function clampTranslation() {
  if (!stage || !img) return;
  const stageW = stage.clientWidth;
  const stageH = stage.clientHeight;
  const imgW = img.offsetWidth || stageW;
  const imgH = img.offsetHeight || stageH;

  const scaledW = imgW * scale;
  const scaledH = imgH * scale;

  const maxTx = Math.max(0, (scaledW - stageW) / 2);
  const maxTy = Math.max(0, (scaledH - stageH) / 2);

  tx = Math.min(maxTx, Math.max(-maxTx, tx));
  ty = Math.min(maxTy, Math.max(-maxTy, ty));
}

function zoomTo(targetScale: number, animate = true, originX?: number, originY?: number) {
  const oldScale = scale;
  scale = Math.min(4.0, Math.max(1.0, targetScale));

  if (scale <= 1.01) {
    tx = 0;
    ty = 0;
  } else if (originX !== undefined && originY !== undefined && stage) {
    const rect = stage.getBoundingClientRect();
    const cx = originX - (rect.left + rect.width / 2);
    const cy = originY - (rect.top + rect.height / 2);
    const ratio = scale / oldScale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - cy) * ratio;
    clampTranslation();
  } else {
    clampTranslation();
  }

  updateTransform(animate);
}

function zoomBy(factor: number, originX?: number, originY?: number) {
  zoomTo(scale * factor, true, originX, originY);
}

function resetZoom(animate = true) {
  scale = 1.0;
  tx = 0;
  ty = 0;
  updateTransform(animate);
}

// Gestures: Pointer Down
function onPointerDown(e: PointerEvent) {
  // ปุ่ม ‹ › อยู่ใน stage: ถ้าจับ pointer ไว้ที่ stage เบราว์เซอร์จะส่ง click ไปที่ stage แทนปุ่ม → กดปุ่มไม่ได้บนคอม (เจ้าของแจ้ง 2026-10-18)
  if ((e.target as Element | null)?.closest('button')) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);

  if (pointers.size === 1) {
    startX = e.clientX;
    startY = e.clientY;
    isPanning = scale > 1.05;
    isDismissing = false;

    // ตรวจสอบ Double Tap
    const now = Date.now();
    const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
    if (now - lastTapTime < 320 && dist < 30) {
      lastTapTime = 0;
      if (scale > 1.05) {
        resetZoom(true);
      } else {
        zoomTo(2.5, true, e.clientX, e.clientY);
      }
      return;
    }
    lastTapTime = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
  } else if (pointers.size === 2) {
    // เริ่ม Pinch
    isPanning = false;
    isDismissing = false;
    const pts = [...pointers.values()];
    initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    initialPinchScale = scale;
  }
}

// Gestures: Pointer Move
function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    // กำลัง Pinch ซูม
    const pts = [...pointers.values()];
    const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (initialPinchDistance > 10) {
      const pinchFactor = currentDist / initialPinchDistance;
      scale = Math.min(4.5, Math.max(0.7, initialPinchScale * pinchFactor));
      updateTransform(false);
    }
  } else if (pointers.size === 1) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (scale > 1.05) {
      // แพนเลื่อนรูปเมื่อซูมอยู่
      tx += dx;
      ty += dy;
      clampTranslation();
      updateTransform(false);
      startX = e.clientX;
      startY = e.clientY;
    } else {
      // เมื่อไม่ได้ซูม: ปัดลงเพื่อปิด (Swipe down to dismiss)
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        isDismissing = true;
        ty = dy;
        const progress = Math.min(1, dy / 300);
        if (dlg) {
          dlg.style.backgroundColor = `rgba(0,0,0,${Math.max(0.2, 1 - progress * 0.7)})`;
        }
        canvas.style.transform = `translate3d(0, ${dy}px, 0) scale(${Math.max(0.8, 1 - progress * 0.2)})`;
      }
    }
  }
}

// Gestures: Pointer Up / Cancel
function onPointerUp(e: PointerEvent) {
  // pointer ที่ไม่ได้เริ่มบน stage (เช่นกดปุ่ม ‹ ›) ไม่ใช่การปัด — ถ้าไม่ข้าม จะคิด dx จากจุดเริ่มเก่าแล้วเลื่อนรูปกลับ หักล้างการกดปุ่ม
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  try { stage.releasePointerCapture(e.pointerId); } catch {}

  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];
    startX = remaining.x;
    startY = remaining.y;
  } else if (pointers.size === 0) {
    if (isDismissing) {
      if (ty > 80) {
        close();
        return;
      } else {
        if (dlg) dlg.style.backgroundColor = '';
        resetZoom(true);
      }
    } else if (scale > 1.05) {
      if (scale > 4.0) {
        zoomTo(4.0, true);
      } else {
        clampTranslation();
        updateTransform(true);
      }
    } else {
      // ตรวจสอบการปัดซ้าย-ขวาเพื่อเปลี่ยนรูป
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        go(dx < 0 ? 1 : -1);
      } else {
        resetZoom(true);
      }
    }
  }
}

function close() {
  if (dlg && dlg.open) {
    if (dlg) dlg.style.backgroundColor = '';
    dlg.close();
  }
}

function preload(i: number) {
  const it = items[(i + items.length) % items.length];
  if (it) {
    const p = new Image();
    p.decoding = 'async';
    p.src = it.src;
  }
}

function renderMiniThumbs() {
  if (!thumbsContainer) return;
  thumbsContainer.replaceChildren();

  if (items.length <= 1) {
    thumbsContainer.hidden = true;
    return;
  }

  thumbsContainer.hidden = false;
  items.forEach((it, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `ดูรูปที่ ${i + 1}`);
    const active = i === index;
    btn.className = `size-10 sm:size-11 shrink-0 rounded-lg overflow-hidden transition-all duration-150 focus-visible:outline-2 focus-visible:outline-white ${
      active
        ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105 opacity-100'
        : 'opacity-50 hover:opacity-90'
    }`;
    btn.innerHTML = `<img src="${it.thumb || it.src}" alt="" class="size-full object-cover" />`;
    btn.addEventListener('click', () => {
      show(i);
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    thumbsContainer.appendChild(btn);
  });
}

function show(i: number) {
  if (!items.length) return;
  index = (i + items.length) % items.length;
  const it = items[index]!;
  const mine = ++token;

  resetZoom(false);

  // ตัวนับรูป
  counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
  counter.hidden = items.length <= 1;
  prevBtn.hidden = nextBtn.hidden = items.length <= 1;

  // คำบรรยายและเครดิต
  cap.textContent = it.caption;
  credit.replaceChildren();
  if (it.credit) {
    if (it.creditHref) {
      const a = document.createElement('a');
      a.href = it.creditHref;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'underline';
      a.textContent = it.credit;
      credit.appendChild(a);
    } else {
      credit.textContent = it.credit;
    }
  }

  img.alt = it.alt;
  img.style.filter = it.thumb && it.thumb !== it.src ? 'blur(2px)' : '';
  img.src = it.thumb || it.src;

  note.textContent = 'กำลังโหลดรูป…';
  const full = new Image();
  full.decoding = 'async';
  full.onload = () => {
    if (mine !== token) return;
    img.src = it.src;
    img.style.filter = '';
    note.textContent = '';
  };
  full.onerror = () => {
    if (mine !== token) return;
    img.style.filter = '';
    note.textContent = 'โหลดรูปเต็มไม่ได้ — แสดงรูปที่มีอยู่';
  };
  full.src = it.src;

  renderMiniThumbs();
  preload(index + 1);
  preload(index - 1);

  // แจ้งเตือนไปยังแกลเลอรีบนหน้าเว็บให้ซิงก์ตำแหน่งรูป
  if (currentGallery) {
    window.dispatchEvent(
      new CustomEvent('lightbox:change', {
        detail: { gallery: currentGallery, index },
      })
    );
  }
}

function go(step: number) {
  if (items.length > 1) show(index + step);
}

const fullUrl = (u: string) => u.replace(/[?&]w=thumb\b/, '');

function describe(el: Element): Item {
  const inner = el instanceof HTMLImageElement ? el : el.querySelector('img');
  const d = (el as HTMLElement).dataset;
  const src = fullUrl(d.zoomSrc ?? (el instanceof HTMLAnchorElement ? el.href : inner?.currentSrc || inner?.src || ''));
  const thumb = inner?.currentSrc || inner?.src || '';
  const alt = inner?.alt ?? '';
  return {
    src,
    thumb,
    alt,
    caption: d.caption ?? alt,
    credit: d.credit ?? '',
    creditHref: d.creditHref ?? '',
  };
}

function open(el: Element) {
  build();

  // ตรวจหาแกลเลอรีหลัก (ถ้ามี)
  const gallery = el.closest<HTMLElement>('[data-gallery]');
  currentGallery = gallery;

  if (gallery) {
    const thumbs = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-thumb]')];
    if (thumbs.length) {
      items = thumbs.map(describe).filter((i) => i.src);
      const clickedIdx = parseInt((el as HTMLElement).dataset.zoomIndex ?? '', 10);
      index = Number.isInteger(clickedIdx) && clickedIdx >= 0 ? clickedIdx : 0;
    } else {
      items = [describe(el)].filter((i) => i.src);
      index = 0;
    }
  } else {
    // หน้ารูปทั่วไป (Gallery, Articles, Markdown)
    const root = el.closest('[data-zoom-group], .prose-mf');
    const group = root
      ? root.matches('.prose-mf') && !root.hasAttribute('data-zoom-group')
        ? [...root.querySelectorAll('img')]
        : [...root.querySelectorAll('[data-zoom]')]
      : [el];

    items = group.map(describe).filter((i) => i.src);
    index = Math.max(0, group.indexOf(el));
  }

  if (!items.length) return;

  document.documentElement.classList.add('overflow-hidden');
  if (!dlg.open) dlg.showModal();
  show(index);
  closeBtn?.focus();
}

const TARGET = '[data-zoom], .prose-mf img';

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const el = (e.target as Element | null)?.closest(TARGET);
  if (!el || el.closest('dialog[data-lightbox]')) return;
  e.preventDefault();
  open(el);
});

// ให้รูปใน Markdown โฟกัสและกด Enter/Space เปิดดูได้
function enhanceProse() {
  document.querySelectorAll<HTMLImageElement>('.prose-mf img').forEach((i) => {
    if (i.closest('a')) return;
    i.tabIndex = 0;
    i.setAttribute('role', 'button');
    i.setAttribute('aria-label', `ดูรูปขยาย: ${i.alt}`.trim());
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(i);
      }
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceProse);
  } else {
    enhanceProse();
  }
}
