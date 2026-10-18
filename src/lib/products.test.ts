import { describe, expect, it } from 'vitest';
import { formatPrice, orderMessage, priceRange, pricePer100ml, sizeLabel, stockLabel, variantName } from './products.ts';

describe('products helpers', () => {
  it('formatPrice', () => {
    expect(formatPrice(1590)).toBe('1,590 บาท');
    expect(formatPrice(250)).toBe('250 บาท');
  });
  it('orderMessage', () => {
    expect(orderMessage('รังเปล่า', { price: 690 })).toBe('สนใจสั่งซื้อ รังเปล่า ราคา 690 บาท');
    expect(orderMessage('น้ำผึ้ง', { variant: 'Size เล็ก 50 มล.', price: 250 })).toBe('สนใจสั่งซื้อ น้ำผึ้ง (Size เล็ก 50 มล.) ราคา 250 บาท');
    expect(orderMessage('', { code: 'A25', price: 1590 })).toBe('สนใจรัง A25 ราคา 1,590 บาท');
  });
  it('orderMessage ราคาตัวอย่าง ไม่ส่งตัวเลขไปในข้อความ LINE', () => {
    const m = orderMessage('น้ำผึ้ง', { variant: 'Size เล็ก 50 มล.', price: 250, sample: true });
    expect(m).not.toContain('250');
    expect(m).toContain('ขอทราบราคา');
  });
  it('stockLabel ไม่เปิดจำนวนสต็อก', () => {
    expect(stockLabel(true).text).toBe('มีสินค้า');
    expect(stockLabel(false).text).toContain('สอบถาม');
  });
  it('sizeLabel / pricePer100ml (ขนาดใหญ่คุ้มกว่า ตามที่ตั้งราคาไว้)', () => {
    expect(sizeLabel(50)).toBe('50 มล.');
    expect(sizeLabel(null)).toBeNull();
    expect(pricePer100ml(250, 50)).toBe(500);
    expect(pricePer100ml(550, 120)).toBe(458);
    expect(pricePer100ml(550, 120)).toBeLessThan(pricePer100ml(250, 50));
  });
});

describe('ราคาบนการ์ด (ไม่มีคำว่า "เริ่ม")', () => {
  it('ราคาเดียว / ราคาซ้ำ / ช่วงราคา / ไม่มีราคา', () => {
    expect(priceRange([350])).toBe('350 บาท');
    expect(priceRange([1600, 1600])).toBe('1,600 บาท');
    expect(priceRange([1800, 1600, 2000])).toBe('1,600–2,000 บาท');
    expect(priceRange([])).toBe('');
  });
});

describe('ชื่อตัวเลือกพร้อมขนาด', () => {
  it('ต่อขนาดให้ · ไม่ต่อซ้ำถ้าชื่อมีขนาดอยู่แล้ว · ไม่มีขนาด = ชื่อเดิม', () => {
    expect(variantName('Size เล็ก', 50)).toBe('Size เล็ก · 50 มล.');
    expect(variantName('ขวด 175 มล.', 175)).toBe('ขวด 175 มล.');
    expect(variantName('รังไม้สัก 2 ห้อง', null)).toBe('รังไม้สัก 2 ห้อง');
    expect(variantName('ขวด', 175, ' ')).toBe('ขวด 175 มล.');
  });
});
