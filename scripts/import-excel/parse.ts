// แปลงชีต "ขนเงิน" (ทะเบียนรังที่เจ้าของฟาร์มกรอกมือ) เป็นข้อมูลที่มีโครงสร้าง
// หลักการ: ไม่เดาข้อมูล — อะไรที่อ่านไม่ออกจะเก็บเป็นหมายเหตุ 🔒 และใส่ในรายงาน issues
import { parseThaiDate, type DatePrecision } from '../../src/lib/thai-date.ts';
import type { Row } from './xlsx.ts';

export type Origin = 'purchased' | 'queen_bred' | 'split' | 'natural' | 'unknown';
export type Status = 'active' | 'sold' | 'collapsed' | 'unknown';
export type EventType = 'queen_cell_taken' | 'brood_split';

export interface ParsedEvent {
  type: EventType;
  occurredOn: string;
  precision: DatePrecision;
  queenCells: number | null;
  targetCode: string | null;
  raw: string;
  cell: string; // เช่น "C162" ใช้ทำ idempotency key
}

export interface ParsedHive {
  code: string;
  row: number;
  origin: Origin;
  originPlace: string | null;
  boxType: 'log' | 'unknown';
  acquiredOn: string | null;
  acquiredPrecision: DatePrecision | null;
  queenBornOn: string | null;
  queenSourceCode: string | null;
  broodSourceCode: string | null;
  status: Status;
  purchasePrice: number | null;
  soldPrice: number | null;
  /** ป้ายที่เจ้าของฟาร์มเขียนไว้ เช่น "รังแม่พันธุ์", "รังพ่อพันธุ์" */
  breederTags: string[];
  supplier: { name: string; phone: string | null; extra: string[] } | null;
  privateNotes: string[];
  events: ParsedEvent[];
}

export interface Issue {
  code: string;
  cell: string;
  message: string;
}

const HIVE_CODE = /^A\d+$/;
const REF = '(A\\d+|AXX|XX)';
const PHONE = /0\d{8,9}/;

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v.replace(/,/g, '').trim());
  return Number.isFinite(n) && v.trim() !== '' ? Math.round(n) : null;
};
const flag = (v: string | undefined) => v?.trim() === '1';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** ref ที่ไม่รู้ (AXX, XX) → null */
const ref = (s: string | undefined): string | null => (s && HIVE_CODE.test(s) ? s : null);

/** แถวสรุปท้ายตาราง (Exist/Sold/ล่ม, ราคาขายเฉลี่ย) */
const isSummaryRow = (r: Row) => r.J === 'Exist' || r.K === 'Sold' || /ราคาขาย/.test(r.M ?? '');

// ข้อความหัวคอลัมน์ภายในบล็อก ไม่ใช่ข้อมูล
const C_HEADERS = /^(แยกไข่อ่อนและตัวงานออกไป|ประวัติแยกไข่\s*ออกไปรังใหม่\s*:?)$/;
const D_HEADERS = /^เก็บไข่นางพญาออกไป$/;
// "รังแม่พันธุ์", "รังพ่อพันธุ์" หรือ "รังแม่พันธุ์ & รังพ่อพันธุ์"
const BREEDER = /^รัง(แม่|พ่อ)พันธุ์(\s*&\s*รัง(แม่|พ่อ)พันธุ์)?$/;

export function parseHiveSheet(rows: Map<number, Row>): { hives: ParsedHive[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);

  // 1) แบ่งเป็นบล็อกตามแถวที่คอลัมน์ A เป็นรหัสรัง
  const blocks: { code: string; start: number; rows: [number, Row][] }[] = [];
  for (const [n, r] of sorted) {
    // หัวตาราง (แถว 3) ก็มีคำว่า Exist/Sold จึงนับเป็นแถวสรุปเฉพาะหลังเริ่มบล็อกแรกแล้ว
    if (blocks.length && isSummaryRow(r)) break;
    const a = r.A?.trim();
    if (a && HIVE_CODE.test(a)) blocks.push({ code: a, start: n, rows: [] });
    blocks.at(-1)?.rows.push([n, r]);
  }

  const hives = blocks.map((b) => parseBlock(b.code, b.start, b.rows, issues));

  // 2) ตรวจ ref ที่ชี้ไปรังที่ไม่มีอยู่
  const codes = new Set(hives.map((h) => h.code));
  for (const h of hives) {
    for (const k of ['queenSourceCode', 'broodSourceCode'] as const) {
      const c = h[k];
      if (c && !codes.has(c)) {
        issues.push({ code: h.code, cell: `B${h.row}`, message: `อ้างถึงรัง ${c} ที่ไม่มีในทะเบียน` });
        h[k] = null;
      }
    }
  }

  // 3) จับคู่เหตุการณ์ "แยกไข่อ่อน/แบ่งไข่นาง" ของรังแม่ กับรังลูกที่ขยายในวันเดียวกัน (เฉพาะกรณีชัดเจน 1:1)
  for (const parent of hives) {
    for (const e of parent.events) {
      const key = e.type === 'brood_split' ? 'broodSourceCode' : 'queenSourceCode';
      const children = hives.filter(
        (h) => h[key] === parent.code && h.acquiredOn === e.occurredOn && h.acquiredPrecision === 'day',
      );
      if (children.length === 1) e.targetCode = children[0]!.code;
    }
  }

  return { hives, issues };
}

function parseBlock(code: string, start: number, rows: [number, Row][], issues: Issue[]): ParsedHive {
  const head = rows[0]![1];
  const headB = clean(head.B ?? '');
  const purchasePrice = num(head.F);

  const h: ParsedHive = {
    code,
    row: start,
    origin: 'unknown',
    originPlace: null,
    boxType: /ขอนไม้/.test(headB) ? 'log' : 'unknown',
    acquiredOn: null,
    acquiredPrecision: null,
    queenBornOn: null,
    queenSourceCode: null,
    broodSourceCode: null,
    status: flag(head.J) ? 'active' : flag(head.K) ? 'sold' : flag(head.L) ? 'collapsed' : 'unknown',
    purchasePrice,
    soldPrice: num(head.H),
    breederTags: [],
    supplier: null,
    privateNotes: [],
    events: [],
  };
  // ข้อมูลที่ไม่รู้: คอลัมน์ในฐานข้อมูลเป็น NULL/unknown (ไม่เดา) และใส่ "???" ไว้ในหมายเหตุให้เห็นว่าต้องกรอกเพิ่ม
  const unknown = (what: string) => h.privateNotes.push(`??? ${what}`);
  if (h.status === 'unknown') {
    issues.push({ code, cell: `J${start}`, message: 'ไม่มีสถานะ Exist/Sold/ล่ม' });
    unknown('สถานะรัง');
  }

  const setAcquired = (text: string) => {
    const d = parseThaiDate(text);
    if (d && !h.acquiredOn) {
      h.acquiredOn = d.iso;
      h.acquiredPrecision = d.precision;
    }
    return d;
  };

  // ที่มา (จากข้อความหัวคอลัมน์ B)
  if (/Metafarm/i.test(headB)) h.origin = 'queen_bred';
  else if (/ขยายรังเองตามธรรมชาติ/.test(headB)) h.origin = 'natural';
  else if (/^ขยาย/.test(headB)) {
    h.origin = 'split';
    setAcquired(headB);
  } else if (purchasePrice != null) {
    h.origin = 'purchased';
    h.originPlace = headB.replace(/\s*\(ขอนไม้\)\s*/, '').trim() || null;
  } else if (headB) {
    h.originPlace = headB;
    issues.push({ code, cell: `B${start}`, message: `ระบุที่มาไม่ได้: "${headB}"` });
  }

  const supplierLines: string[] = [];
  const nCells: string[] = [];

  for (const [n, r] of rows) {
    const isHead = n === start;

    // คอลัมน์ A ที่ไม่ใช่รหัสรัง = หมายเหตุ
    if (!isHead && r.A) h.privateNotes.push(clean(r.A));

    // คอลัมน์ B: วันที่ได้มา / Queen's Birthday / รังแม่
    if (!isHead && r.B) {
      const b = clean(r.B);
      let m: RegExpExecArray | null;
      if (/Queen'?s Birthday/i.test(b)) {
        const d = parseThaiDate(b);
        if (d) h.queenBornOn = d.iso;
      } else if ((m = new RegExp(`ไข่อ่อนและไข่นาง(?:พญา)?จาก\\s*${REF}`).exec(b))) {
        h.broodSourceCode = h.queenSourceCode = ref(m[1]);
        if (!h.broodSourceCode) {
          issues.push({ code, cell: `B${n}`, message: `ไม่ทราบรังแม่: "${b}"` });
          unknown('รังแม่ (ไข่อ่อนและไข่นาง)');
        }
      } else if ((m = new RegExp(`ไข่นาง(?:พญา)?จาก\\s*${REF}`).exec(b))) {
        h.queenSourceCode = ref(m[1]);
        if (!h.queenSourceCode) {
          issues.push({ code, cell: `B${n}`, message: `ไม่ทราบรังแม่ (ไข่นาง): "${b}"` });
          unknown('รังแม่ (ไข่นาง)');
        }
      } else if ((m = new RegExp(`ไข่อ่อนจาก\\s*${REF}`).exec(b))) {
        h.broodSourceCode = ref(m[1]);
        if (!h.broodSourceCode) {
          issues.push({ code, cell: `B${n}`, message: `ไม่ทราบรังแม่ (ไข่อ่อน): "${b}"` });
          unknown('รังแม่ (ไข่อ่อน)');
        }
      } else if (!setAcquired(b)) {
        h.privateNotes.push(b);
      }
    }

    // คอลัมน์ C และ D: ประวัติแยกไข่อ่อน / เก็บไข่นาง
    for (const col of ['C', 'D'] as const) {
      const v = r[col] && clean(r[col]!);
      if (!v) continue;
      if (BREEDER.test(v)) {
        h.breederTags.push(v);
        continue;
      }
      if (C_HEADERS.test(v) || D_HEADERS.test(v)) continue;
      const ev = parseEventLine(v, col);
      if (ev) h.events.push({ ...ev, cell: `${col}${n}` });
      else {
        h.privateNotes.push(v);
        issues.push({ code, cell: `${col}${n}`, message: `อ่านประวัติไม่ได้ (เก็บเป็นหมายเหตุ): "${v}"` });
      }
    }

    // M (คู่ค้า/หมายเหตุ) และ N (หมายเหตุ)
    if (r.M) {
      const m = clean(r.M);
      // หมายเหตุที่เขียนว่า "นางพญาเกิด : <วันที่>" / "ขยายรัง : <วันที่>" ใช้เติมวันที่ที่ช่องหลักว่างอยู่
      const born = /นางพญาเกิด(?:ประมาณวันที่)?\s*:?\s*(.*)$/.exec(m);
      const split = /^ขยายรัง\s*:?\s*(.*)$/.exec(m);
      const bornDate = born && parseThaiDate(born[1]);
      const splitDate = split && parseThaiDate(split[1]);
      if (bornDate && h.origin === 'queen_bred' && !h.queenBornOn) {
        h.queenBornOn = bornDate.iso;
        h.privateNotes.push(m);
      } else if (splitDate && h.origin === 'queen_bred' && !h.acquiredOn) {
        h.acquiredOn = splitDate.iso;
        h.acquiredPrecision = splitDate.precision;
        h.privateNotes.push(m);
      } else if (h.origin === 'purchased' && (isHead || n === start + 1)) supplierLines.push(m);
      else h.privateNotes.push(m);
    }
    if (r.N) nCells.push(clean(r.N));
  }

  // คอลัมน์ N มักเป็นวันเกิดนางพญาซ้ำเป็นภาษาไทย → ใช้เมื่อ B ว่าง, ที่เหลือเก็บเป็นหมายเหตุ
  for (const nn of nCells) {
    const d = parseThaiDate(nn);
    if (d && h.origin === 'queen_bred' && !h.queenBornOn) h.queenBornOn = d.iso;
    else if (!(d && d.iso === h.queenBornOn)) h.privateNotes.push(nn);
  }

  if (supplierLines.length) {
    const first = supplierLines[0]!;
    const phone = PHONE.exec(first)?.[0] ?? null;
    const name = clean(first.replace(PHONE, '').replace(/[_]+/g, ' ').replace(/^\(|\)$/g, '')) || first;
    h.supplier = { name, phone, extra: supplierLines.slice(1) };
  }

  if (h.origin === 'purchased' && !h.acquiredOn) {
    issues.push({ code, cell: `B${start + 1}`, message: 'รังที่ซื้อมาแต่ไม่มีวันที่ซื้อ' });
    unknown('วันที่ซื้อ');
  }
  if (h.origin === 'queen_bred' && !h.queenBornOn) {
    issues.push({ code, cell: `B${start + 1}`, message: "ไม่มีวันเกิดนางพญา (Queen's Birthday ว่าง)" });
    unknown('วันเกิดนางพญา');
  }

  return h;
}

/** หนึ่งบรรทัดประวัติ เช่น "ครั้งที่ 1) : 24 กค. 2565", "2) 15 มิย. 2566 : 1 ใบ", "5) 3พย.65 เก็บไข่นาง 1 ฟอง" */
export function parseEventLine(v: string, col: 'C' | 'D'): Omit<ParsedEvent, 'cell'> | null {
  const body = v.replace(/^(ครั้งที่\s*)?\d+\)\s*:?\s*/, '');
  const d = parseThaiDate(body);
  if (!d) return null;
  const mentionsQueen = /ไข่นาง/.test(body);
  const mentionsBrood = /ไข่อ่อน/.test(body);
  const type: EventType = mentionsQueen ? 'queen_cell_taken' : mentionsBrood ? 'brood_split' : col === 'D' ? 'queen_cell_taken' : 'brood_split';
  const count = /(\d+)\s*(?:ใบ|ฟอง)/.exec(body);
  return {
    type,
    occurredOn: d.iso,
    precision: d.precision,
    queenCells: type === 'queen_cell_taken' && count ? Number(count[1]) : null,
    targetCode: null,
    raw: v,
  };
}
