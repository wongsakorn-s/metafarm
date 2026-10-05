// ย่อรูปบนเครื่องผู้ใช้ก่อนอัปโหลด (ประหยัดเน็ตในสวน): ด้านยาวสุด ≤ 1600px, WebP (สำรอง JPEG)
// ทำงานในเบราว์เซอร์เท่านั้น — ถ้าย่อไม่ได้ (เช่นไฟล์ที่เบราว์เซอร์ถอดรหัสไม่ได้) จะส่งไฟล์เดิมให้ server ตรวจแทน

const MAX_EDGE = 1600;
const QUALITY = 0.82;

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

export async function resizeImage(file: File): Promise<File> {
  try {
    // 'from-image' ทำให้รูปจากกล้องมือถือหมุนถูกทิศตามข้อมูล EXIF
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();

    // บางเบราว์เซอร์ (Safari เก่า) เข้ารหัส WebP ไม่ได้และให้ PNG แทน → ใช้ JPEG
    let blob = await toBlob(canvas, 'image/webp', QUALITY);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', QUALITY);
    if (!blob) return file;

    // ถ้าไฟล์เดิมเล็กกว่าอยู่แล้ว (และเป็นชนิดที่รับ) ไม่ต้องใช้ไฟล์ที่ย่อ
    if (scale === 1 && file.size <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;

    canvas.width = canvas.height = 0; // คืนหน่วยความจำทันที (มือถือ RAM น้อย)
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
  } catch {
    return file;
  }
}

/**
 * ย่อทีละรูป (ไม่ทำพร้อมกัน) — รูปกล้อง 12 MP ใช้หน่วยความจำ ~50 MB ต่อรูปตอนถอดรหัส
 * ถ้าย่อ 6 รูปพร้อมกัน มือถือสเปกต่ำอาจรีโหลดหน้าเอง
 */
export async function resizeAll(files: File[], onEach?: (done: number, total: number) => void): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    out.push(await resizeImage(f));
    onEach?.(out.length, files.length);
  }
  return out;
}
