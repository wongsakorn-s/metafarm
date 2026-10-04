// หมายเหตุที่ขึ้นต้นด้วย "???" คือข้อมูลที่ยังไม่ทราบ (ตัวนำเข้า Excel ใส่ไว้ให้)
// เมื่อเจ้าของฟาร์มเติมข้อมูลที่ขาดแล้ว ให้ลบบรรทัด ??? ที่เกี่ยวข้องออกเอง

export const UNKNOWN_PREFIX = '???';

export interface HiveKnowledge {
  status: string;
  queenBornOn: string | null;
  acquiredOn: string | null;
  hasQueenSource: boolean;
  hasBroodSource: boolean;
}

/** หัวข้อที่ยังไม่ทราบ (ตัดคำว่า ??? ออก) */
export function unknownTopics(notes: string | null | undefined): string[] {
  return (notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(UNKNOWN_PREFIX))
    .map((l) => l.slice(UNKNOWN_PREFIX.length).trim());
}

const resolved = (topic: string, k: HiveKnowledge): boolean => {
  switch (topic) {
    case 'สถานะรัง':
      return k.status !== 'unknown';
    case 'วันเกิดนางพญา':
      return !!k.queenBornOn;
    case 'วันที่ซื้อ':
      return !!k.acquiredOn;
    case 'รังแม่ (ไข่นาง)':
      return k.hasQueenSource;
    case 'รังแม่ (ไข่อ่อน)':
      return k.hasBroodSource;
    case 'รังแม่ (ไข่อ่อนและไข่นาง)':
      return k.hasQueenSource && k.hasBroodSource;
    default:
      return false; // หัวข้อที่ไม่รู้จัก ปล่อยไว้ให้คนลบเอง
  }
};

/** เจ้าของฟาร์มยืนยันแล้วว่า "ไม่ทราบจริง ๆ" — เลิกเตือน (ไม่นับเป็นข้อมูลไม่ครบ) แต่ยังเก็บบันทึกไว้ */
export const CONFIRMED_UNKNOWN_PREFIX = 'ไม่ทราบ:';

/** เปลี่ยนบรรทัด "??? หัวข้อ" เป็น "ไม่ทราบ: หัวข้อ" (ถ้าไม่มีบรรทัดนั้นก็ไม่ทำอะไร) */
export function confirmUnknown(notes: string | null | undefined, topic: string): string | null {
  const lines = (notes ?? '').split('\n').map((l) => (l.trim() === `${UNKNOWN_PREFIX} ${topic}` ? `${CONFIRMED_UNKNOWN_PREFIX} ${topic}` : l));
  const out = lines.join('\n').trim();
  return out === '' ? null : out;
}

/** ลบบรรทัด ??? (และ "ไม่ทราบ:") ที่เติมข้อมูลครบแล้ว คืน null ถ้าไม่เหลืออะไร */
export function resolveUnknownNotes(notes: string | null | undefined, k: HiveKnowledge): string | null {
  const kept = (notes ?? '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      const prefix = t.startsWith(UNKNOWN_PREFIX) ? UNKNOWN_PREFIX : t.startsWith(CONFIRMED_UNKNOWN_PREFIX) ? CONFIRMED_UNKNOWN_PREFIX : null;
      return !(prefix && resolved(t.slice(prefix.length).trim(), k));
    })
    .join('\n')
    .trim();
  return kept === '' ? null : kept;
}
