// ลากวางเรียงรูปหน้า /admin/gallery (เจ้าของขอ 2026-10-11)
//
// ใช้ Pointer Events เอง (ไม่ใช้ HTML5 drag-and-drop เพราะไม่ทำงานบนหน้าจอสัมผัส):
//   • เมาส์/นิ้ว: กดค้างที่จุดจับ ⠿ มุมรูป แล้วลาก — มีรูปลอยตามนิ้ว ช่องเดิมจางลง รูปอื่นขยับให้ · จอเลื่อนเองเมื่อลากไปชิดขอบ
//   • คีย์บอร์ด/โปรแกรมอ่านจอ: โฟกัสที่จุดจับ กด Space หยิบ → ลูกศรเลื่อน → Space/Enter วาง · Esc ยกเลิก
//   • วางแล้วบันทึกทันที (POST intent=reorder, order=id,id,…) ถ้าบันทึกไม่ได้ จะคืนลำดับเดิมและแจ้งสาเหตุ
// ลำดับบนสุด = แสดงก่อนบนเว็บ · ไม่มี JS: ใช้ปุ่มเลื่อนขึ้น/ลงใน <noscript> แทน

const statusEl = document.getElementById('sort-status');
const live = document.getElementById('sort-live');
const say = (msg: string, bad = false) => {
  if (live) live.textContent = msg;
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.remove('hidden');
  statusEl.classList.toggle('bg-red-50', bad);
  statusEl.classList.toggle('text-danger', bad);
  statusEl.classList.toggle('bg-palm-100', !bad);
  statusEl.classList.toggle('text-palm-900', !bad);
};

const idsOf = (ul: HTMLElement) => [...ul.querySelectorAll<HTMLElement>(':scope > li[data-photo-id]')].map((li) => li.dataset.photoId!);

/** อัปเดตเลขลำดับ (ป้ายบนรูป + คำอธิบายจุดจับ) ให้ตรงกับตำแหน่งปัจจุบัน */
function renumber(ul: HTMLElement) {
  const lis = [...ul.querySelectorAll<HTMLElement>(':scope > li[data-photo-id]')];
  lis.forEach((li, i) => {
    const badge = li.querySelector('[data-pos]');
    if (badge) badge.textContent = String(i + 1);
    li.querySelector('[data-drag-handle]')?.setAttribute('aria-label', `จัดลำดับรูปที่ ${i + 1} จาก ${lis.length} — กด Space เพื่อหยิบ แล้วใช้ลูกศรเลื่อน`);
  });
}

let saving = false;

async function save(ul: HTMLElement, before: string[]): Promise<void> {
  const after = idsOf(ul);
  if (after.join() === before.join()) return;
  saving = true;
  ul.setAttribute('aria-busy', 'true');
  say('กำลังบันทึกลำดับ…');
  try {
    const fd = new FormData();
    fd.set('intent', 'reorder');
    fd.set('category', ul.dataset.category!);
    fd.set('order', after.join(','));
    const r = await fetch(location.pathname, { method: 'POST', body: fd, headers: { Accept: 'application/json' }, credentials: 'same-origin', redirect: 'manual' });
    // เซสชันหมดอายุ = ถูกส่งไปหน้าล็อกอิน (redirect) ถือว่าไม่สำเร็จ
    if (r.type === 'opaqueredirect' || r.redirected) throw new Error('เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง');
    const j = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!r.ok || !j?.ok) throw new Error(j?.message || `บันทึกไม่ได้ (${r.status})`);
    say('บันทึกลำดับแล้ว — หน้าเว็บอาจแสดงลำดับเก่าอีกไม่เกิน 1 นาที');
  } catch (e) {
    // คืนลำดับเดิม
    const byId = new Map([...ul.querySelectorAll<HTMLElement>(':scope > li[data-photo-id]')].map((li) => [li.dataset.photoId!, li]));
    before.forEach((id) => { const li = byId.get(id); if (li) ul.appendChild(li); });
    renumber(ul);
    say(`ยังไม่ได้บันทึกลำดับ: ${e instanceof Error ? e.message : 'เครือข่ายมีปัญหา'} (คืนลำดับเดิมให้แล้ว)`, true);
  } finally {
    saving = false;
    ul.removeAttribute('aria-busy');
  }
}

/** ย้าย li ไปไว้ "ก่อน/หลัง" target ตามทิศที่ลากมา (ตัดการสั่นไปมาเมื่อเมาส์อยู่บนรูปเดียวกัน) */
function placeNear(ul: HTMLElement, li: HTMLElement, target: HTMLElement) {
  if (target === li || target.parentElement !== ul) return;
  const kids = [...ul.children];
  if (kids.indexOf(target) < kids.indexOf(li)) ul.insertBefore(li, target);
  else ul.insertBefore(li, target.nextSibling);
}

function startPointerDrag(ul: HTMLElement, li: HTMLElement, e: PointerEvent) {
  const before = idsOf(ul);
  const rect = li.getBoundingClientRect();
  const offX = e.clientX - rect.left, offY = e.clientY - rect.top;

  // รูปลอยตามนิ้ว (สำเนาที่กดไม่ได้) · ตัวจริงจางลงเป็นช่องว่างบอกตำแหน่งที่จะวาง
  const ghost = li.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, zIndex: '60', pointerEvents: 'none', margin: '0' });
  ghost.classList.add('opacity-90', 'shadow-xl', 'ring-2', 'ring-palm-500', 'rounded-xl', 'bg-surface', 'scale-[1.03]');
  document.body.appendChild(ghost);
  li.classList.add('opacity-30');
  document.documentElement.classList.add('select-none');
  // แผ่นใสเต็มจอเป็นตัวรับเมาส์/นิ้วตลอดการลาก — จุดจับอยู่ใน <li> ที่ถูกย้ายตำแหน่งใน DOM ระหว่างลาก
  // (ถ้าให้จุดจับรับเอง เบราว์เซอร์จะเลิกส่งเหตุการณ์ทันทีที่ <li> ถูกย้าย และรูปจะค้าง)
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[55] cursor-grabbing touch-none';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
  overlay.setPointerCapture(e.pointerId);

  let x = e.clientX, y = e.clientY, raf = 0, done = false;

  const frame = () => {
    if (done) return;
    // ชิดขอบจอ → เลื่อนหน้าให้เอง (มือถือ: ลากรูปไปท้ายหมวดได้โดยไม่ต้องปล่อย)
    const edge = 90;
    if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 6));
    else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - (window.innerHeight - edge)) / 6));
    ghost.style.left = `${x - offX}px`;
    ghost.style.top = `${y - offY}px`;
    const under = document.elementsFromPoint(x, y).find((n): n is HTMLElement => n instanceof HTMLElement && n.matches('li[data-photo-id]') && n.parentElement === ul);
    if (under) placeNear(ul, li, under);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const move = (ev: PointerEvent) => { x = ev.clientX; y = ev.clientY; };
  const finish = (cancel: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    overlay.remove();
    ghost.remove();
    li.classList.remove('opacity-30');
    document.documentElement.classList.remove('select-none');
    if (cancel) {
      const byId = new Map([...ul.querySelectorAll<HTMLElement>(':scope > li[data-photo-id]')].map((n) => [n.dataset.photoId!, n]));
      before.forEach((id) => { const n = byId.get(id); if (n) ul.appendChild(n); });
    }
    renumber(ul);
    if (!cancel) void save(ul, before);
  };
  const up = () => finish(false);
  const cancelled = () => finish(true);
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerup', up);
  overlay.addEventListener('pointercancel', cancelled);
  overlay.addEventListener('lostpointercapture', up);
}

// ---------- คีย์บอร์ด ----------
function attachKeyboard(ul: HTMLElement, handle: HTMLButtonElement) {
  let grabbed: { li: HTMLElement; before: string[] } | null = null;
  const li = () => handle.closest('li') as HTMLElement;
  const position = () => idsOf(ul).indexOf(li().dataset.photoId!) + 1;
  const drop = (cancel: boolean) => {
    if (!grabbed) return;
    const g = grabbed;
    grabbed = null;
    handle.setAttribute('aria-pressed', 'false');
    g.li.classList.remove('ring-2', 'ring-palm-500');
    if (cancel) {
      const byId = new Map([...ul.querySelectorAll<HTMLElement>(':scope > li[data-photo-id]')].map((n) => [n.dataset.photoId!, n]));
      g.before.forEach((id) => { const n = byId.get(id); if (n) ul.appendChild(n); });
      renumber(ul);
      handle.focus();
      say(`ยกเลิก รูปกลับไปอยู่ที่ตำแหน่ง ${position()}`);
    } else {
      void save(ul, g.before);
    }
  };
  handle.addEventListener('keydown', (e) => {
    if (saving) return;
    if (!grabbed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      grabbed = { li: li(), before: idsOf(ul) };
      handle.setAttribute('aria-pressed', 'true');
      li().classList.add('ring-2', 'ring-palm-500');
      say(`หยิบรูปที่ ${position()} แล้ว — ใช้ลูกศรเลื่อน กด Space หรือ Enter เพื่อวาง กด Esc เพื่อยกเลิก`);
      return;
    }
    if (!grabbed) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); drop(false); return; }
    if (e.key === 'Escape') { e.preventDefault(); drop(true); return; }
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp', fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!back && !fwd) return;
    e.preventDefault();
    const kids = [...ul.children];
    const i = kids.indexOf(grabbed.li);
    const to = i + (back ? -1 : 1);
    if (to < 0 || to >= kids.length) { say(`รูปอยู่ที่ตำแหน่ง ${i + 1} สุดทางแล้ว`); return; }
    placeNear(ul, grabbed.li, kids[to] as HTMLElement);
    renumber(ul);
    handle.focus(); // ย้าย DOM แล้วโฟกัสหลุด → ดึงกลับ
    say(`ย้ายไปตำแหน่ง ${position()} จาก ${kids.length}`);
  });
  // เสียโฟกัสจริง (กด Tab ไปที่อื่น) = ยกเลิก · แต่การย้าย <li> ใน DOM ทำให้เบราว์เซอร์ส่ง blur ชั่วคราวด้วย
  // จึงรอหนึ่งจังหวะ แล้วดูว่าโฟกัสกลับมาที่จุดจับแล้วหรือยัง (เรา focus() กลับให้หลังย้ายทุกครั้ง)
  handle.addEventListener('blur', () => { setTimeout(() => { if (grabbed && document.activeElement !== handle) drop(true); }, 0); });
}

document.querySelectorAll<HTMLElement>('ul[data-sortable]').forEach((ul) => {
  ul.addEventListener('pointerdown', (e) => {
    const handle = (e.target as Element).closest<HTMLElement>('[data-drag-handle]');
    if (!handle || saving || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const li = handle.closest('li') as HTMLElement | null;
    if (!li || li.parentElement !== ul) return;
    e.preventDefault();
    startPointerDrag(ul, li, e);
  });
  ul.querySelectorAll<HTMLButtonElement>('[data-drag-handle]').forEach((h) => attachKeyboard(ul, h));
  renumber(ul);
});
