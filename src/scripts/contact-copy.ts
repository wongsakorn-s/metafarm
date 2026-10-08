// ปุ่ม Messenger (Phase 5.4): คัดลอกข้อความสินค้าไว้ก่อน แล้วค่อยเปิดแชต — ลิงก์ m.me มักไม่ใส่ข้อความให้
// ใช้กับลิงก์ใน [data-contact-buttons] ที่มี data-copy · ไม่มี JS / คัดลอกไม่ได้ = เปิดลิงก์ตามปกติ
document.querySelectorAll<HTMLAnchorElement>('[data-contact-buttons] a[data-copy]').forEach((a) => {
  a.addEventListener('click', async (e) => {
    const text = a.dataset.copy;
    if (!text || !navigator.clipboard) return;
    e.preventDefault();
    const status = a.closest('[data-contact-buttons]')?.querySelector<HTMLElement>('[data-copy-status]');
    try {
      await navigator.clipboard.writeText(text);
      if (status) {
        status.textContent = 'คัดลอกข้อความแล้ว — กดค้างในช่องพิมพ์ของ Messenger แล้ววางได้เลย';
        status.classList.remove('hidden');
      }
    } catch {
      /* ไม่ได้รับอนุญาตให้คัดลอก — เปิดแชตต่อได้ */
    }
    setTimeout(() => location.assign(a.href), 600);
  });
});
