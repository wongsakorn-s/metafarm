/**
 * ข้อมูลฟาร์มที่ใช้ทั้งเว็บ — แก้ที่ไฟล์นี้ที่เดียว
 *
 * ⚠️ ช่องทางติดต่อด้านล่างเป็น "ตัวอย่าง" (SAMPLE) ยังไม่ใช่ข้อมูลจริง
 *    ต้องเปลี่ยนเป็นค่าจริงก่อนขึ้นออนไลน์ แล้วตั้ง contactIsSample เป็น false
 *    (ตอนที่ยังเป็นตัวอย่าง หน้าเว็บจะแสดงป้าย "ข้อมูลตัวอย่าง" และ build production จะเตือน)
 */
export const site = {
  name: 'MetaFarm',
  tagline: 'Palm Oil & Stingless Bee Farm',
  description:
    'ฟาร์มชันโรงขนเงินในสวนปาล์มน้ำมัน 50 ไร่ จ.ระยอง เลี้ยงในรังไม้สักที่ออกแบบเอง ทุกรังมีสมุดพกประวัติให้ตรวจสอบ',
  address: 'ต.หนองไร่ อ.ปลวกแดง จ.ระยอง',
  foundedYearBE: 2565,
  contactIsSample: true,
  contact: {
    lineId: '@metafarm-sample', // LINE OA ตัวอย่าง (ยังไม่มีอยู่จริง)
    phone: '080-000-0000', // เบอร์ตัวอย่าง
    facebookUrl: 'https://www.facebook.com/metafarm.sample', // ลิงก์ตัวอย่าง
    mapUrl: 'https://maps.google.com/?q=ปลวกแดง+ระยอง', // ค้นหาตามที่อยู่ ยังไม่ใช่พิกัดฟาร์ม
  },
} as const;

export const isSet = (v: string) => v.trim() !== '' && !v.startsWith('TODO');

/** ลิงก์เปิดแชต LINE พร้อมข้อความ (ใช้กับปุ่ม "สั่งทาง LINE") */
export function lineChatUrl(message?: string): string | null {
  const id = site.contact.lineId;
  if (!isSet(id)) return null;
  const base = id.startsWith('@')
    ? `https://line.me/R/oaMessage/${encodeURIComponent(id)}/`
    : `https://line.me/ti/p/~${encodeURIComponent(id)}`;
  return message && id.startsWith('@') ? `${base}?${encodeURIComponent(message)}` : base;
}
