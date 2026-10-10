// ใส่สินค้าตั้งต้น (รังเปล่า, น้ำผึ้ง) ในฐานข้อมูลบนเครื่อง — ราคาเป็น "ตัวอย่าง" (price_confirmed = 0)
//   npm run products:seed:local
// รันซ้ำได้อย่างปลอดภัย: ไม่ทับสินค้าที่มีอยู่แล้ว และไม่ทับราคาที่เจ้าของฟาร์มแก้ในหลังบ้านไปแล้ว
// (รังสมบูรณ์ไม่อยู่ในตารางนี้ — ดึงจากรังที่ตั้งขายในทะเบียนรังโดยตรง)
import { getPlatformProxy } from 'wrangler';

const PRODUCTS = [
  {
    slug: 'hive-box',
    name: 'รังเปล่า (รังไม้สัก 2 ห้อง)',
    category: 'hive_box',
    sortOrder: 20,
    description:
      'รังเลี้ยงชันโรงขนเงินที่ MetaFarm ออกแบบเอง เป็นรัง 2 ห้องแนวนอน ทำจากไม้สักทั้งหลัง ภายนอกทาเคลือบด้วยโพลียูรีเทนสูตรน้ำ เพื่อเพิ่มอายุการใช้งาน',
    variants: [{ label: 'รังเปล่า 1 รัง', sizeMl: null, priceThb: 690, harvestYearBe: null }],
  },
  {
    slug: 'stingless-honey',
    name: 'น้ำผึ้งชันโรงขนเงิน ปี 2569',
    category: 'honey',
    sortOrder: 30,
    description: 'น้ำผึ้งชันโรงขนเงินจากสวนปาล์มของ MetaFarm จ.ระยอง รสเปรี้ยวอมหวานแบบน้ำผึ้งชันโรง',
    variants: [
      { label: 'Size เล็ก', sizeMl: 50, priceThb: 250, harvestYearBe: 2569 },
      { label: 'Size ใหญ่', sizeMl: 120, priceThb: 550, harvestYearBe: 2569 },
    ],
  },
] as const;

// --sql: พิมพ์ SQL (รันซ้ำได้) แทนการเขียนฐานข้อมูลในเครื่อง — สำหรับ production:
//   npm run products:seed:local -- --sql > private/products.sql
//   npx wrangler d1 execute metafarm-db --remote --file private/products.sql
// (ตัวเลือกขนาดตรวจซ้ำด้วย label จึงไม่ซ้ำถ้ารันอีก แต่ถ้าเปลี่ยนชื่อ label แล้วรันใหม่จะเพิ่มตัวเลือกใหม่)
if (process.argv.includes('--sql')) {
  const s = (v: string | number | null) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
  const out: string[] = ['-- สร้างโดย scripts/seed-products.ts --sql (รันซ้ำได้ ไม่ทับสินค้า/ราคาที่มีอยู่)'];
  for (const p of PRODUCTS) {
    out.push(
      `INSERT INTO products (slug, name, category, description, published, sort_order) SELECT ${s(p.slug)}, ${s(p.name)}, ${s(p.category)}, ${s(p.description)}, 1, ${p.sortOrder} WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = ${s(p.slug)});`,
    );
    for (const [i, v] of p.variants.entries()) {
      const pid = `(SELECT id FROM products WHERE slug = ${s(p.slug)})`;
      out.push(
        `INSERT INTO product_variants (product_id, label, size_ml, price_thb, price_confirmed, stock_qty, harvest_year_be, sort_order) SELECT ${pid}, ${s(v.label)}, ${s(v.sizeMl)}, ${v.priceThb}, 0, 0, ${s(v.harvestYearBe)}, ${i} WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = ${pid} AND label = ${s(v.label)});`,
      );
    }
  }
  console.log(out.join('\n'));
  process.exit(0);
}

const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
let created = 0, kept = 0;
try {
  for (const p of PRODUCTS) {
    const exists = await env.DB.prepare('SELECT id FROM products WHERE slug = ?1').bind(p.slug).first<{ id: number }>();
    if (exists) { kept++; continue; }
    const r = await env.DB.prepare('INSERT INTO products (slug, name, category, description, published, sort_order) VALUES (?1, ?2, ?3, ?4, 1, ?5)')
      .bind(p.slug, p.name, p.category, p.description, p.sortOrder).run();
    const id = r.meta.last_row_id;
    for (const [i, v] of p.variants.entries()) {
      await env.DB.prepare('INSERT INTO product_variants (product_id, label, size_ml, price_thb, price_confirmed, stock_qty, harvest_year_be, sort_order) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6)')
        .bind(id, v.label, v.sizeMl, v.priceThb, v.harvestYearBe, i).run();
    }
    created++;
  }
} finally {
  await dispose();
}
console.log(`สร้างสินค้าใหม่ ${created} · มีอยู่แล้ว (ไม่แตะ) ${kept}`);
