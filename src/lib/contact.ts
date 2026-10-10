// ปุ่มติดต่อ (Phase 5.4): LINE · Messenger · โทร — กดแล้วเด้งไปแชต/โทรหาเจ้าของ (ไม่ใช้ LINE OA / Messaging API)
// เจ้าของเลือก "ช่องทางหลัก" ในหลังบ้าน → ปุ่มใหญ่ · ช่องทางที่เหลือ (ที่กรอกไว้) เป็นปุ่มรอง · เว้นว่าง = ไม่แสดง
import { lineChatUrl, telHref, type ContactSettings } from './settings.ts';

export const CHANNELS = ['messenger', 'line', 'phone'] as const;
export type Channel = (typeof CHANNELS)[number];
export const channelName: Record<Channel, string> = { line: 'LINE', messenger: 'Messenger', phone: 'โทรศัพท์' };

/** บริบทของปุ่ม → คำบนปุ่ม */
export type Intent = 'ask' | 'order' | 'training' | 'queue';
const LABELS: Record<Intent, Record<Channel, string>> = {
  ask: { line: 'ทักไลน์สอบถาม', messenger: 'สอบถามทาง Messenger', phone: 'โทรสอบถาม' },
  order: { line: 'สั่งทางไลน์', messenger: 'สั่งทาง Messenger', phone: 'โทรสั่งซื้อ' },
  training: { line: 'สมัครทางไลน์', messenger: 'สมัครทาง Messenger', phone: 'โทรสมัครอบรม' },
  queue: { line: 'จองคิวทางไลน์', messenger: 'จองคิวทาง Messenger', phone: 'โทรจองคิว' },
};
export const actionLabel = (ch: Channel, intent: Intent = 'ask') => LABELS[intent][ch];
/** ป้ายสั้นสำหรับปุ่มรอง */
export const shortLabel: Record<Channel, string> = { line: 'LINE', messenger: 'Messenger', phone: 'โทร' };

// path ของ facebook.com ที่ไม่ใช่ชื่อเพจ/โปรไฟล์ (แปลงเป็น m.me ไม่ได้)
const NOT_A_NAME = new Set(['profile.php', 'people', 'pages', 'pg', 'groups', 'share', 'sharer', 'sharer.php', 'events', 'watch', 'marketplace', 'messages', 'login', 'home.php', 'permalink.php', 'story.php', 'photo', 'photo.php', 'reel', 'reels', 'hashtag']);

/**
 * ลิงก์ m.me ของเพจหรือโปรไฟล์ส่วนตัว — ใช้ลิงก์ Messenger ที่ใส่เองก่อน ไม่งั้นแปลงจากลิงก์ Facebook:
 *   facebook.com/<ชื่อ> · fb.com/<ชื่อ> · fb.me/<ชื่อ> → m.me/<ชื่อ>
 *   facebook.com/profile.php?id=<เลข> · facebook.com/people/<ชื่อ>/<เลข> → m.me/<เลข>
 *   ลิงก์แชร์ (facebook.com/share/...) แปลงไม่ได้ → null (ให้เจ้าของใส่ลิงก์ Messenger เอง)
 */
export function messengerBase(c: Pick<ContactSettings, 'facebookUrl' | 'messengerUrl'>): string | null {
  const own = c.messengerUrl.trim();
  if (own) return own.replace(/\/+$/, '').replace(/\?.*$/, '');
  const raw = c.facebookUrl.trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|web|mbasic)\./, '');
  if (!['facebook.com', 'fb.com', 'fb.me'].includes(host)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const id = (s: string | null | undefined) => (s && /^\d{5,}$/.test(s) ? s : null);
  if (parts[0] === 'profile.php') return id(u.searchParams.get('id')) ? `https://m.me/${u.searchParams.get('id')}` : null;
  if (parts[0] === 'people') return id(parts[2]) ? `https://m.me/${parts[2]}` : null;
  const name = parts[0];
  if (!name || NOT_A_NAME.has(name.toLowerCase()) || !/^[A-Za-z0-9.\-]{2,80}$/.test(name)) return null;
  return `https://m.me/${name}`;
}

/** ลิงก์ Messenger พร้อมข้อความ (?text= — Messenger บางรุ่นไม่ใส่ให้ ปุ่มจึงคัดลอกข้อความไว้ให้วางเองด้วย) */
export function messengerChatUrl(c: Pick<ContactSettings, 'facebookUrl' | 'messengerUrl'>, message?: string): string | null {
  const base = messengerBase(c);
  if (!base) return null;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** ลิงก์ Facebook ที่ใส่ไว้ (https เท่านั้น — ตั้งค่าตรวจโดเมนแล้ว) หรือ null */
const facebookPage = (url: string): string | null => (/^https:\/\//i.test(url.trim()) ? url.trim() : null);

export interface ContactAction {
  channel: Channel;
  href: string;
  /** ข้อความที่ส่งไปกับลิงก์ (LINE ใส่ในแชตให้ · Messenger คัดลอกไว้ให้วาง · โทร = สิ่งที่ควรบอก) */
  message?: string;
  primary: boolean;
}

/** ปุ่มที่ใช้ได้ เรียงช่องทางหลักก่อน (ถ้าช่องทางหลักไม่มีข้อมูล ปุ่มแรกที่มีจะเป็นปุ่มหลักแทน) */
export function contactActions(c: ContactSettings, message?: string): ContactAction[] {
  const href: Record<Channel, string | null> = {
    line: lineChatUrl(c, message),
    // ลิงก์ที่แปลงเป็น m.me ไม่ได้ (เช่นลิงก์แชร์ facebook.com/share/…) → เปิดหน้า Facebook นั้นแทน (มีปุ่ม "ส่งข้อความ")
    // เดิมปุ่มหายไปเลย ทั้งที่ Facebook เป็นช่องทางสั่งซื้อหลักของฟาร์ม
    messenger: messengerChatUrl(c, message) ?? facebookPage(c.facebookUrl),
    phone: telHref(c.phone),
  };
  const order = [c.primary, ...CHANNELS.filter((x) => x !== c.primary)];
  return order
    .filter((ch) => href[ch])
    .map((channel, i) => ({ channel, href: href[channel]!, message, primary: i === 0 }));
}
