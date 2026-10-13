// วิดีโอ MP4/MOV: ตรวจโครงสร้างไฟล์ (กล่อง moov → codec/ความยาว) และลบพิกัด GPS ออกจากไฟล์ — ไม่ผูกกับ runtime ใช้ร่วมกันทั้งเบราว์เซอร์และเซิร์ฟเวอร์
// เบราว์เซอร์ตรวจ/ลบพิกัดก่อนส่ง · เซิร์ฟเวอร์ตรวจซ้ำหลังรับไฟล์ (อ่านเป็นช่วงจาก R2) — ไม่เชื่อสิ่งที่เบราว์เซอร์บอก

/** ขนาดสูงสุดต่อคลิป: คำขอเดียวของ Cloudflare Workers รับ body ได้ราว 100 MB (แผนฟรี) จึงเหลือที่ว่างไว้ */
export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
/** moov ของคลิปยาวหลายสิบนาทียังไม่เกินไม่กี่ MB — เกินนี้ถือว่าผิดปกติ */
const MAX_MOOV_BYTES = 8 * 1024 * 1024;

/** อ่านไบต์ช่วง [offset, offset+length) ของไฟล์ (อ่านเกินท้ายไฟล์ได้เท่าที่มี) */
export type Reader = (offset: number, length: number) => Promise<Uint8Array>;

export const VIDEO_MIME = 'video/mp4';
/** ภาพปกของวิดีโอ: ไฟล์ .jpg ชื่อเดียวกับวิดีโอ (ดึงเฟรมในเบราว์เซอร์ตอนอัปโหลด) */
export const posterKeyOf = (videoKey: string) => videoKey.replace(/\.mp4$/, '.jpg');
export const MAX_POSTER_BYTES = 600 * 1024;
/** codec ภาพที่เล่นได้เกือบทุกเครื่อง/เบราว์เซอร์ (H.264) — HEVC ของ iPhone ค่าเริ่มต้นเล่นไม่ได้บน Chrome/Android หลายรุ่น */
const OK_VIDEO = new Set(['avc1', 'avc3']);
const HEVC = new Set(['hvc1', 'hev1', 'dvh1', 'dvhe']);

export const HEVC_MESSAGE = 'วิดีโอนี้เป็นแบบ HEVC (iPhone ค่าเริ่มต้น) เครื่องของลูกค้าหลายเครื่องเล่นไม่ได้ — ตั้งค่า iPhone: การตั้งค่า > กล้อง > รูปแบบ > "เข้ากันได้มากที่สุด" แล้วถ่ายใหม่ หรือแปลงเป็น H.264 (MP4) ก่อนอัปโหลด';
export const NOT_MP4_MESSAGE = 'ไฟล์นี้ไม่ใช่วิดีโอ MP4/MOV ที่อ่านได้ — เลือกไฟล์ .mp4 (H.264)';

export type VideoCheck =
  | { ok: true; durationSec: number | null; moov: { offset: number; size: number } }
  | { ok: false; error: string };

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 4294967296 + u32(b, o + 4);
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

interface Box { type: string; start: number; hdr: number; size: number }

/** กล่องที่อยู่ติดกันในช่วง [from, to) ของไบต์ที่อ่านมา (ไม่เกิน 4096 กล่อง) */
function* boxesIn(b: Uint8Array, from: number, to: number): Generator<Box> {
  let o = from;
  for (let n = 0; n < 4096 && o + 8 <= to; n++) {
    let size = u32(b, o);
    let hdr = 8;
    if (size === 1) {
      if (o + 16 > to) return;
      size = u64(b, o + 8);
      hdr = 16;
    } else if (size === 0) size = to - o;
    if (size < hdr || o + size > to) return;
    yield { type: fourcc(b, o + 4), start: o, hdr, size };
    o += size;
  }
}

/** ชั้นบนสุดของไฟล์: หากล่อง moov (อาจอยู่ท้ายไฟล์ ซึ่งเป็นปกติของคลิปจากมือถือหลายรุ่น) */
async function findMoov(size: number, read: Reader): Promise<{ offset: number; size: number } | null> {
  let o = 0;
  let sawFtyp = false;
  for (let n = 0; n < 64 && o + 8 <= size; n++) {
    const h = await read(o, 16);
    if (h.length < 8) return null;
    let boxSize = u32(h, 0);
    const type = fourcc(h, 4);
    if (n === 0 && type !== 'ftyp') return null; // MP4/MOV ขึ้นต้นด้วย ftyp เสมอ
    if (type === 'ftyp') sawFtyp = true;
    if (boxSize === 1) {
      if (h.length < 16) return null;
      boxSize = u64(h, 8);
    } else if (boxSize === 0) boxSize = size - o;
    if (boxSize < 8 || o + boxSize > size) return null; // ไฟล์ขาด/เสีย
    if (type === 'moov') return sawFtyp ? { offset: o, size: boxSize } : null;
    o += boxSize;
  }
  return null;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/** ประเภทแทร็กและ codec ที่อยู่ใน moov: video sample entries, ความยาว (วินาที) */
export function readMoov(moov: Uint8Array): { videoCodecs: string[]; hasVideoTrack: boolean; durationSec: number | null } {
  const out = { videoCodecs: [] as string[], hasVideoTrack: false, durationSec: null as number | null };
  const walk = (from: number, to: number, track: { video: boolean }) => {
    for (const bx of boxesIn(moov, from, to)) {
      const p = bx.start + bx.hdr;
      const end = bx.start + bx.size;
      if (bx.type === 'mvhd') {
        const v = moov[p];
        const scale = v === 1 ? u32(moov, p + 20) : u32(moov, p + 12);
        const dur = v === 1 ? u64(moov, p + 24) : u32(moov, p + 16);
        out.durationSec = scale > 0 ? dur / scale : null;
      } else if (bx.type === 'hdlr') {
        if (fourcc(moov, p + 8) === 'vide') { track.video = true; out.hasVideoTrack = true; }
      } else if (bx.type === 'stsd' && track.video) {
        // version/flags (4) + จำนวน entry (4) แล้วเป็นกล่อง sample entry ติดกัน
        for (const e of boxesIn(moov, p + 8, end)) out.videoCodecs.push(e.type);
      } else if (CONTAINERS.has(bx.type)) {
        walk(p, end, bx.type === 'trak' ? { video: false } : track);
      }
    }
  };
  walk(0, moov.length, { video: false });
  return out;
}

/** ตรวจไฟล์ทั้งก้อนผ่าน reader: ต้องเป็น MP4/MOV ที่มี moov, ภาพเป็น H.264 */
export async function checkVideo(size: number, read: Reader): Promise<VideoCheck> {
  if (size < 1024) return { ok: false, error: 'ไฟล์เล็ก/ว่างเกินไป' };
  if (size > MAX_VIDEO_BYTES) return { ok: false, error: `ไฟล์ใหญ่เกิน ${MAX_VIDEO_BYTES / 1048576} MB — ลดคุณภาพ/ตัดคลิปให้สั้นลง (แนะนำ 720p)` };
  const at = await findMoov(size, read);
  if (!at) return { ok: false, error: NOT_MP4_MESSAGE };
  if (at.size > MAX_MOOV_BYTES) return { ok: false, error: NOT_MP4_MESSAGE };
  const moov = await read(at.offset, at.size);
  if (moov.length !== at.size) return { ok: false, error: NOT_MP4_MESSAGE };
  const info = readMoov(moov);
  if (!info.hasVideoTrack || info.videoCodecs.length === 0) return { ok: false, error: 'ไม่พบภาพวิดีโอในไฟล์นี้' };
  if (info.videoCodecs.some((c) => HEVC.has(c))) return { ok: false, error: HEVC_MESSAGE };
  if (!info.videoCodecs.every((c) => OK_VIDEO.has(c))) return { ok: false, error: `ไฟล์นี้ใช้ codec ภาพ "${info.videoCodecs.join(', ')}" ซึ่งเล่นบนเว็บไม่ได้ทั่วไป — ใช้ MP4 แบบ H.264` };
  return { ok: true, durationSec: info.durationSec, moov: at };
}

// ---------- พิกัด GPS ----------

/** สตริงพิกัดแบบ ISO 6709 เช่น +13.7563+100.5018+005.000/ (มือถือฝังไว้ในกล่อง ©xyz และ metadata ของ Apple) */
const ISO6709 = /[+-]\d{2,3}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\//g;
const LOCATION_BOXES: [string, number[]][] = [['©xyz', [0xa9, 0x78, 0x79, 0x7a]], ['loci', [0x6c, 0x6f, 0x63, 0x69]]];
const FREE = [0x66, 0x72, 0x65, 0x65];

/** ตำแหน่งกล่องพิกัด (ชื่อกล่อง ©xyz/loci ที่ขนาดสมเหตุผล) ใน moov */
function locationBoxes(moov: Uint8Array): { at: number; size: number }[] {
  const found: { at: number; size: number }[] = [];
  for (const [, pat] of LOCATION_BOXES) {
    for (let i = 4; i + 4 <= moov.length; i++) {
      if (moov[i] !== pat[0] || moov[i + 1] !== pat[1] || moov[i + 2] !== pat[2] || moov[i + 3] !== pat[3]) continue;
      const size = u32(moov, i - 4);
      if (size >= 8 && i - 4 + size <= moov.length) found.push({ at: i - 4, size });
    }
  }
  return found;
}

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};

/** moov นี้ยังมีพิกัดอยู่ไหม */
export function hasLocation(moov: Uint8Array): boolean {
  if (locationBoxes(moov).some((b) => moov.subarray(b.at + 8, b.at + b.size).some((x) => x !== 0))) return true;
  return new RegExp(ISO6709.source).test(latin1(moov));
}

/**
 * ลบพิกัดใน moov "ในที่เดิม" ขนาดไม่เปลี่ยน (ตำแหน่งข้อมูลวิดีโอในไฟล์จึงไม่ขยับ):
 * กล่อง ©xyz / loci → เปลี่ยนชื่อเป็น free แล้วเติมศูนย์ · สตริงพิกัด ISO 6709 ที่เหลือ (metadata ของ Apple) → ศูนย์
 * คืนจำนวนที่แก้
 */
export function scrubLocation(moov: Uint8Array): number {
  let n = 0;
  for (const b of locationBoxes(moov)) {
    moov.set(FREE, b.at + 4);
    moov.fill(0, b.at + 8, b.at + b.size);
    n++;
  }
  const text = latin1(moov);
  ISO6709.lastIndex = 0;
  for (let m = ISO6709.exec(text); m; m = ISO6709.exec(text)) {
    moov.fill(0x30, m.index, m.index + m[0].length - 1); // '0' แทนตัวเลข/เครื่องหมาย (คง '/' ไว้)
    n++;
  }
  ISO6709.lastIndex = 0;
  return n;
}
