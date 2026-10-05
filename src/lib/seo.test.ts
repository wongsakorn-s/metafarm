import { describe, expect, it } from 'vitest';
import { breadcrumbLd, businessLd, courseLd, ldJson, productLd } from './seo.ts';
import { DEFAULT_CONTACT } from './settings.ts';
import { originText } from './labels.ts';

const site = { name: 'MetaFarm', description: 'ฟาร์ม', address: 'ต.หนองไร่ อ.ปลวกแดง จ.ระยอง' };
const O = 'https://example.com';

describe('JSON-LD', () => {
  it('กัน </script> ในข้อมูล', () => {
    expect(ldJson({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
  it('ฟาร์ม: เบอร์/Facebook ตัวอย่างไม่ถูกใส่ ใส่เมื่อยืนยันแล้ว', () => {
    const sample = businessLd(site, DEFAULT_CONTACT, O);
    expect(sample).not.toHaveProperty('telephone');
    expect(sample).not.toHaveProperty('sameAs');
    const real = businessLd(site, { ...DEFAULT_CONTACT, phone: '081-234-5678', facebookUrl: 'https://www.facebook.com/metafarm', confirmed: true }, O);
    expect(real.telephone).toBe('081-234-5678');
    expect(real.sameAs).toEqual(['https://www.facebook.com/metafarm']);
  });
  it('สินค้า: ราคาตัวอย่างไม่เป็น Offer', () => {
    const p = { name: 'น้ำผึ้ง', description: null, url: '/products/stingless-honey', image: '/x.webp', brand: 'MetaFarm' };
    expect(productLd(p, [{ priceThb: 250, confirmed: false, inStock: true }], O)).not.toHaveProperty('offers');
    const ld = productLd(p, [{ priceThb: 250, confirmed: false, inStock: true }, { name: '120 มล.', priceThb: 550, confirmed: true, inStock: false }], O);
    expect(ld.offers).toEqual([expect.objectContaining({ price: 550, priceCurrency: 'THB', availability: 'https://schema.org/PreOrder' })]);
    expect(ld.url).toBe('https://example.com/products/stingless-honey');
  });
  it('หลักสูตร: ใส่ราคาเฉพาะที่ยืนยัน', () => {
    expect(courseLd({ name: 'แยกรัง', description: 'x', url: '/training/a', priceThb: 1500, confirmed: false }, 'MetaFarm', O)).not.toHaveProperty('offers');
    expect(courseLd({ name: 'แยกรัง', description: 'x', url: '/training/a', priceThb: 1500, confirmed: true }, 'MetaFarm', O).offers).toMatchObject({ price: 1500 });
  });
  it('breadcrumb เรียงลำดับและเป็น URL เต็ม', () => {
    const b = breadcrumbLd([['หน้าแรก', '/'], ['สมุดพก', '/passport'], ['A25', '/passport/A25']], O) as { itemListElement: { position: number; item: string }[] };
    expect(b.itemListElement.map((x) => x.position)).toEqual([1, 2, 3]);
    expect(b.itemListElement[2]!.item).toBe('https://example.com/passport/A25');
  });
});

describe('originText', () => {
  it('ซื้อมาแสดงแค่จังหวัด ไม่มีจังหวัดใช้ข้อความกลาง', () => {
    expect(originText('purchased', 'ชลบุรี', 'MetaFarm')).toBe('ซื้อมาจากจังหวัดชลบุรี');
    expect(originText('purchased', null, 'MetaFarm')).toBe('ซื้อมาจากผู้เลี้ยงภายนอก');
    expect(originText('split', null, 'MetaFarm')).toContain('MetaFarm');
    expect(originText('unknown', null, 'MetaFarm')).toBe('');
  });
});
