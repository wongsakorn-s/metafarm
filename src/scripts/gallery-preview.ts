// สลับรูปพรีวิวบนหน้าเว็บเมื่อแตะ/คลิกรูปย่อ (ไม่ต้องเปิด lightbox ทุกครั้ง)
// และซิงก์รูปที่พรีวิวไปยัง lightbox เมื่อกดรูปใหญ่

export function initGalleryPreview() {
  document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((gallery) => {
    if (gallery.dataset.previewBound) return;
    gallery.dataset.previewBound = 'true';

    const rawLink = gallery.querySelector<HTMLAnchorElement>('[data-gallery-main]');
    const rawImg = gallery.querySelector<HTMLImageElement>('[data-gallery-img]');
    const rawVideo = gallery.querySelector<HTMLElement>('[data-gallery-video]');
    const iconSearch = gallery.querySelector<HTMLElement>('[data-gallery-icon-search]');
    const iconVideo = gallery.querySelector<HTMLElement>('[data-gallery-icon-video]');
    const counter = gallery.querySelector<HTMLElement>('[data-gallery-counter]');
    const expandBtn = gallery.querySelector<HTMLElement>('[data-gallery-expand]');
    const thumbs = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-thumb]')];

    if (!thumbs.length) return;

    function select(index: number, smoothScroll = true) {
      if (index < 0 || index >= thumbs.length) return;
      const thumb = thumbs[index];
      if (!thumb) return;

      const isVideo = thumb.dataset.isVideo === 'true';
      const src = thumb.dataset.src;
      const srcset = thumb.dataset.srcset;
      const alt = thumb.dataset.alt;
      const caption = thumb.dataset.caption;

      // ไฮไลต์รูปย่อที่เลือก
      thumbs.forEach((t, i) => {
        const active = i === index;
        t.setAttribute('aria-current', active ? 'true' : 'false');
        t.classList.toggle('ring-2', active);
        t.classList.toggle('ring-palm-600', active);
        t.classList.toggle('ring-offset-2', active);
        t.classList.toggle('ring-offset-surface', active);
        t.classList.toggle('opacity-70', !active);
        t.classList.toggle('opacity-100', active);
      });

      // เลื่อนรูปย่อมาไว้ตรงกลางแถบเลื่อน (สำหรับมือถือ)
      if (smoothScroll && typeof thumb.scrollIntoView === 'function') {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }

      if (isVideo) {
        if (rawLink) rawLink.classList.add('hidden');
        if (rawVideo) rawVideo.classList.remove('hidden');
        if (iconSearch) iconSearch.classList.add('hidden');
        if (iconVideo) iconVideo.classList.remove('hidden');
      } else {
        if (rawVideo) {
          rawVideo.classList.add('hidden');
          const vid = rawVideo.querySelector('video');
          if (vid && !vid.paused) vid.pause();
        }
        if (rawLink) {
          rawLink.classList.remove('hidden');
          if (src) rawLink.href = src;
          if (caption) rawLink.dataset.caption = caption;
          rawLink.dataset.zoomIndex = String(index);
        }
        if (iconSearch) iconSearch.classList.remove('hidden');
        if (iconVideo) iconVideo.classList.add('hidden');

        // เปลี่ยนรูปหลักแบบนุ่มนวล
        if (rawImg && src && rawImg.getAttribute('src') !== src) {
          rawImg.style.opacity = '0.7';
          const imgLoader = new Image();
          imgLoader.src = src;
          imgLoader.onload = () => {
            rawImg.src = src;
            if (srcset) rawImg.srcset = srcset;
            if (alt) rawImg.alt = alt;
            rawImg.style.opacity = '1';
          };
          imgLoader.onerror = () => {
            rawImg.src = src;
            rawImg.style.opacity = '1';
          };
        }
      }

      if (expandBtn) {
        expandBtn.dataset.zoomIndex = String(index);
      }

      // ปรับปรุงตัวบอกจำนวนรูป
      if (counter && thumbs.length > 1) {
        counter.textContent = `${index + 1}/${thumbs.length}`;
      }
    }

    thumbs.forEach((t, i) => {
      t.addEventListener('click', (e) => {
        e.preventDefault();
        select(i);
      });
    });

    // ซิงก์ตำแหน่งกลับเมื่อผู้ใช้เปิด Lightbox แล้วเลื่อนดูรูป
    window.addEventListener('lightbox:change', (e: Event) => {
      const customEvent = e as CustomEvent<{ gallery: HTMLElement; index: number }>;
      if (customEvent.detail && customEvent.detail.gallery === gallery) {
        select(customEvent.detail.index, true);
      }
    });
  });
}

// เริ่มทำงานเมื่อ DOM พร้อม
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGalleryPreview);
  } else {
    initGalleryPreview();
  }
}
