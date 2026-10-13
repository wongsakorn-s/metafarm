// การตั้งค่าที่เจ้าของฟาร์มแก้เองได้จากหลังบ้าน (ช่องทางติดต่อ, ราคา/ระยะเวลาหลักสูตรอบรม)
// เก็บในตาราง settings แบบ key/value — ไม่ผูกกับ runtime จึงทดสอบได้
import { z } from 'zod';
import { HIVE_CODE_RE, normalizeHiveCode } from './hive-code.ts';
import { DEFAULT_FARM_LOCATION, parseLatLng, type FarmLocation } from './weather.ts';

export interface ContactSettings {
  lineId: string;
  phone: string;
  facebookUrl: string;
  /** ลิงก์ m.me ที่ใส่เอง (ว่าง = แปลงจากลิงก์ Facebook ให้ — ดู src/lib/contact.ts) */
  messengerUrl: string;
  /** ช่องทางหลัก = ปุ่มใหญ่บนเว็บ */
  primary: 'line' | 'messenger' | 'phone';
  mapUrl: string;
  /** false = ยังเป็นข้อมูลตัวอย่าง (เว็บขึ้นแถบเตือน) */
  confirmed: boolean;
}
export interface CourseOverride {
  priceThb?: number;
  duration?: string;
  confirmed?: boolean;
}
export interface SiteSettings {
  contact: ContactSettings;
  courses: Record<string, CourseOverride>;
  /** พิกัดฟาร์มสำหรับข้อมูลสภาพอากาศ · isDefault = ยังเป็นพิกัดประมาณ อ.ปลวกแดง */
  farm: FarmLocation & { isDefault: boolean };
  /** ช่องทางชำระเงิน (เลขบัญชี/พร้อมเพย์) ใส่ท้ายข้อความสรุปออเดอร์ที่ส่งให้ลูกค้าทาง LINE — หลังบ้านเท่านั้น */
  paymentInfo: string;
  /** รังที่ใช้รูปสมุดพกเป็นรูปหัวหน้าแรก (ว่าง = ใช้โลโก้) — เจ้าของเลือกเองในหลังบ้าน */
  heroHive: string;
  /** วิดีโอแนะนำฟาร์มบนหน้าแรก: ไฟล์ใน R2 (/video/*) หรือ YouTube · null = ยังไม่มี */
  homeVideo: ({ key: string; youtubeId?: undefined } | { youtubeId: string; key?: undefined }) & { seconds?: number } | null;
}

/** ค่าเริ่มต้น (ตัวอย่าง) ใช้จนกว่าเจ้าของฟาร์มจะบันทึกค่าจริง */
export const DEFAULT_CONTACT: ContactSettings = {
  lineId: '@metafarm-sample',
  phone: '080-000-0000',
  facebookUrl: 'https://www.facebook.com/metafarm.sample',
  messengerUrl: '',
  // เจ้าของคุยกับลูกค้าทาง Facebook/โทรเป็นหลัก (2026-10-08)
  primary: 'messenger',
  mapUrl: 'https://maps.google.com/?q=ปลวกแดง+ระยอง',
  confirmed: false,
};

// ---------- อ่านจากแถว key/value ----------

export function parseSettingRows(rows: { key: string; value: string }[]): SiteSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const has = (k: string) => map.has(k);
  const get = (k: string, d: string) => (has(k) ? map.get(k)! : d);

  const courses: Record<string, CourseOverride> = {};
  for (const [k, v] of map) {
    const m = /^course\.([a-z0-9-]+)\.(priceThb|duration|confirmed)$/.exec(k);
    if (!m) continue;
    const c = (courses[m[1]!] ??= {});
    if (m[2] === 'priceThb') c.priceThb = Number(v);
    else if (m[2] === 'duration') c.duration = v;
    else c.confirmed = v === '1';
  }
  return {
    contact: {
      lineId: get('contact.lineId', DEFAULT_CONTACT.lineId),
      phone: get('contact.phone', DEFAULT_CONTACT.phone),
      facebookUrl: get('contact.facebookUrl', DEFAULT_CONTACT.facebookUrl),
      messengerUrl: get('contact.messengerUrl', DEFAULT_CONTACT.messengerUrl),
      primary: (['line', 'messenger', 'phone'] as const).find((x) => x === map.get('contact.primary')) ?? DEFAULT_CONTACT.primary,
      mapUrl: get('contact.mapUrl', DEFAULT_CONTACT.mapUrl),
      confirmed: get('contact.confirmed', '0') === '1',
    },
    courses,
    paymentInfo: map.get('payment.info') ?? '',
    heroHive: map.get('site.heroHive') ?? '',
    homeVideo: map.get('home.videoKey') ? { key: map.get('home.videoKey')!, seconds: Number(map.get('home.videoSec')) || undefined } : map.get('home.videoYoutube') ? { youtubeId: map.get('home.videoYoutube')! } : null,
    farm: (() => {
      const lat = Number(map.get('farm.lat'));
      const lng = Number(map.get('farm.lng'));
      return Number.isFinite(lat) && Number.isFinite(lng) && map.has('farm.lat') ? { lat, lng, isDefault: false } : { ...DEFAULT_FARM_LOCATION, isDefault: true };
    })(),
  };
}

// ---------- ตัวช่วยแสดงผล ----------

/** ลิงก์เปิดแชต LINE พร้อมข้อความ (LINE OA ขึ้นต้นด้วย @ ใส่ข้อความให้ได้ ส่วน ID ส่วนตัวเปิดโปรไฟล์) */
export function lineChatUrl(c: Pick<ContactSettings, 'lineId'>, message?: string): string | null {
  const id = c.lineId.trim();
  if (!id) return null;
  if (id.startsWith('@')) {
    const base = `https://line.me/R/oaMessage/${encodeURIComponent(id)}/`;
    return message ? `${base}?${encodeURIComponent(message)}` : base;
  }
  return `https://line.me/ti/p/~${encodeURIComponent(id)}`;
}

/** tel: href (เก็บเฉพาะตัวเลขและ +) หรือ null ถ้าไม่มีเบอร์ */
export const telHref = (phone: string): string | null => {
  const n = phone.replace(/[^0-9+]/g, '');
  return n.length >= 8 ? `tel:${n}` : null;
};

/** ตัดคำว่า "(ตัวอย่าง)" ท้ายข้อความระยะเวลา (ค่าตั้งต้นในไฟล์เนื้อหามีคำนี้ติดอยู่) */
export const stripSampleMark = (s: string) => s.replace(/\s*\(ตัวอย่าง\)\s*$/, '').trim();

/** รวมข้อมูลหลักสูตรจากไฟล์ Markdown กับค่าที่เจ้าของฟาร์มแก้ไว้ */
export function effectiveCourse(base: { priceThb: number; duration: string; priceIsSample: boolean }, o: CourseOverride | undefined) {
  const duration = o?.duration ?? base.duration;
  return {
    priceThb: o?.priceThb ?? base.priceThb,
    // ยืนยันแล้ว = ไม่ใช่ตัวอย่างอีกต่อไป จึงไม่แสดงคำว่า "(ตัวอย่าง)"
    duration: o?.confirmed === true ? stripSampleMark(duration) : duration,
    // บันทึกในหลังบ้านและติ๊ก "ยืนยันแล้ว" จึงเลิกเป็นตัวอย่าง
    priceIsSample: o?.confirmed === true ? false : base.priceIsSample,
  };
}

// ---------- ตรวจค่าจากฟอร์ม ----------

const blank = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const checkbox = z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean());

const httpsUrl = (hosts: RegExp, what: string) =>
  z.preprocess(
    blank,
    z
      .string()
      .max(300, 'ลิงก์ยาวเกินไป')
      .refine((s) => {
        if (s === '') return true;
        try {
          const u = new URL(s);
          return u.protocol === 'https:' && hosts.test(u.hostname.toLowerCase());
        } catch {
          return false;
        }
      }, `ต้องเป็นลิงก์ https ของ ${what}`),
  );

export const contactSchema = z
  .object({
    lineId: z.preprocess(blank, z.string().refine((s) => s === '' || /^@?[A-Za-z0-9._-]{2,40}$/.test(s), 'LINE ID ใช้ได้เฉพาะ a-z 0-9 . _ - (LINE OA ขึ้นต้นด้วย @)')),
    phone: z.preprocess(blank, z.string().refine((s) => s === '' || (/^[0-9+\-\s()]{8,20}$/.test(s) && s.replace(/\D/g, '').length >= 8), 'เบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678)')),
    facebookUrl: httpsUrl(/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'),
    // ไม่ส่งมา (ฟอร์มเก่า) = ว่าง → แปลงจากลิงก์ Facebook ให้
    messengerUrl: z.preprocess((v) => v ?? '', httpsUrl(/^(m\.me|(www\.)?messenger\.com)$/, 'Messenger (m.me)')),
    primary: z.enum(['line', 'messenger', 'phone'], 'เลือกช่องทางหลัก').default('messenger'),
    mapUrl: httpsUrl(/^(maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.co)$/, 'Google Maps'),
    confirmed: checkbox,
  })
  .refine((d) => !d.confirmed || d.lineId !== '' || d.phone !== '' || d.facebookUrl !== '' || d.messengerUrl !== '', { message: 'ยืนยันข้อมูลจริงได้ต่อเมื่อมี LINE, Messenger หรือเบอร์โทรอย่างน้อยหนึ่งช่อง', path: ['confirmed'] });

export const courseSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  priceThb: z.preprocess(blank, z.coerce.number('ต้องเป็นตัวเลข').int('ต้องเป็นจำนวนเต็ม').min(1, 'ราคาต้องมากกว่า 0').max(1_000_000, 'ราคาสูงเกินไป')),
  duration: z.preprocess(blank, z.string().min(1, 'กรอกระยะเวลา (เช่น 1 วัน)').max(40, 'ยาวเกินไป')),
  confirmed: checkbox,
});

/** แปลงข้อมูลที่ตรวจแล้วเป็นแถว key/value เพื่อบันทึก */
export function contactToRows(d: z.output<typeof contactSchema>): { key: string; value: string }[] {
  return [
    { key: 'contact.lineId', value: d.lineId },
    { key: 'contact.phone', value: d.phone },
    { key: 'contact.facebookUrl', value: d.facebookUrl },
    { key: 'contact.messengerUrl', value: d.messengerUrl },
    { key: 'contact.primary', value: d.primary },
    { key: 'contact.mapUrl', value: d.mapUrl },
    { key: 'contact.confirmed', value: d.confirmed ? '1' : '0' },
  ];
}
export function courseToRows(d: z.output<typeof courseSchema>): { key: string; value: string }[] {
  return [
    { key: `course.${d.slug}.priceThb`, value: String(d.priceThb) },
    { key: `course.${d.slug}.duration`, value: d.confirmed ? stripSampleMark(d.duration) || d.duration : d.duration },
    { key: `course.${d.slug}.confirmed`, value: d.confirmed ? '1' : '0' },
  ];
}

/** พิกัดฟาร์ม: "12.98, 101.22" หรือวางลิงก์ Google Maps แบบยาว (ที่มี @lat,lng) */
export const locationSchema = z.object({
  coords: z.preprocess(blank, z.string().max(500).transform((v, ctx) => {
    const loc = parseLatLng(v);
    if (!loc) {
      ctx.addIssue({ code: 'custom', message: 'อ่านพิกัดไม่ได้ — ใส่แบบ 12.98, 101.22 (ละติจูด, ลองจิจูด ในประเทศไทย)' });
      return z.NEVER;
    }
    return loc;
  })),
});
export function locationToRows(d: z.output<typeof locationSchema>): { key: string; value: string }[] {
  return [
    { key: 'farm.lat', value: String(d.coords.lat) },
    { key: 'farm.lng', value: String(d.coords.lng) },
  ];
}

/** รูปหัวหน้าแรก: รหัสรัง (ว่าง = ใช้โลโก้) */
export const heroSchema = z.object({
  heroHive: z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? '' : (normalizeHiveCode(v) ?? v.trim())) : v), z.string().refine((c) => c === '' || HIVE_CODE_RE.test(c), 'ใส่รหัสรัง เช่น A25 หรือ B12 (เว้นว่าง = ใช้โลโก้)')),
});

export const paymentSchema = z.object({ paymentInfo: z.preprocess(blank, z.string().max(500, 'ยาวเกินไป (ไม่เกิน 500 ตัวอักษร)')) });
export const paymentToRows = (d: z.output<typeof paymentSchema>) => [{ key: 'payment.info', value: d.paymentInfo }];
