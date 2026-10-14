// กฎและตัวช่วยของรูป/วิดีโอรัง (ไม่ผูกกับ runtime ทดสอบได้)

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB หลังย่อแล้วปกติไม่เกิน ~500 KB
export const MAX_FILES_PER_REQUEST = 6;

/** จำนวนสูงสุดต่อชนิด: รูปสมุดพก 6 + รูปสำหรับขาย 6 (แยกชุด เรียงลำดับแยกกัน) + วิดีโอ 1 คลิป ตามที่เจ้าของฟาร์มกำหนด, รูปสมุดพกเผื่อไว้ 6 */
export const LIMITS = { passport: 6, sale: 6, video: 1 } as const;
export type MediaKind = keyof typeof LIMITS;
export type ImageKind = Exclude<MediaKind, 'video'>;

export const kindLabel: Record<MediaKind, string> = {
  passport: 'รูปสมุดพก',
  sale: 'รูปสำหรับขาย',
  video: 'วิดีโอ',
};

export interface ImageType {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
}

/** ตรวจชนิดไฟล์จากไบต์แรก ๆ (ไม่เชื่อชื่อไฟล์/Content-Type ที่ผู้ใช้ส่งมา) — ไม่รับ SVG/GIF/HEIC */
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return { mime: 'image/png', ext: 'png' };
  const tag = (o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b.length >= 12 && tag(0, 'RIFF') && tag(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** ดึงรหัสวิดีโอ YouTube จากลิงก์แบบต่าง ๆ หรือรหัส 11 ตัวอักษรตรง ๆ */
export function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  if (YT_ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null | undefined;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, rest] = u.pathname.split('/');
    id = kind === 'watch' ? u.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(kind ?? '') ? rest : null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** ที่ว่างที่เหลือของแต่ละชนิด */
export function remainingSlots(kind: MediaKind, existing: number): number {
  return Math.max(0, LIMITS[kind] - existing);
}

/** ชื่อไฟล์ใน R2: hives/A25/sale-<uuid>.webp */
export function mediaKey(code: string, kind: ImageKind, id: string, ext: ImageType['ext']): string {
  return `hives/${code}/${kind}-${id}.${ext}`;
}

/** ข้อความสรุปผลอัปโหลด */
export function uploadSummary(added: number, skipped: { name: string; reason: string }[]): string {
  const parts: string[] = [];
  if (added) parts.push(`เพิ่มแล้ว ${added} รูป`);
  if (skipped.length) parts.push(`ข้าม ${skipped.length} ไฟล์ (${skipped.map((s) => `${s.name}: ${s.reason}`).join('; ')})`);
  return parts.join(' · ') || 'ไม่ได้เลือกไฟล์';
}

// ---------- ลบข้อมูลแฝงในรูป (EXIF: พิกัด GPS, รุ่นกล้อง, เวลา · XMP · IPTC) ----------
// รูปสมุดพก/รูปขาย/รูปสินค้าขึ้นหน้าสาธารณะ — เบราว์เซอร์ย่อรูปใหม่ก็จริง แต่ส่งไฟล์เดิมเมื่อรูปเล็กอยู่แล้ว
// หรือ JavaScript ใช้ไม่ได้ จึงลบซ้ำที่เซิร์ฟเวอร์ก่อนเก็บทุกรูป · อ่านโครงสร้างไม่ได้ = คืนไฟล์เดิม (ตรวจชนิดไฟล์แยกแล้ว)

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u32le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** ค่าการหมุนรูป (Orientation 1–8) จากข้อมูล APP1 ที่ขึ้นต้นด้วย "Exif\0\0" — ไม่พบ/อ่านไม่ได้ = 1 */
export function exifOrientation(p: Uint8Array): number {
  if (p.length < 16 || ascii(p, 0, 6) !== 'Exif\0\0') return 1;
  const order = ascii(p, 6, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const le = order === 'II';
  const r16 = (o: number) => (le ? p[o]! | (p[o + 1]! << 8) : u16be(p, o));
  const ifd = 6 + (le ? u32le(p, 10) : u32be(p, 10));
  if (ifd + 2 > p.length) return 1;
  for (let k = 0, n = r16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > p.length) break;
    if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

/** APP1 ที่มีแค่การหมุนรูป (EXIF เล็กที่สุด) — รูปที่กล้องบันทึกตะแคงไว้ยังแสดงถูกทิศหลังลบข้อมูลอื่น */
function orientationApp1(v: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, // APP1 ยาว 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 ที่ 8
    0x00, 0x01, // 1 รายการ
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, v, 0x00, 0x00, // Orientation (SHORT) = v
    0x00, 0x00, 0x00, 0x00, // ไม่มี IFD ถัดไป
  ]);
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let orientationKept = false;
  while (i < b.length) {
    if (b[i] !== 0xff || i + 1 >= b.length) return null;
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; } // ไบต์เติม
    if (m === 0xda || m === 0xd9) { out.push(b.subarray(i)); return concat(out); } // ข้อมูลภาพ (SOS) ถึงท้ายไฟล์ คัดลอกตามเดิม
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) return null;
    const end = i + 2 + u16be(b, i + 2);
    if (end <= i + 3 || end > b.length) return null;
    if (m === 0xe1) {
      // EXIF/XMP: ทิ้ง · เก็บไว้แค่การหมุนรูป
      const o = exifOrientation(b.subarray(i + 4, end));
      if (o > 1 && !orientationKept) { out.push(orientationApp1(o)); orientationKept = true; }
    } else if (m !== 0xed && m !== 0xfe) out.push(b.subarray(i, end)); // ทิ้ง IPTC (APP13) และความเห็น (COM) · เก็บที่เหลือ (JFIF, ICC, ตาราง, ขนาดภาพ)
    i = end;
  }
  return null;
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 12)];
  let i = 12;
  while (i + 8 <= b.length) {
    const tag = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    if (i + 8 + size > b.length) return null;
    const end = Math.min(b.length, i + 8 + size + (size & 1)); // ก้อนขนาดคี่มีไบต์เติม 1 ไบต์
    if (tag !== 'EXIF' && tag !== 'XMP ') parts.push(b.subarray(i, end));
    i = end;
  }
  const out = concat(parts);
  const size = out.length - 8;
  out.set([size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff], 4); // ขนาด RIFF ใหม่
  if (ascii(out, 12, 4) === 'VP8X') out[20]! &= ~0x0c; // ปิดธง "มี EXIF / มี XMP"
  return out;
}

function stripPng(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + u32be(b, i);
    if (end > b.length) return null;
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

/** รูปที่ลบข้อมูลแฝงแล้ว (JPEG/PNG/WebP) — ชนิดอื่นหรืออ่านโครงสร้างไม่ได้ คืนไฟล์เดิม */
export function stripMetadata(b: Uint8Array): Uint8Array {
  const t = detectImageType(b);
  const out = t?.ext === 'jpg' ? stripJpeg(b) : t?.ext === 'webp' ? stripWebp(b) : t?.ext === 'png' ? stripPng(b) : null;
  return out ?? b;
}

/** รูปที่เล็กกว่านี้ เมื่อขยายเต็มความกว้างจอมือถือ (ความละเอียด 2–3 เท่า) จะเบลอ — ไม่ใช้เป็นรูปหน้าแรก */
export const MIN_HERO_WIDTH = 800;

/** ความกว้างรูป (พิกเซล) จากหัวไฟล์ JPEG/PNG/WebP — อ่านไม่ได้ = null (ใช้ไบต์ต้นไฟล์ ~64 KB ก็พอ) */
export function imageWidth(b: Uint8Array): number | null {
  const t = detectImageType(b);
  if (t?.ext === 'png') return b.length >= 24 ? u32be(b, 16) : null;
  if (t?.ext === 'webp') {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8X' && b.length >= 27) return (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    if (chunk === 'VP8L' && b.length >= 25) return ((b[21]! | (b[22]! << 8)) & 0x3fff) + 1;
    if (chunk === 'VP8 ' && b.length >= 30) return (b[26]! | (b[27]! << 8)) & 0x3fff;
    return null;
  }
  if (t?.ext !== 'jpg') return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; }
    // SOF0–SOF15 ยกเว้น DHT (C4) JPG (C8) DAC (CC): ความสูง @+5 ความกว้าง @+7
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return u16be(b, i + 7);
    if (m === 0xda || m === 0xd9) return null;
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

// ---------- รูปย่อ (thumbnail) ----------
// เบราว์เซอร์ย่อรูปให้ตอนอัปโหลด (ด้านยาว 480px) เก็บที่ "thumb/<คีย์รูปเต็ม>"
// หน้าเว็บขอด้วย ?w=thumb — ถ้ายังไม่มีรูปย่อ (รูปเก่า) เซิร์ฟเวอร์ส่งรูปเต็มแทน จึงไม่มีรูปเสีย
export const THUMB_EDGE = 480;
export const MAX_THUMB_BYTES = 300 * 1024;
export const thumbKeyOf = (key: string) => `thumb/${key}`;
export const thumbUrl = (url: string) => `${url}?w=thumb`;
/** srcset สำหรับรูปที่แสดงใหญ่บ้างเล็กบ้าง: จอเล็ก/ช่องเล็กใช้รูปย่อ จอใหญ่ใช้รูปเต็ม */
export const photoSrcset = (url: string) => `${thumbUrl(url)} ${THUMB_EDGE}w, ${url} 1600w`;
