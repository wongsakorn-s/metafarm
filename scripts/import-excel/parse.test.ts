import { describe, expect, it } from 'vitest';
import { parseEventLine, parseHiveSheet } from './parse.ts';
import type { Row } from './xlsx.ts';

const sheet = (rows: [number, Row][]) => new Map(rows);

describe('parseHiveSheet', () => {
  // ตัวอย่างย่อจากรูปแบบจริงในชีต "ขนเงิน" (เบอร์โทรเป็นค่าสมมุติ)
  const rows = sheet([
    [3, { A: 'No.', B: 'ที่มา / รูป', J: 'Exist' }],
    [4, { A: 'A1', B: 'อ.สายบุรี จ.ปัตตานี', C: 'แยกไข่อ่อนและตัวงานออกไป', D: 'เก็บไข่นางพญาออกไป', F: '700', J: '1', M: 'คู่ค้าหนึ่ง_0900000000' }],
    [5, { B: '25 มีค. 2565', C: 'ครั้งที่ 1) : 24 กค. 2565', D: '1) 14 มิย. 2565 : 1 ใบ' }],
    [6, { C: 'ครั้งที่ 2) : 18 กย. 2565', D: '2) 15 มิย. 2566 : 2 ใบ' }],
    [16, { A: 'A2', B: 'ขยายรัง 24 กค. 2565', K: '1', H: '1340' }],
    [17, { B: 'ไข่อ่อนจาก A1 (ปัตตานี)', C: 'ประวัติแยกไข่ ออกไปรังใหม่ :' }],
    [28, { A: 'A3', B: "Metafarm's Stingless Bee", C: 'รังแม่พันธุ์ & รังพ่อพันธุ์', L: '1', M: 'ขยายรัง 2 ครั้งจึงสำเร็จ' }],
    [29, { B: "Queen's Birthday : 8 Aug. 2023", C: 'ประวัติแยกไข่ ออกไปรังใหม่ :' }],
    [30, { B: 'ไข่นางจาก A1', C: '1) 30สค65 เก็บไข่นาง 2 ฟอง' }],
    [31, { B: 'ไข่อ่อนจาก AXX', C: 'บันทึกลายมือไม่มีวันที่' }],
    [40, { A: 'A4', B: 'ขยายรังเองตามธรรมชาติ' }],
    [41, { B: 'มีค. 2566' }],
    [99, { F: '51417', J: 'Exist', K: 'Sold' }],
  ]);
  const { hives, issues } = parseHiveSheet(rows);
  const [a1, a2, a3, a4] = hives;

  it('แบ่งบล็อกตามรหัสรัง และหยุดที่แถวสรุป', () => {
    expect(hives.map((h) => h.code)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('รังที่ซื้อมา: ราคา วันที่ จังหวัด คู่ค้า', () => {
    expect(a1).toMatchObject({
      origin: 'purchased',
      originPlace: 'อ.สายบุรี จ.ปัตตานี',
      acquiredOn: '2022-03-25',
      purchasePrice: 700,
      status: 'active',
      supplier: { name: 'คู่ค้าหนึ่ง', phone: '0900000000' },
    });
  });

  it('ประวัติแยกไข่อ่อน/ไข่นาง และจับคู่รังลูกที่ขยายวันเดียวกัน', () => {
    expect(a1!.events.map((e) => [e.type, e.occurredOn, e.queenCells, e.targetCode])).toEqual([
      ['brood_split', '2022-07-24', null, 'A2'],
      ['queen_cell_taken', '2022-06-14', 1, null],
      ['brood_split', '2022-09-18', null, null],
      ['queen_cell_taken', '2023-06-15', 2, null],
    ]);
  });

  it('รังขยาย: วันที่จากหัว และรังแม่', () => {
    expect(a2).toMatchObject({ origin: 'split', acquiredOn: '2022-07-24', broodSourceCode: 'A1', status: 'sold', soldPrice: 1340 });
  });

  it('รังเพาะนางพญา: วันเกิด, ref ที่ไม่รู้เป็น null, ข้อความอ่านไม่ได้เป็นหมายเหตุ', () => {
    expect(a3).toMatchObject({
      origin: 'queen_bred',
      queenBornOn: '2023-08-08',
      queenSourceCode: 'A1',
      broodSourceCode: null,
      status: 'collapsed',
      breederTags: ['รังแม่พันธุ์ & รังพ่อพันธุ์'],
      supplier: null,
    });
    expect(a3!.events[0]).toMatchObject({ type: 'queen_cell_taken', occurredOn: '2022-08-30', queenCells: 2 });
    expect(a3!.privateNotes).toEqual(expect.arrayContaining(['ขยายรัง 2 ครั้งจึงสำเร็จ', 'บันทึกลายมือไม่มีวันที่']));
  });

  it('ขยายเองตามธรรมชาติ: วันที่มีแค่เดือน', () => {
    expect(a4).toMatchObject({ origin: 'natural', acquiredOn: '2023-03-01', acquiredPrecision: 'month', status: 'unknown' });
  });

  it('รายงานสิ่งที่ต้องตรวจ', () => {
    const msgs = issues.map((i) => `${i.code}:${i.cell}`);
    expect(msgs).toEqual(expect.arrayContaining(['A3:B31', 'A3:C31', 'A4:J40']));
  });
});

describe('วันเกิดนางพญาที่เขียนไว้ในช่องหมายเหตุ', () => {
  const { hives, issues } = parseHiveSheet(
    sheet([
      [10, { A: 'A5', B: "Metafarm's Stingless Bee", J: '1', M: 'ขยายรัง : 8 มิย. 2567' }],
      [11, { B: "Queen's Birthday :  ", M: 'นางพญาเกิด : 21 มิย. 2567' }],
      [20, { A: 'A6', B: "Metafarm's Stingless Bee", J: '1' }],
      [21, { B: "Queen's Birthday :  " }],
    ]),
  );
  it('ใช้วันที่จากหมายเหตุเมื่อช่องหลักว่าง', () => {
    expect(hives[0]).toMatchObject({ queenBornOn: '2024-06-21', acquiredOn: '2024-06-08' });
    expect(issues.filter((i) => i.code === 'A5')).toEqual([]);
  });
  it('ไม่มีเลย → ??? ในหมายเหตุ และเข้ารายงาน', () => {
    expect(hives[1]!.queenBornOn).toBeNull();
    expect(hives[1]!.privateNotes).toContain('??? วันเกิดนางพญา');
    expect(issues.some((i) => i.code === 'A6')).toBe(true);
  });
});

describe('parseEventLine', () => {
  it('คอลัมน์ D ที่ไม่ระบุชนิด = เก็บไข่นาง', () => {
    expect(parseEventLine('4) 18 กค. 2566: 1 ใบ', 'D')).toMatchObject({ type: 'queen_cell_taken', occurredOn: '2023-07-18', queenCells: 1 });
  });
  it('ข้อความระบุชนิดชนะคอลัมน์', () => {
    expect(parseEventLine('15) 17 กย. 66 แบ่งไข่อ่อนไป', 'D')).toMatchObject({ type: 'brood_split', occurredOn: '2023-09-17' });
    expect(parseEventLine('1) 19 กค. 67 แบ่งไข่นาง 2 ใบ', 'C')).toMatchObject({ type: 'queen_cell_taken', queenCells: 2 });
  });
  it('ไม่มีวันที่ → null', () => {
    expect(parseEventLine('vvv', 'C')).toBeNull();
  });
});
