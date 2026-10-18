import { describe, expect, it } from 'vitest';
import { acquiredLabel, keepThaiWords, originLabel, originText, speciesLabel } from './labels.ts';

describe('ป้ายบนหน้าสาธารณะ (เจ้าของขอ 2026-10-13)', () => {
  it('ชื่อสายพันธุ์: ตัดคำว่า "ชันโรง" ออก · ชื่ออื่นไม่เปลี่ยน · ไม่เหลือค่าว่าง', () => {
    expect(speciesLabel('ชันโรงขนเงิน')).toBe('ขนเงิน');
    expect(speciesLabel('ชันโรง ถ้วยดำ')).toBe('ถ้วยดำ');
    expect(speciesLabel('ขนเงิน')).toBe('ขนเงิน');
    expect(speciesLabel('ชันโรง')).toBe('ชันโรง');
  });
  it('ป้ายวันที่เริ่มต้น: ซื้อมา / เพาะนางพญาเอง-แยกรัง / อื่น ๆ', () => {
    expect(acquiredLabel('purchased')).toBe('ได้มาเมื่อ');
    expect(acquiredLabel('queen_bred')).toBe('แยกขยายรัง');
    expect(acquiredLabel('split')).toBe('แยกขยายรัง');
    expect(acquiredLabel('natural')).toBe('เริ่มรังเมื่อ');
    expect(acquiredLabel('unknown')).toBe('เริ่มรังเมื่อ');
  });
});

describe('ที่มาของรัง (เจ้าของขอ 2026-10-18)', () => {
  it('ขยายรัง → "ขยายรังโดย MetaFarm" ทั้งหลังบ้านและหน้าสาธารณะ', () => {
    expect(originLabel.split).toBe('ขยายรังโดย MetaFarm');
    expect(originText('split', null, 'MetaFarm')).toBe('ขยายรังโดย MetaFarm');
    expect(originText('purchased', 'ปัตตานี', 'MetaFarm')).toBe('ซื้อมาจากจังหวัดปัตตานี');
  });
});

describe('หัวข้อไม่ตัดกลางคำประสม (ฟอนต์ Sarabun 2026-10-18)', () => {
  it('แทรก word joiner ระหว่างพยางค์ ข้อความที่เห็นเหมือนเดิม', () => {
    const t = keepThaiWords('น้ำผึ้งชันโรงขนเงิน MetaFarm');
    expect(t).toBe('น้ำ\u2060ผึ้งชัน\u2060โรง\u2060ขน\u2060เงิน MetaFarm');
    expect(t.replaceAll('\u2060', '')).toBe('น้ำผึ้งชันโรงขนเงิน MetaFarm');
    expect(keepThaiWords('อบรม')).toBe('อบรม');
  });
});
