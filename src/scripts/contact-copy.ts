// ปุ่ม Messenger (Phase 5.4): ลิงก์ m.me มักไม่ใส่ข้อความให้ → คัดลอกข้อความสินค้าไว้ก่อน
// แล้วเปิดกล่องบอกขั้นตอน (ข้อความที่คัดลอก + 3 ขั้น + ปุ่ม "เปิด Messenger") ให้ลูกค้าแตะเปิดแชตเอง
// เดิมขึ้นคำบอก 0.6 วินาทีแล้วเปิดแชตเลย — ผู้สูงอายุไม่รู้ว่าต้องวาง เจ้าของฟาร์มได้แค่ "สวัสดี" ไม่รู้ว่าลูกค้าสนใจอะไร
// ใช้กับลิงก์ใน [data-contact-buttons] ที่มี data-copy · ไม่มี JS / คัดลอกไม่ได้ = เปิดลิงก์ตามปกติ

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

let dialog: HTMLDialogElement | null = null;
function copyDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const d = el('dialog', 'm-auto w-[min(92vw,26rem)] rounded-3xl border border-line bg-surface p-5 text-ink shadow-lg backdrop:bg-ink/50');
  d.setAttribute('aria-labelledby', 'copy-h');
  d.dataset.copyDialog = '';
  const h = el('h2', 'text-lg font-bold', 'คัดลอกข้อความไว้ให้แล้ว');
  h.id = 'copy-h';
  const msg = el('p', 'mt-2 break-words rounded-xl bg-palm-50 p-3 font-medium text-palm-900');
  msg.dataset.copyMsg = '';
  const steps = el('ol', 'mt-3 list-decimal space-y-1 pl-5 text-muted');
  for (const t of ['แตะ "เปิด Messenger" ด้านล่าง', 'กดค้างที่ช่องพิมพ์ข้อความ แล้วเลือก "วาง"', 'กดส่ง — ฟาร์มจะตอบกลับในแชต']) steps.appendChild(el('li', '', t));
  const open = el('a', 'btn-primary mt-4 w-full', 'เปิด Messenger');
  open.rel = 'noopener';
  open.dataset.copyOpen = '';
  open.addEventListener('click', () => d.close());
  const cancel = el('button', 'btn-ghost mt-2 w-full', 'ยกเลิก');
  cancel.type = 'button';
  cancel.addEventListener('click', () => d.close());
  // appendChild ทีละตัว (ชนิดของ Workers ทำให้ append หลายตัวใช้ไม่ได้)
  for (const child of [h, msg, steps, open, cancel]) d.appendChild(child);
  // แตะพื้นหลังนอกกล่อง = ปิด
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.appendChild(d);
  dialog = d;
  return d;
}

document.querySelectorAll<HTMLAnchorElement>('[data-contact-buttons] a[data-copy]').forEach((a) => {
  a.addEventListener('click', async (e) => {
    const text = a.dataset.copy;
    if (!text || !navigator.clipboard || typeof HTMLDialogElement !== 'function') return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ไม่ได้รับอนุญาตให้คัดลอก — เปิดแชตเลย (ลูกค้าพิมพ์เอง)
      location.assign(a.href);
      return;
    }
    const d = copyDialog();
    d.querySelector<HTMLElement>('[data-copy-msg]')!.textContent = text;
    d.querySelector<HTMLAnchorElement>('[data-copy-open]')!.href = a.href;
    d.showModal();
  });
});
