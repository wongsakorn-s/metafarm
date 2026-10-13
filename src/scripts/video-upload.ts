// อัปโหลดวิดีโอจากหลังบ้าน: ตรวจไฟล์ในเครื่องก่อน (ชนิด/H.264/ขนาด) → ลบพิกัด GPS → ส่งด้วย PUT เป็น body ตรง ๆ พร้อมแถบความคืบหน้า
// ไม่มีคิวรอส่ง (ไฟล์ใหญ่เกินจะเก็บในเครื่อง) — สัญญาณหลุดให้กดส่งใหม่ · เซิร์ฟเวอร์ตรวจซ้ำทุกอย่าง (src/server/video.ts)
import { checkVideo, MAX_VIDEO_BYTES, scrubLocation, VIDEO_MIME } from '../lib/video';

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const fileReader = (f: File) => async (o: number, l: number) => new Uint8Array(await f.slice(o, o + l).arrayBuffer());

/** เตรียมไฟล์ที่จะส่ง: ลบพิกัดใน moov ที่ตำแหน่งเดิม (ขนาดไฟล์ไม่เปลี่ยน) */
async function prepare(file: File, moov: { offset: number; size: number }): Promise<Blob> {
  const patched = new Uint8Array(await file.slice(moov.offset, moov.offset + moov.size).arrayBuffer());
  if (scrubLocation(patched) === 0) return file;
  return new Blob([file.slice(0, moov.offset), patched, file.slice(moov.offset + moov.size)], { type: VIDEO_MIME });
}

function put(url: string, body: Blob, onProgress: (done: number, total: number) => void): Promise<{ status: number; json: { ok?: boolean; message?: string; redirect?: string } | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', VIDEO_MIME);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('network'));
    xhr.onload = () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* ไม่ใช่ JSON */ }
      resolve({ status: xhr.status, json });
    };
    xhr.send(body);
  });
}

for (const root of document.querySelectorAll<HTMLElement>('[data-video-upload]')) {
  const input = root.querySelector<HTMLInputElement>('input[type=file]')!;
  const btn = root.querySelector<HTMLButtonElement>('[data-start]')!;
  const bar = root.querySelector<HTMLProgressElement>('[data-progress]')!;
  const note = root.querySelector<HTMLElement>('[data-status]')!;
  let ready: { file: File; moov: { offset: number; size: number } } | null = null;

  const say = (msg: string, bad = false) => {
    note.textContent = msg;
    note.hidden = !msg;
    note.className = `rounded-xl p-3 text-sm font-medium ${bad ? 'bg-red-50 text-danger' : 'bg-honey-50 text-honey-700'}`;
  };

  input.addEventListener('change', async () => {
    ready = null;
    btn.disabled = true;
    bar.hidden = true;
    const file = input.files?.[0];
    if (!file) return say('');
    if (file.size > MAX_VIDEO_BYTES) return say(`ไฟล์ใหญ่ ${mb(file.size)} เกิน ${mb(MAX_VIDEO_BYTES)} — ลดคุณภาพ/ตัดคลิปให้สั้นลง (แนะนำ 720p)`, true);
    say('กำลังตรวจไฟล์…');
    try {
      const r = await checkVideo(file.size, fileReader(file));
      if (!r.ok) return say(r.error, true);
      ready = { file, moov: r.moov };
      say(`พร้อมอัปโหลด: ${mb(file.size)}${r.durationSec ? ` · ยาว ${Math.round(r.durationSec)} วินาที` : ''}`);
      btn.disabled = false;
    } catch {
      say('อ่านไฟล์ไม่ได้ — เลือกไฟล์ใหม่', true);
    }
  });

  btn.addEventListener('click', async () => {
    if (!ready) return;
    btn.disabled = true;
    input.disabled = true;
    bar.hidden = false;
    bar.value = 0;
    say('กำลังเตรียมไฟล์ (ลบพิกัด GPS)…');
    try {
      const body = await prepare(ready.file, ready.moov);
      say('กำลังอัปโหลด 0% — อย่าปิดหน้านี้');
      const res = await put(root.dataset.action!, body, (done, total) => {
        bar.value = Math.round((done / total) * 100);
        say(`กำลังอัปโหลด ${bar.value}% (${mb(done)} / ${mb(total)}) — อย่าปิดหน้านี้`);
      });
      if (res.json?.ok && res.json.redirect) { location.href = res.json.redirect; return; }
      say(res.json?.message ?? (res.status === 413 ? `ไฟล์ใหญ่เกิน ${mb(MAX_VIDEO_BYTES)}` : `อัปโหลดไม่สำเร็จ (${res.status})`), true);
    } catch {
      say('สัญญาณหลุดระหว่างอัปโหลด — ไม่ได้บันทึก ลองกดอัปโหลดอีกครั้ง (ที่ที่มีสัญญาณดีกว่า/ใช้ Wi-Fi)', true);
    }
    input.disabled = false;
    btn.disabled = false;
    bar.hidden = true;
  });
}
