// อ่าน .xlsx แบบเบา ๆ (unzip + XML) เฉพาะที่ import ต้องใช้: ค่าในเซลล์ และตำแหน่งรูปในชีต
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';

export type Row = Record<string, string>; // คอลัมน์ ('A','B',…) → ข้อความ
export interface SheetImage {
  row: number; // 1-based (เหมือนเลขแถวใน Excel)
  col: number; // 0-based
  path: string; // path ใน zip เช่น xl/media/image12.jpeg
}
export interface Sheet {
  rows: Map<number, Row>;
  images: SheetImage[];
}

const ARRAYS = new Set(['si', 'r', 'row', 'c', 'sheet', 'Relationship', 'twoCellAnchor', 'oneCellAnchor']);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ARRAYS.has(name),
});

type Xml = Record<string, any>;

export class Workbook {
  private files: Record<string, Uint8Array>;
  private shared: string[];

  constructor(data: Uint8Array) {
    this.files = unzipSync(data);
    this.shared = this.readSharedStrings();
  }

  file(path: string): Uint8Array | undefined {
    return this.files[path];
  }

  private xml(path: string): Xml | null {
    const f = this.files[path];
    return f ? parser.parse(strFromU8(f)) : null;
  }

  private rels(path: string): Map<string, string> {
    const relsPath = posix.join(posix.dirname(path), '_rels', posix.basename(path) + '.rels');
    const out = new Map<string, string>();
    for (const r of this.xml(relsPath)?.Relationships?.Relationship ?? []) {
      const target: string = r['@_Target'];
      out.set(r['@_Id'], target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(path), target)));
    }
    return out;
  }

  private readSharedStrings(): string[] {
    const sst = this.xml('xl/sharedStrings.xml')?.sst?.si ?? [];
    return sst.map((si: Xml) => text(si));
  }

  sheetNames(): string[] {
    return (this.xml('xl/workbook.xml')?.workbook?.sheets?.sheet ?? []).map((s: Xml) => s['@_name']);
  }

  sheet(name: string): Sheet {
    const wb = this.xml('xl/workbook.xml')!;
    const entry = (wb.workbook.sheets.sheet as Xml[]).find((s) => s['@_name'] === name);
    if (!entry) throw new Error(`ไม่พบชีต "${name}" (มี: ${this.sheetNames().join(', ')})`);
    const path = this.rels('xl/workbook.xml').get(entry['@_id'])!;
    const ws = this.xml(path)!.worksheet;

    const rows = new Map<number, Row>();
    for (const r of ws.sheetData?.row ?? []) {
      const row: Row = {};
      for (const c of r.c ?? []) {
        const ref: string = c['@_r'];
        const col = ref.replace(/\d+/g, '');
        let value = '';
        if (c['@_t'] === 's') value = this.shared[Number(c.v)] ?? '';
        else if (c['@_t'] === 'inlineStr') value = text(c.is);
        else if (c.v !== undefined) value = String(c.v);
        if (value.trim() !== '') row[col] = value;
      }
      if (Object.keys(row).length) rows.set(Number(r['@_r']), row);
    }

    const images: SheetImage[] = [];
    const drawingRid = ws.drawing?.['@_id'];
    if (drawingRid) {
      const drawingPath = this.rels(path).get(drawingRid)!;
      const drawingRels = this.rels(drawingPath);
      const d = this.xml(drawingPath)!.wsDr;
      for (const a of [...(d.twoCellAnchor ?? []), ...(d.oneCellAnchor ?? [])]) {
        const embed = a.pic?.blipFill?.blip?.['@_embed'];
        const media = embed && drawingRels.get(embed);
        if (!media) continue;
        images.push({ row: Number(a.from.row) + 1, col: Number(a.from.col), path: media });
      }
    }
    return { rows, images };
  }
}

function text(node: Xml | string | undefined): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node.t !== undefined) return typeof node.t === 'object' ? (node.t['#text'] ?? '') : String(node.t);
  if (node.r) return (node.r as Xml[]).map((r) => text(r)).join('');
  return '';
}
