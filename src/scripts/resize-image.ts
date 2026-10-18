// ย่อรูปบนเครื่องผู้ใช้ก่อนอัปโหลด (ประหยัดเน็ตในสวน): ด้านยาวสุด ≤ 1600px, WebP (สำรอง JPEG)
// และทำรูปย่อ 480px + รูปกลาง 800px ไว้ให้หน้าเว็บใช้ในช่องเล็ก/กลาง (ถอดรหัสรูปครั้งเดียวได้ทั้งสองขนาด)
// ทำงานในเบราว์เซอร์เท่านั้น — ถ้าย่อไม่ได้ (เช่นไฟล์ที่เบราว์เซอร์ถอดรหัสไม่ได้) จะส่งไฟล์เดิมให้ server ตรวจแทน

const MAX_EDGE = 1600;
const THUMB_EDGE = 480; // ตรงกับ THUMB_EDGE ใน src/lib/media.ts
const MEDIUM_EDGE = 800; // ตรงกับ MEDIUM_EDGE ใน src/lib/media.ts
const QUALITY = 0.82;
const THUMB_QUALITY = 0.75;
const MEDIUM_QUALITY = 0.78;

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

/** วาดรูปลงผืนผ้าใบขนาดใหม่แล้วเข้ารหัส (WebP → สำรอง JPEG สำหรับ Safari เก่า) แล้วคืนหน่วยความจำทันที */
async function encode(bmp: ImageBitmap, maxEdge: number, quality: number): Promise<{ blob: Blob; scale: number } | null> {
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  canvas.width = canvas.height = 0; // มือถือ RAM น้อย
  return blob ? { blob, scale } : null;
}

const asFile = (blob: Blob, name: string, suffix = '') => new File([blob], `${baseName(name)}${suffix}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });

export interface Prepared {
  file: File;
  /** null = ทำรูปย่อไม่ได้ (หน้าเว็บจะใช้รูปเต็มแทน) */
  thumb: File | null;
  /** รูป 800px (null = ทำไม่ได้ หรือรูปเดิมเล็กกว่า 800px อยู่แล้ว → หน้าเว็บใช้รูปเต็มแทน) */
  medium: File | null;
}

export async function prepareImage(file: File): Promise<Prepared> {
  let bmp: ImageBitmap | undefined;
  try {
    // 'from-image' ทำให้รูปจากกล้องมือถือหมุนถูกทิศตามข้อมูล EXIF
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const full = await encode(bmp, MAX_EDGE, QUALITY);
    const small = await encode(bmp, THUMB_EDGE, THUMB_QUALITY);
    const thumb = small ? asFile(small.blob, file.name, '-thumb') : null;
    const mid = Math.max(bmp.width, bmp.height) > MEDIUM_EDGE ? await encode(bmp, MEDIUM_EDGE, MEDIUM_QUALITY) : null;
    const medium = mid ? asFile(mid.blob, file.name, '-med') : null;
    if (!full) return { file, thumb, medium };
    // ถ้าไฟล์เดิมเล็กกว่าอยู่แล้ว (และเป็นชนิดที่รับ) ไม่ต้องใช้ไฟล์ที่ย่อ
    if (full.scale === 1 && file.size <= full.blob.size && /^image\/(jpeg|png|webp)$/.test(file.type)) return { file, thumb, medium };
    return { file: asFile(full.blob, file.name), thumb, medium };
  } catch {
    return { file, thumb: null, medium: null };
  } finally {
    bmp?.close();
  }
}

/** ย่อรูปเดียว (หน้าสินค้า) */
export const resizeImage = async (file: File) => (await prepareImage(file)).file;

/**
 * ย่อทีละรูป (ไม่ทำพร้อมกัน) — รูปกล้อง 12 MP ใช้หน่วยความจำ ~50 MB ต่อรูปตอนถอดรหัส
 * ถ้าย่อ 6 รูปพร้อมกัน มือถือสเปกต่ำอาจรีโหลดหน้าเอง
 */
export async function resizeAll(files: File[], onEach?: (done: number, total: number) => void): Promise<Prepared[]> {
  const out: Prepared[] = [];
  for (const f of files) {
    out.push(await prepareImage(f));
    onEach?.(out.length, files.length);
  }
  return out;
}

/** ใส่รูปเต็ม + รูปย่อ + รูปกลางลงฟอร์ม (ลำดับตรงกัน: thumb/medium ที่ทำไม่ได้ส่งเป็นไฟล์ว่าง เซิร์ฟเวอร์จะข้าม) */
export function appendPrepared(fd: FormData, items: Prepared[]): void {
  for (const p of items) {
    fd.append('file', p.file, p.file.name);
    fd.append('thumb', p.thumb ?? new File([], 'none'), p.thumb?.name ?? 'none');
    fd.append('medium', p.medium ?? new File([], 'none'), p.medium?.name ?? 'none');
  }
}
