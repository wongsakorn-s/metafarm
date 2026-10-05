// ข้อมูลโครงสร้าง (JSON-LD) ให้ Google เข้าใจหน้า: ฟาร์ม, สินค้า, รังที่ขาย, หลักสูตร
// กฎ: ใส่ราคา/เบอร์โทร "เฉพาะที่ยืนยันแล้ว" — ข้อมูลตัวอย่างห้ามไปอยู่ในผลค้นหา
import type { ContactSettings } from './settings.ts';

type Ld = Record<string, unknown>;
const abs = (origin: string, path: string) => new URL(path, origin).href;

/** แปลงเป็นข้อความสำหรับ <script type="application/ld+json"> — กัน "</script>" ในข้อมูลปิดแท็กก่อนเวลา */
export function ldJson(data: Ld | Ld[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function businessLd(site: { name: string; description: string; address: string }, contact: ContactSettings, origin: string): Ld {
  const sameAs = contact.confirmed && contact.facebookUrl ? [contact.facebookUrl] : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.name,
    description: site.description,
    url: abs(origin, '/'),
    image: abs(origin, '/brand/og.jpg'),
    logo: abs(origin, '/brand/logo-round.webp'),
    address: { '@type': 'PostalAddress', streetAddress: site.address, addressRegion: 'ระยอง', addressCountry: 'TH' },
    ...(contact.confirmed && contact.phone ? { telephone: contact.phone } : {}),
    ...(sameAs ? { sameAs } : {}),
  };
}

export interface LdOffer { name?: string; priceThb: number; confirmed: boolean; inStock: boolean }

/** สินค้า: ราคาที่ยังเป็นตัวอย่างจะไม่ถูกใส่เป็น Offer */
export function productLd(p: { name: string; description: string | null; url: string; image: string; brand: string }, offers: LdOffer[], origin: string): Ld {
  const confirmed = offers.filter((o) => o.confirmed);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    url: abs(origin, p.url),
    image: abs(origin, p.image),
    brand: { '@type': 'Brand', name: p.brand },
    ...(confirmed.length
      ? {
          offers: confirmed.map((o) => ({
            '@type': 'Offer',
            ...(o.name ? { name: o.name } : {}),
            price: o.priceThb,
            priceCurrency: 'THB',
            availability: o.inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
            url: abs(origin, p.url),
          })),
        }
      : {}),
  };
}

export function courseLd(c: { name: string; description: string; url: string; priceThb?: number; confirmed: boolean }, provider: string, origin: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: c.name,
    description: c.description,
    url: abs(origin, c.url),
    provider: { '@type': 'Organization', name: provider, sameAs: abs(origin, '/') },
    ...(c.confirmed && c.priceThb ? { offers: { '@type': 'Offer', price: c.priceThb, priceCurrency: 'THB', category: 'Paid' } } : {}),
  };
}

export function breadcrumbLd(items: [label: string, path: string][], origin: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(origin, path) })),
  };
}
