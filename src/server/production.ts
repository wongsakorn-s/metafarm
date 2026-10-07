// สรุปผลผลิตรายเดือน (น้ำผึ้ง + การขยายรัง) สำหรับหน้า "ผลผลิต + อากาศ" — ข้อมูลหลังบ้านเท่านั้น
import { sql } from 'drizzle-orm';
import type { Db } from './db.ts';

export interface MonthProduction {
  month: string;
  honeyMl: number;
  harvests: number;
  broodSplits: number;
  queenCells: number;
  newHives: number;
}

/** วันแรกที่มีข้อมูลรัง (วันที่ได้มา/เหตุการณ์แรก) — ใช้เป็นจุดเริ่มของกราฟและข้อมูลอากาศ */
export async function firstDataDate(db: Db): Promise<string | null> {
  const [r] = await db.all<{ d: string | null }>(sql`
    select min(d) as d from (
      select min(acquired_on) as d from hives where acquired_on is not null
      union all select min(occurred_on) from hive_events
    )`);
  return r?.d ?? null;
}

export async function monthlyProduction(db: Db, fromMonth: string): Promise<Map<string, MonthProduction>> {
  const from = fromMonth + '-01';
  const [events, added] = await Promise.all([
    db.all<{ month: string; ml: number | null; harvests: number; splits: number; queens: number }>(sql`
      select substr(occurred_on, 1, 7) as month,
             sum(case when type = 'honey_harvest' then coalesce(honey_ml, 0) end) as ml,
             sum(type = 'honey_harvest') as harvests,
             sum(type = 'brood_split') as splits,
             sum(type = 'queen_cell_taken') as queens
        from hive_events
       where occurred_on >= ${from} and type in ('honey_harvest', 'brood_split', 'queen_cell_taken')
       group by month`),
    db.all<{ month: string; n: number }>(sql`
      select substr(acquired_on, 1, 7) as month, count(*) as n from hives
       where acquired_on >= ${from} group by month`),
  ]);
  const out = new Map<string, MonthProduction>();
  const get = (m: string) => {
    let v = out.get(m);
    if (!v) out.set(m, (v = { month: m, honeyMl: 0, harvests: 0, broodSplits: 0, queenCells: 0, newHives: 0 }));
    return v;
  };
  for (const e of events) Object.assign(get(e.month), { honeyMl: e.ml ?? 0, harvests: e.harvests, broodSplits: e.splits, queenCells: e.queens });
  for (const a of added) get(a.month).newHives = a.n;
  return out;
}

/** รังที่ให้น้ำผึ้งมากที่สุดในช่วงเวลา */
export async function topHoneyHives(db: Db, fromIso: string, limit = 10, toIso = '9999-12-31') {
  return db.all<{ code: string; ml: number; harvests: number }>(sql`
    select h.code as code, sum(e.honey_ml) as ml, count(*) as harvests
      from hive_events e join hives h on h.id = e.hive_id
     where e.type = 'honey_harvest' and e.occurred_on >= ${fromIso} and e.occurred_on < ${toIso} and coalesce(e.honey_ml, 0) > 0
     group by h.id order by ml desc limit ${limit}`);
}
