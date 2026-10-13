import type { IconName } from './icons.ts';
// ป้ายภาษาไทยของค่าในฐานข้อมูล
export const statusLabel = { active: 'ยังอยู่', sold: 'ขายแล้ว', collapsed: 'ล่ม', unknown: 'ไม่ทราบสถานะ' } as const;
export const statusClass = {
  active: 'bg-palm-100 text-palm-900',
  sold: 'bg-honey-100 text-honey-700',
  collapsed: 'bg-red-100 text-danger',
  unknown: 'bg-slate-200 text-slate-700',
} as const;

export const originLabel = {
  purchased: 'ซื้อมา',
  queen_bred: 'เพาะนางพญาเอง',
  split: 'ขยายรัง',
  natural: 'ขยายเองตามธรรมชาติ',
  unknown: 'ไม่ทราบที่มา',
} as const;

/** ชื่อสายพันธุ์บนหน้าสาธารณะ: ตัดคำว่า "ชันโรง" ออก ("ชันโรงขนเงิน" → "ขนเงิน") — เจ้าของขอ 2026-10-13 · หลังบ้านใช้ชื่อเต็ม */
export const speciesLabel = (name: string) => name.replace(/^ชันโรง\s*/, '') || name;

/** ป้ายวันที่เริ่มต้นของรัง: ซื้อมา = ได้มาเมื่อ · เพาะนางพญาเอง/แยกรัง = แยกขยายรัง · อื่น ๆ = เริ่มรังเมื่อ */
export const acquiredLabel = (origin: string) => (origin === 'purchased' ? 'ได้มาเมื่อ' : origin === 'queen_bred' || origin === 'split' ? 'แยกขยายรัง' : 'เริ่มรังเมื่อ');

export const boxLabel = { metafarm: 'รัง MetaFarm', teak_2room: 'รังไม้ 2 ห้อง', log: 'รังไม้', other: 'อื่น ๆ', unknown: '???' } as const;

export const eventLabel = {
  honey_harvest: 'เก็บน้ำหวาน',
  queen_cell_taken: 'เก็บไข่นางพญา',
  brood_split: 'แยกไข่อ่อน/ตัวงาน',
  note: 'หมายเหตุ',
  status_change: 'เปลี่ยนสถานะ',
} as const;
/** ไอคอนของเหตุการณ์ (ชื่อใน src/lib/icons.ts) */
export const eventIcon = { honey_harvest: 'honey', queen_cell_taken: 'queen', brood_split: 'brood', note: 'note', status_change: 'status' } as const satisfies Record<string, IconName>;

export const baht = (n: number | null | undefined) => (n == null ? '???' : `${n.toLocaleString('th-TH')} บาท`);

/**
 * ที่มาของรังสำหรับหน้าสาธารณะ (ใช้ร่วมกัน: การ์ดรังขาย, หน้ารังขาย, สมุดพก)
 * รังที่ซื้อมาแสดงแค่จังหวัด — ไม่เปิดชื่อผู้ขาย/ที่อยู่เต็ม
 */
export function originText(origin: string, province: string | null | undefined, farm: string): string {
  switch (origin) {
    case 'purchased': return province ? `ซื้อมาจากจังหวัด${province}` : 'ซื้อมาจากผู้เลี้ยงภายนอก';
    case 'queen_bred': return `เพาะนางพญาเองที่ ${farm}`;
    case 'split': return `ขยายรังเองที่ ${farm} (แยกจากรังแม่)`;
    case 'natural': return 'ขยายเองตามธรรมชาติ';
    default: return '';
  }
}
