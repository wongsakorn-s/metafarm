// สคริปต์กลางของหลังบ้าน (โหลดทุกหน้าใน AdminLayout)
// 1) ยืนยันก่อนทำสิ่งที่ย้อนไม่ได้: <form data-confirm="ข้อความ {ชื่อช่อง}"> (data-confirm-when="ชื่อช่อง" = ถามเฉพาะเมื่อช่องนั้นมีค่า)
// 2) กันกดซ้ำ: ปิดปุ่มส่งหลังกด และแสดง "กำลังบันทึก…" (ฟอร์มที่สคริปต์หน้าเพจส่งเองด้วย fetch จะถูกข้าม)
// 3) ช่องที่กรอกผิด: ผูกข้อความสีแดงกับช่อง (aria) แล้วเลื่อนไปช่องแรกที่ผิด — ฟอร์มอยู่ล่างหน้าก็ไม่พลาด

/** แทน {ชื่อช่อง} ด้วยค่าที่เลือก (ใช้ข้อความของตัวเลือกใน select) */
export function fillConfirm(template: string, form: HTMLFormElement): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent?.trim() ?? '';
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return '';
  });
}

function confirmFor(form: HTMLFormElement): boolean {
  const template = form.dataset.confirm;
  if (!template) return true;
  const when = form.dataset.confirmWhen;
  if (when) {
    const el = form.elements.namedItem(when);
    if (!(el instanceof HTMLSelectElement || el instanceof HTMLInputElement) || !el.value) return true;
  }
  return confirm(fillConfirm(template, form));
}

// ช่วงจับ (capture) — ทำก่อนสคริปต์ของหน้าเพจ ถ้าผู้ใช้กดยกเลิก สคริปต์หน้าเพจจะไม่เริ่มอัปโหลด/ส่ง
document.addEventListener(
  'submit',
  (e) => {
    const form = e.target;
    if (form instanceof HTMLFormElement && !confirmFor(form)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);

// ช่วงขาออก — หลังสคริปต์ของหน้าเพจแล้ว ถ้ายังไม่มีใครรับไปส่งเอง (defaultPrevented) ให้ล็อกปุ่ม
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || e.defaultPrevented || form.method.toLowerCase() !== 'post') return;
  const buttons = [...form.querySelectorAll<HTMLButtonElement>('button[type=submit], button:not([type])')];
  // ปิดหลังเบราว์เซอร์เก็บข้อมูลฟอร์มแล้ว (ปิดทันทีอาจทำให้ค่าของปุ่มไม่ถูกส่ง)
  setTimeout(() => {
    for (const b of buttons) {
      b.dataset.label ??= b.textContent ?? '';
      b.disabled = true;
      b.textContent = 'กำลังบันทึก…';
    }
  }, 0);
});

// กลับมาหน้าเดิมด้วยปุ่มย้อนกลับ (bfcache) → ปุ่มต้องกดได้อีก
window.addEventListener('pageshow', () => {
  document.querySelectorAll<HTMLButtonElement>('button[data-label]').forEach((b) => {
    b.disabled = false;
    b.textContent = b.dataset.label ?? b.textContent;
    delete b.dataset.label;
  });
});

// ผูกข้อความผิดพลาดกับช่อง แล้วเลื่อนไปช่องแรกที่ผิด
const errors = [...document.querySelectorAll<HTMLElement>('form .error')];
errors.forEach((p, i) => {
  // ข้อความผิดต้องอยู่ในกล่องเดียวกับช่องของมัน (หรือระบุ data-for="id") — ถ้าอยู่ระดับฟอร์ม ไม่เดาว่าเป็นช่องไหน
  const parent = p.parentElement;
  const field = p.dataset.for ? document.getElementById(p.dataset.for) : parent && parent.tagName !== 'FORM' ? parent.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea') : null;
  if (!field) return;
  p.id ||= `err-${i}`;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), p.id].filter(Boolean).join(' '));
});
if (errors[0]) {
  const field = errors[0].parentElement?.querySelector<HTMLElement>('[aria-invalid=true]');
  errors[0].closest('details')?.setAttribute('open', '');
  errors[0].scrollIntoView({ block: 'center' });
  field?.focus({ preventScroll: true });
}
