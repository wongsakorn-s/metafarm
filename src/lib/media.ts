// กฎและตัวช่วยของรูป/วิดีโอรัง (ไม่ผูกกับ runtime ทดสอบได้)

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB หลังย่อแล้วปกติไม่เกิน ~500 KB
export const MAX_FILES_PER_REQUEST = 6;

/** จำนวนสูงสุดต่อชนิด: รูปขาย 3 รูป + วิดีโอ 1 คลิป ตามที่เจ้าของฟาร์มกำหนด, รูปสมุดพกเผื่อไว้ 6 */
export const LIMITS = { passport: 6, sale: 3, video: 1 } as const;
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

// ---------- รูปย่อ (thumbnail) ----------
// เบราว์เซอร์ย่อรูปให้ตอนอัปโหลด (ด้านยาว 480px) เก็บที่ "thumb/<คีย์รูปเต็ม>"
// หน้าเว็บขอด้วย ?w=thumb — ถ้ายังไม่มีรูปย่อ (รูปเก่า) เซิร์ฟเวอร์ส่งรูปเต็มแทน จึงไม่มีรูปเสีย
export const THUMB_EDGE = 480;
export const MAX_THUMB_BYTES = 300 * 1024;
export const thumbKeyOf = (key: string) => `thumb/${key}`;
export const thumbUrl = (url: string) => `${url}?w=thumb`;
/** srcset สำหรับรูปที่แสดงใหญ่บ้างเล็กบ้าง: จอเล็ก/ช่องเล็กใช้รูปย่อ จอใหญ่ใช้รูปเต็ม */
export const photoSrcset = (url: string) => `${thumbUrl(url)} ${THUMB_EDGE}w, ${url} 1600w`;
