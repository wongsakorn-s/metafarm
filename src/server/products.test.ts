// ขนาด/ตัวเลือกสินค้า: เพิ่มขนาดใหม่ (น้ำผึ้ง 175 มล.) และซ่อนขนาดที่เลิกขาย
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addVariant, setVariantHidden, updateProductDescription } from './products.ts';
import { getPublicProducts } from './public.ts';
import { orderFormOptions } from './orders.ts';
import { honeyVariants } from './lots.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
const variants = async (productId: number) =>
  (await t.d1.prepare(`SELECT id, label, size_ml, price_thb, price_confirmed, stock_qty, harvest_year_be, sort_order, hidden FROM product_variants WHERE product_id = ? ORDER BY id`).bind(productId).all<Record<string, unknown>>()).results;

beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO products (id, slug, name, category, published) VALUES (1, 'stingless-honey', 'น้ำผึ้งชันโรงขนเงิน', 'honey', 1), (2, 'hive-box', 'รังเปล่า', 'hive_box', 1)`),
    t.d1.prepare(`INSERT INTO product_variants (id, product_id, label, size_ml, price_thb, stock_qty, harvest_year_be, sort_order) VALUES (1, 1, 'Size เล็ก', 50, 250, 3, 2569, 1), (2, 1, 'Size ใหญ่', 120, 550, 0, 2569, 2), (3, 2, 'รังไม้สัก 2 ห้อง', NULL, 690, 5, NULL, 1)`),
  ]);
}, 60_000);
afterAll(() => t?.close());

describe('เพิ่มขนาด', () => {
  it('น้ำผึ้ง 175 มล. 350 บาท: ราคายืนยันแล้ว สต็อก 0 ปีเก็บเกี่ยวตามขนาดเดิม ต่อท้ายลำดับ', async () => {
    expect((await addVariant(t.db, t.owner, { productId: 1, label: 'ขวด 175 มล.', sizeMl: 175, priceThb: 350 })).ok).toBe(true);
    expect((await variants(1)).at(-1)).toMatchObject({ label: 'ขวด 175 มล.', size_ml: 175, price_thb: 350, price_confirmed: 1, stock_qty: 0, harvest_year_be: 2569, sort_order: 3, hidden: 0 });
  });

  it('กดเพิ่มซ้ำ (หรือส่งพร้อมกัน) → ไม่ได้ขนาดซ้ำ', async () => {
    const d = { productId: 1, label: 'ขวด 175 มล.', sizeMl: 175, priceThb: 350 };
    await Promise.all([addVariant(t.db, t.owner, d), addVariant(t.db, t.owner, d)]);
    expect((await variants(1)).filter((v) => v.size_ml === 175)).toHaveLength(1);
  });

  it('น้ำผึ้งต้องมีขนาด มล. · สินค้าอื่นไม่ต้อง', async () => {
    expect(await addVariant(t.db, t.owner, { productId: 1, label: 'ขวดพิเศษ', priceThb: 100 })).toMatchObject({ ok: false });
    expect((await addVariant(t.db, t.owner, { productId: 2, label: 'รังไม้สัก 3 ห้อง', priceThb: 900 })).ok).toBe(true);
  });
});

describe('ซ่อนขนาดที่เลิกขาย', () => {
  it('ไม่แสดงบนเว็บ ในฟอร์มออเดอร์ใหม่ และการบรรจุขวด · แสดงกลับได้', async () => {
    await setVariantHidden(t.db, t.owner, { variantId: 1, hidden: true });
    await setVariantHidden(t.db, t.owner, { variantId: 2, hidden: true });
    const pub = (await getPublicProducts(t.db, 'stingless-honey'))[0]!;
    expect(pub.variants.map((v) => v.sizeMl)).toEqual([175]);
    expect((await orderFormOptions(t.db)).variants.map((v) => v.id)).not.toContain(1);
    expect((await honeyVariants(t.db)).map((v) => v.sizeMl)).toEqual([175]);

    await setVariantHidden(t.db, t.owner, { variantId: 2, hidden: false });
    expect((await getPublicProducts(t.db, 'stingless-honey'))[0]!.variants.map((v) => v.sizeMl)).toEqual([120, 175]);
  });
});

describe('คำอธิบายสินค้า', () => {
  it('แก้ได้ · เว้นว่าง = ไม่แสดง', async () => {
    await updateProductDescription(t.db, t.owner, { productId: 1, description: 'น้ำผึ้งชันโรงขนเงินจากสวนปาล์มของเรา' });
    expect((await getPublicProducts(t.db, 'stingless-honey'))[0]!.description).toBe('น้ำผึ้งชันโรงขนเงินจากสวนปาล์มของเรา');
    await updateProductDescription(t.db, t.owner, { productId: 1 });
    expect((await getPublicProducts(t.db, 'stingless-honey'))[0]!.description).toBeNull();
  });

  it('แก้ชื่อสินค้าได้ · ลิงก์ (slug) ไม่เปลี่ยน · ไม่ส่งชื่อ = คงชื่อเดิม', async () => {
    const before = (await getPublicProducts(t.db, 'stingless-honey'))[0]!;
    await updateProductDescription(t.db, t.owner, { productId: 1, name: 'น้ำผึ้งชันโรงขนเงิน (ชื่อใหม่)' });
    const after = (await getPublicProducts(t.db, 'stingless-honey'))[0]!;
    expect(after.name).toBe('น้ำผึ้งชันโรงขนเงิน (ชื่อใหม่)');
    expect(after.slug).toBe(before.slug);
    await updateProductDescription(t.db, t.owner, { productId: 1 });
    expect((await getPublicProducts(t.db, 'stingless-honey'))[0]!.name).toBe('น้ำผึ้งชันโรงขนเงิน (ชื่อใหม่)');
  });
});
