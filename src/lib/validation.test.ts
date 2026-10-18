import { describe, expect, it } from 'vitest';
import { broodSplitSchema, editHiveSchema, honeyHarvestSchema, newHiveSchema, parseForm, productTextSchema, queenCellSchema, publishSchema, saleSchema, statusSchema, todayBangkok, variantSchema } from './validation.ts';

const form = (o: Record<string, string>) => Object.assign(new FormData(), {}) && Object.entries(o).reduce((f, [k, v]) => (f.append(k, v), f), new FormData());
const today = todayBangkok();

describe('honeyHarvestSchema', () => {
  it('รับ มล./กรัม และแปลงเป็นตัวเลข', () => {
    const r = parseForm(honeyHarvestSchema, form({ occurredOn: today, honeyMl: '250', propolisG: '', note: ' ทดสอบ ' }));
    expect(r).toMatchObject({ ok: true, data: { honeyMl: 250, propolisG: undefined, note: 'ทดสอบ' } });
  });
  it('ต้องมีปริมาณอย่างน้อยหนึ่งช่อง', () => {
    const r = parseForm(honeyHarvestSchema, form({ occurredOn: today }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.honeyMl).toContain('อย่างน้อย 1 ช่อง');
  });
  it('ไม่รับค่าติดลบ ทศนิยม และวันที่ในอนาคต', () => {
    const bad = (o: Record<string, string>) => parseForm(honeyHarvestSchema, form({ occurredOn: today, honeyMl: '10', ...o })).ok;
    expect(bad({ honeyMl: '-5' })).toBe(false);
    expect(bad({ honeyMl: '1.5' })).toBe(false);
    expect(bad({ honeyMl: 'abc' })).toBe(false);
    expect(bad({ occurredOn: '2999-01-01' })).toBe(false);
    expect(bad({ occurredOn: '2026-02-31' })).toBe(false);
  });
});

describe('queenCell / brood split', () => {
  it('รหัสรังเป้าหมายแปลงเป็นตัวพิมพ์ใหญ่และตรวจรูปแบบ', () => {
    expect(parseForm(queenCellSchema, form({ occurredOn: today, queenCells: '2', targetCode: ' a12 ' }))).toMatchObject({ ok: true, data: { targetCode: 'A12', queenCells: 2 } });
    // ตัวอักษรอื่นได้ (B1, G108) · เลขล้วน/ผิดรูปแบบไม่ได้
    expect(parseForm(broodSplitSchema, form({ occurredOn: today, targetCode: 'b-01' }))).toMatchObject({ ok: true, data: { targetCode: 'B1' } });
    expect(parseForm(broodSplitSchema, form({ occurredOn: today, targetCode: '12' })).ok).toBe(false);
    expect(parseForm(broodSplitSchema, form({ occurredOn: today, targetCode: 'A12B' })).ok).toBe(false);
    expect(parseForm(broodSplitSchema, form({ occurredOn: today })).ok).toBe(true);
  });
  it('จำนวนไข่นางพญาต้อง ≥ 1', () => {
    expect(parseForm(queenCellSchema, form({ occurredOn: today, queenCells: '0' })).ok).toBe(false);
  });
});

describe('editHiveSchema', () => {
  const ok = { origin: 'queen_bred', boxType: 'teak_2room' };
  it('ช่องว่างกลายเป็น undefined (= ล้างค่า) และตัวเลขแปลงถูก', () => {
    const r = parseForm(editHiveSchema, form({ ...ok, queenBornOn: '', purchasePrice: '700', queenSourceCode: ' a55 ', notes: '' }));
    expect(r).toMatchObject({ ok: true, data: { queenBornOn: undefined, purchasePrice: 700, queenSourceCode: 'A55', notes: undefined } });
  });
  it('รหัสรังผิดรูปแบบ วันที่อนาคต ราคาติดลบ ถูกปฏิเสธ', () => {
    expect(parseForm(editHiveSchema, form({ ...ok, queenSourceCode: 'X' })).ok).toBe(false);
    expect(parseForm(editHiveSchema, form({ ...ok, queenSourceCode: 'ABCD1' })).ok).toBe(false);
    expect(parseForm(editHiveSchema, form({ ...ok, queenBornOn: '2999-01-01' })).ok).toBe(false);
    expect(parseForm(editHiveSchema, form({ ...ok, purchasePrice: '-1' })).ok).toBe(false);
    expect(parseForm(editHiveSchema, form({ ...ok, origin: 'alien' })).ok).toBe(false);
  });
  it('ยังเลือกที่มา unknown ได้ (รังที่ยังไม่ทราบที่มา)', () => {
    expect(parseForm(editHiveSchema, form({ origin: 'unknown', boxType: 'unknown' })).ok).toBe(true);
  });
});

describe('variantSchema / publishSchema', () => {
  it('ราคา/สต็อกเป็นจำนวนเต็ม ราคาต้อง ≥ 1 สต็อกเป็น 0 ได้', () => {
    expect(parseForm(variantSchema, form({ variantId: '3', priceThb: '690', stockQty: '0' }))).toMatchObject({ ok: true, data: { variantId: 3, priceThb: 690, stockQty: 0 } });
    expect(parseForm(variantSchema, form({ variantId: '3', priceThb: '0', stockQty: '1' })).ok).toBe(false);
    expect(parseForm(variantSchema, form({ variantId: '3', priceThb: '-5', stockQty: '1' })).ok).toBe(false);
    expect(parseForm(variantSchema, form({ variantId: '3', priceThb: '12.5', stockQty: '1' })).ok).toBe(false);
    expect(parseForm(variantSchema, form({ variantId: '3', priceThb: '', stockQty: '1' })).ok).toBe(false);
    expect(parseForm(variantSchema, form({ variantId: 'x', priceThb: '5', stockQty: '1' })).ok).toBe(false);
  });
  it('publish: checkbox', () => {
    expect(parseForm(publishSchema, form({ productId: '1', published: 'on' }))).toMatchObject({ ok: true, data: { published: true } });
    expect(parseForm(publishSchema, form({ productId: '1' }))).toMatchObject({ ok: true, data: { published: false } });
  });
});

describe('status / sale / new hive', () => {
  it('เปลี่ยนสถานะเป็น unknown ไม่ได้', () => {
    expect(parseForm(statusSchema, form({ status: 'unknown', occurredOn: today })).ok).toBe(false);
    expect(parseForm(statusSchema, form({ status: 'sold', occurredOn: today, soldPrice: '1500' }))).toMatchObject({ ok: true, data: { soldPrice: 1500 } });
  });
  it('ตั้งขายต้องมีราคา', () => {
    expect(parseForm(saleSchema, form({ forSale: 'on' })).ok).toBe(false);
    expect(parseForm(saleSchema, form({ forSale: 'on', salePrice: '1590' })).ok).toBe(true);
    expect(parseForm(saleSchema, form({})).ok).toBe(true);
  });
  it('รังใหม่ต้องเลือกที่มา', () => {
    expect(parseForm(newHiveSchema, form({ origin: 'unknown' })).ok).toBe(false);
    expect(parseForm(newHiveSchema, form({ origin: 'queen_bred', queenSourceCode: 'A55', broodSourceCode: 'A89', queenBornOn: today }))).toMatchObject({ ok: true, data: { boxType: 'metafarm' } });
  });
});

describe('newHiveSchema: รหัสรังตั้งเอง', () => {
  const base = { origin: 'split', boxType: 'teak_2room' };
  const code = (c: string) => {
    const r = newHiveSchema.safeParse({ ...base, code: c });
    return r.success ? r.data.code : 'ERR';
  };
  it('ตัวเล็ก / ขีด / เลข 0 นำหน้า → รหัสมาตรฐาน · ตัวอักษรอื่นได้', () => {
    expect(code('a150')).toBe('A150');
    expect(code('g-0108')).toBe('G108');
    expect(code('B12')).toBe('B12');
    expect(code(' A0150 ')).toBe('A150');
    expect(code('')).toBeUndefined();
  });
  it('เลขล้วน (แยก A12/B12 ไม่ได้) และรูปแบบอื่นไม่รับ', () => {
    expect(code('150')).toBe('ERR');
    expect(code('A0')).toBe('ERR');
    expect(code('A123456')).toBe('ERR');
    expect(code('A12x')).toBe('ERR');
  });
});

describe('คำอธิบายสินค้า (เจ้าของขอ 400 ตัวอักษร 2026-10-18)', () => {
  const line = 'ก'.repeat(49) + '\r\n'; // ฟอร์มส่งขึ้นบรรทัดใหม่เป็น \r\n
  it('400 ตัว (นับขึ้นบรรทัดเป็น 1) ผ่าน และเก็บเป็น \\n · 401 ตัวไม่ผ่าน', () => {
    const ok = productTextSchema.safeParse({ productId: '1', description: line.repeat(8) }); // 8 × (49 + 1) = 400
    expect(ok.success).toBe(true);
    expect(ok.data?.description).toBe(('ก'.repeat(49) + '\n').repeat(8).trim());
    expect(productTextSchema.safeParse({ productId: '1', description: 'ก'.repeat(401) }).success).toBe(false);
  });
});
