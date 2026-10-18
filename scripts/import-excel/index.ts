// นำเข้าทะเบียนรังจาก Excel ของเจ้าของฟาร์ม → SQL สำหรับ D1 + รูป + รายงาน
//
//   bun run import:excel                 สร้างไฟล์ใน private/import/
//   bun run db:seed:local                นำ seed.sql เข้า D1 บนเครื่อง
//
// ⚠️ seed.sql จะ "ล้างข้อมูลรังทั้งหมด" ก่อนนำเข้า ใช้สำหรับโหลดข้อมูลครั้งแรกเท่านั้น
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Workbook } from './xlsx.ts';
import { parseHiveSheet, type ParsedHive } from './parse.ts';
import { localOnlyGuard } from '../local-only-guard.ts';

const SOURCE = process.argv[2] ?? 'private/ข้อมูลเบื้องต้น.xlsx';
const SHEET = 'ขนเงิน';
const OUT = 'private/import';

const wb = new Workbook(new Uint8Array(readFileSync(SOURCE)));
const sheet = wb.sheet(SHEET);
const { hives, issues } = parseHiveSheet(sheet.rows);

// ---------- รูป: จับคู่ตำแหน่งแถวของรูปกับบล็อกของรัง ----------
rmSync(join(OUT, 'photos'), { recursive: true, force: true });
mkdirSync(join(OUT, 'photos'), { recursive: true });

const starts = hives.map((h) => h.row);
const blockOf = (row: number): ParsedHive | undefined => {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) if (starts[i]! <= row) idx = i;
  // รูปที่อยู่ก่อนรังแรก (หัวตาราง) ไม่นับ
  return idx >= 0 ? hives[idx] : undefined;
};

const photos = new Map<string, { file: string; key: string }[]>();
let skippedImages = 0;
for (const img of [...sheet.images].sort((a, b) => a.row - b.row || a.col - b.col)) {
  const h = blockOf(img.row);
  const data = wb.file(img.path);
  // ไม่เอาคอลัมน์ M เป็นต้นไป (โซนคู่ค้า) และรูปนอกบล็อก
  if (!h || !data || img.col >= 12) {
    skippedImages++;
    continue;
  }
  const list = photos.get(h.code) ?? [];
  const file = `${h.code}-${list.length + 1}${extname(img.path).toLowerCase()}`;
  writeFileSync(join(OUT, 'photos', file), data);
  list.push({ file, key: `hives/${h.code}/${file}` });
  photos.set(h.code, list);
}

// ---------- SQL ----------
const q = (v: string | number | boolean | null | undefined): string =>
  v == null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${v.replace(/'/g, "''")}'`;
// id ในฐานข้อมูลบนเครื่อง: รหัส A ใช้เลขในรหัส (คงค่าเดิมของข้อมูลที่มีอยู่) · ชุดอื่นบวกช่วงของตัวอักษร (B12 → 2_000_012) ไม่ชนกัน
// (บนระบบจริง id ให้ฐานข้อมูลออกเอง — สคริปต์นี้ใช้ล้างข้อมูลในเครื่องเท่านั้น)
const id = (code: string | null) => {
  if (!code) return null;
  const m = /^([A-Z]{1,3})(\d+)$/.exec(code)!;
  const offset = m[1] === 'A' ? 0 : [...m[1]!].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) * 1_000_000;
  return offset + Number(m[2]);
};

const sql: string[] = [
  '-- สร้างโดย scripts/import-excel — ห้ามแก้มือ',
  `-- ที่มา: ${SOURCE} (ชีต ${SHEET})`,
  // ไฟล์นี้ใช้ล้างข้อมูลทดสอบในเครื่องเท่านั้น — ตัวกันหยุด SQL ถ้าปลายทางเป็นระบบจริง (มีบัญชีอีเมลจริง)
  ...localOnlyGuard(),
  // ออเดอร์อ้างถึงรัง/ลูกค้า → ลบก่อน
  'DELETE FROM hive_holds;',
  'DELETE FROM order_items;',
  'DELETE FROM orders;',
  'DELETE FROM once_keys;',
  'DELETE FROM bottlings;',
  'DELETE FROM lot_sources;',
  'DELETE FROM honey_lots;',
  'UPDATE hives SET customer_id = NULL;',
  'DELETE FROM customers;',
  'DELETE FROM hive_media;',
  'DELETE FROM hive_events;',
  'DELETE FROM hives;',
  'DELETE FROM suppliers;',
  'DELETE FROM species;',
  `INSERT INTO species (id, name_th, name_sci) VALUES (1, 'ชันโรงขนเงิน', 'Tetragonula pagdeni Schwarz');`,
];

const supplierIds = new Map<string, number>();
for (const h of hives) {
  if (!h.supplier) continue;
  const key = `${h.supplier.name}|${h.supplier.phone ?? ''}`;
  if (supplierIds.has(key)) continue;
  const sid = supplierIds.size + 1;
  supplierIds.set(key, sid);
  sql.push(
    `INSERT INTO suppliers (id, name, phone, area, notes) VALUES (${sid}, ${q(h.supplier.name)}, ${q(h.supplier.phone)}, ${q(h.originPlace)}, ${q(h.supplier.extra.join('\n') || null)});`,
  );
}

// รังก่อน (ยังไม่ใส่ ref รังแม่ เพราะรังแม่อาจมีเลขมากกว่ารังลูก)
for (const h of hives) {
  const sid = h.supplier ? supplierIds.get(`${h.supplier.name}|${h.supplier.phone ?? ''}`) : null;
  const notes = [...h.breederTags, ...h.privateNotes].join('\n') || null;
  sql.push(
    `INSERT INTO hives (id, code, species_id, origin, origin_place, acquired_on, acquired_on_precision, queen_born_on, box_type, status, purchase_price, supplier_id, sold_price, notes) VALUES (` +
      [id(h.code), q(h.code), 1, q(h.origin), q(h.originPlace), q(h.acquiredOn), q(h.acquiredPrecision), q(h.queenBornOn), q(h.boxType), q(h.status), q(h.purchasePrice), q(sid), q(h.soldPrice), q(notes)].join(', ') +
      ');',
  );
}
for (const h of hives) {
  if (h.queenSourceCode || h.broodSourceCode)
    sql.push(`UPDATE hives SET queen_source_hive_id = ${q(id(h.queenSourceCode))}, brood_source_hive_id = ${q(id(h.broodSourceCode))} WHERE id = ${id(h.code)};`);
}
for (const h of hives) {
  for (const e of h.events) {
    sql.push(
      `INSERT INTO hive_events (hive_id, type, occurred_on, occurred_on_precision, queen_cells, target_hive_id, note, is_public, idempotency_key) VALUES (` +
        [id(h.code), q(e.type), q(e.occurredOn), q(e.precision), q(e.queenCells), q(id(e.targetCode)), q(e.raw), 1, q(`excel:${h.code}:${e.cell}`)].join(', ') +
        ');',
    );
  }
  (photos.get(h.code) ?? []).forEach((p, i) =>
    sql.push(`INSERT INTO hive_media (hive_id, kind, r2_key, sort_order) VALUES (${id(h.code)}, 'passport', ${q(p.key)}, ${i});`),
  );
}
writeFileSync(join(OUT, 'seed.sql'), sql.join('\n') + '\n');

// ---------- รายงาน ----------
const count = <T,>(xs: T[], f: (x: T) => string) =>
  xs.reduce<Record<string, number>>((acc, x) => ((acc[f(x)] = (acc[f(x)] ?? 0) + 1), acc), {});
const events = hives.flatMap((h) => h.events);
const report = [
  `# รายงานการนำเข้า (${new Date().toISOString().slice(0, 10)})`,
  '',
  `- ไฟล์: \`${SOURCE}\` ชีต "${SHEET}"`,
  `- รัง: **${hives.length}** · สถานะ ${JSON.stringify(count(hives, (h) => h.status))}`,
  `- ที่มา: ${JSON.stringify(count(hives, (h) => h.origin))}`,
  `- เหตุการณ์: **${events.length}** ${JSON.stringify(count(events, (e) => e.type))} · จับคู่รังลูกได้ ${events.filter((e) => e.targetCode).length}`,
  `- คู่ค้า: ${supplierIds.size}`,
  `- รูป: ${[...photos.values()].reduce((n, l) => n + l.length, 0)} รูปใน ${photos.size} รัง (ข้าม ${skippedImages})`,
  `- ราคาซื้อรวม ${hives.reduce((n, h) => n + (h.purchasePrice ?? 0), 0).toLocaleString()} บาท · ราคาขายรวม ${hives.reduce((n, h) => n + (h.soldPrice ?? 0), 0).toLocaleString()} บาท`,
  '',
  `## ต้องตรวจด้วยมือ (${issues.length})`,
  '',
  '| รัง | เซลล์ | ปัญหา |',
  '|---|---|---|',
  ...issues.map((i) => `| ${i.code} | ${i.cell} | ${i.message.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
writeFileSync(join(OUT, 'report.md'), report);

console.log(report.split('\n').slice(0, 10).join('\n'));
console.log(`\n→ ${OUT}/seed.sql, ${OUT}/report.md, ${OUT}/photos/`);
