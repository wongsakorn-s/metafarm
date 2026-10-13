// แก้คู่ค้าจากหน้าแก้ไขรัง: เวอร์ชันกันชน · แก้ข้อมูลของรายที่เปิดมา · เปลี่ยน/เพิ่ม/เอาออก · พนักงานแก้ไม่ได้
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { hives, suppliers } from '../db/schema.ts';
import { editHiveSchema, parseForm } from '../lib/validation.ts';
import { getHiveDetail, listSuppliers, updateHiveSupplier } from './hives.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  t = await testDb();
  await t.d1.batch([
    t.d1.prepare(`INSERT INTO suppliers (id, name, phone, area) VALUES (1, 'ลุงแดง (ขี้โกง)', '0811111111', 'ชลบุรี'), (2, 'ป้าส้ม', '0822222222', NULL)`),
    t.d1.prepare(`INSERT INTO hives (code, species_id, origin, box_type, supplier_id) VALUES ('A1', 1, 'purchased', 'teak_2room', 1), ('A2', 1, 'purchased', 'teak_2room', 1), ('A3', 1, 'queen_bred', 'teak_2room', NULL)`),
  ]);
}, 60_000);
afterAll(() => t?.close());

const parse = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ origin: 'purchased', boxType: 'teak_2room', ...o })) f.set(k, v);
  const p = parseForm(editHiveSchema, f);
  if (!p.ok) throw new Error(JSON.stringify(p.errors));
  return p.data;
};
const hive = async (code: string) => (await getHiveDetail(t.db, code))!;

describe('คู่ค้าในหน้าแก้ไขรัง', () => {
  it('แก้ชื่อ/เบอร์ของรายที่เปิดมา → มีผลกับทุกรังที่ใช้ · นับจำนวนรัง', async () => {
    const d = await hive('A1');
    expect((await listSuppliers(t.db)).find((x) => x.id === 1)?.uses).toBe(2);
    const r = await updateHiveSupplier(t.db, t.owner, d.hive, parse({
      supplierChoice: '1', supplierEditId: '1', supplierVersion: d.supplierUpdatedAt!, supplierName: 'ลุงแดง', supplierPhone: '0899999999', supplierArea: 'ชลบุรี',
    }));
    expect(r.ok).toBe(true);
    expect((await hive('A2')).supplierName).toBe('ลุงแดง');
    expect((await hive('A2')).supplierPhone).toBe('0899999999');
  });

  it('เวอร์ชันเก่า → conflict ไม่เขียนอะไร', async () => {
    const d = await hive('A1');
    const r = await updateHiveSupplier(t.db, t.owner, d.hive, parse({ supplierEditId: '1', supplierVersion: '2000-01-01T00:00:00.000Z', supplierName: 'ชื่อที่ชน' }));
    expect(r).toMatchObject({ ok: false, conflict: true });
    expect((await hive('A1')).supplierName).toBe('ลุงแดง');
  });

  it('เปลี่ยนตัวเลือกเป็นรายอื่น: ช่องแก้ยังใช้กับรายที่เปิดมา ไม่ใช่รายใหม่ที่เลือก', async () => {
    const d = await hive('A1');
    const r = await updateHiveSupplier(t.db, t.owner, d.hive, parse({ supplierChoice: '2', supplierEditId: '1', supplierVersion: d.supplierUpdatedAt!, supplierName: 'ลุงแดง 2', supplierPhone: '0899999999' }));
    expect(r.ok).toBe(true);
    const a1 = await hive('A1');
    expect(a1.supplierName).toBe('ป้าส้ม');
    expect((await t.db.select().from(suppliers).where(eq(suppliers.id, 1)))[0]!.name).toBe('ลุงแดง 2');
    expect((await t.db.select().from(suppliers).where(eq(suppliers.id, 2)))[0]!.name).toBe('ป้าส้ม');
  });

  it('เพิ่มรายใหม่ · เอาออก (none) · ไม่มีชื่อ = error', async () => {
    const d = await hive('A3');
    expect(await updateHiveSupplier(t.db, t.owner, d.hive, parse({ supplierChoice: 'new', newSupplierName: '' }))).toMatchObject({ ok: false });
    expect(await updateHiveSupplier(t.db, t.owner, d.hive, parse({ supplierChoice: 'new', newSupplierName: 'ร้านใหม่', newSupplierArea: 'ระยอง' }))).toEqual({ ok: true });
    expect((await hive('A3')).supplierName).toBe('ร้านใหม่');
    expect(await updateHiveSupplier(t.db, t.owner, (await hive('A3')).hive, parse({ supplierChoice: 'none' }))).toEqual({ ok: true });
    expect((await t.db.select().from(hives).where(eq(hives.code, 'A3')))[0]!.supplierId).toBeNull();
  });

  it('พนักงานแก้ไม่ได้ (ข้ามเงียบ ไม่เขียน)', async () => {
    const d = await hive('A2');
    await updateHiveSupplier(t.db, t.staff, d.hive, parse({ supplierChoice: 'none', supplierEditId: '2', supplierName: 'แฮ็ก' }));
    expect((await hive('A2')).supplierName).toBe('ลุงแดง 2');
  });
});
