// ดึงสภาพอากาศจาก NASA POWER มาเก็บใน D1 (เฉพาะช่วงที่ยังไม่มี) และสรุปรายเดือน
import type { BatchItem } from 'drizzle-orm/batch';
import { sql } from 'drizzle-orm';
import { settings, weatherDaily } from '../db/schema.ts';
import { locationKey, parsePowerDaily, powerDailyUrl, yearsToFetch, type FarmLocation, type MonthWeather, type WeatherDay } from '../lib/weather.ts';
import type { Db } from './db.ts';

/** ดึงซ้ำได้ไม่บ่อยกว่านี้ (ไม่ว่าจะสำเร็จหรือไม่) — กันยิง API ทุกครั้งที่เปิดหน้า */
const MIN_INTERVAL_MS = 6 * 3600_000;
/** ดึงทีละไม่เกินกี่ปีต่อการเปิดหน้า 1 ครั้ง (ที่เหลือดึงต่อครั้งหน้า) — คุมเวลา/CPU ของ Worker */
const MAX_YEARS_PER_RUN = 2;

const getSetting = async (db: Db, key: string) => (await db.select({ v: settings.value }).from(settings).where(sql`${settings.key} = ${key}`))[0]?.v;
const setSetting = (db: Db, key: string, value: string) =>
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` } });

export interface WeatherStatus {
  /** วันล่าสุดที่มีข้อมูล */
  latest: string | null;
  days: number;
  /** ยังมีปีที่ต้องดึงอีก (ครั้งหน้าที่เปิดหน้าจะดึงต่อ) */
  pending: number;
  error?: string;
}

/**
 * ทำให้ข้อมูลอากาศตั้งแต่ startIso ถึงวันนี้ครบ (ทีละไม่เกิน 2 ปีต่อครั้ง)
 * - เปลี่ยนพิกัดฟาร์ม → ล้างข้อมูลเดิมแล้วดึงใหม่
 * - ล้มเหลว (เน็ต/บริการล่ม) → ไม่ทำให้หน้าพัง คืนข้อความ error และรอรอบถัดไป
 */
export async function ensureWeather(db: Db, loc: FarmLocation, startIso: string, todayIso: string, opts: { force?: boolean } = {}): Promise<WeatherStatus> {
  const key = locationKey(loc);
  if ((await getSetting(db, 'weather.coords')) !== key) {
    await db.batch([db.delete(weatherDaily), setSetting(db, 'weather.coords', key), setSetting(db, 'weather.lastFetchAt', '')]);
  }
  const have = Object.fromEntries(
    (await db.all<{ y: string; n: number }>(sql`select substr(date, 1, 4) as y, count(*) as n from weather_daily where t_max is not null group by y`)).map((r) => [Number(r.y), r.n]),
  );
  const todo = yearsToFetch(have, startIso, todayIso);
  let error: string | undefined;
  const last = Date.parse((await getSetting(db, 'weather.lastFetchAt')) ?? '') || 0;
  const due = opts.force || Date.now() - last > MIN_INTERVAL_MS || Object.keys(have).length === 0;

  if (todo.length && due) {
    await setSetting(db, 'weather.lastFetchAt', new Date().toISOString());
    for (const chunk of todo.slice(0, MAX_YEARS_PER_RUN)) {
      try {
        const res = await fetch(powerDailyUrl(loc, chunk.start, chunk.end), { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`NASA POWER ตอบ ${res.status}`);
        await saveDays(db, parsePowerDaily(await res.json()));
      } catch (e) {
        error = e instanceof Error && e.name === 'TimeoutError' ? 'NASA POWER ตอบช้าเกินไป' : e instanceof Error ? e.message : 'ดึงข้อมูลอากาศไม่สำเร็จ';
        break;
      }
    }
  }
  const [s] = await db.all<{ latest: string | null; n: number }>(sql`select max(date) as latest, count(*) as n from weather_daily where t_max is not null`);
  const left = yearsToFetch(
    Object.fromEntries((await db.all<{ y: string; n: number }>(sql`select substr(date, 1, 4) as y, count(*) as n from weather_daily where t_max is not null group by y`)).map((r) => [Number(r.y), r.n])),
    startIso,
    todayIso,
  ).length;
  return { latest: s?.latest ?? null, days: s?.n ?? 0, pending: left, ...(error ? { error } : {}) };
}

async function saveDays(db: Db, days: WeatherDay[]) {
  // D1 จำกัดตัวแปรต่อคำสั่ง ~100 → แถวละ 5 ค่า ทีละ 15 แถว
  const stmts: BatchItem<'sqlite'>[] = [];
  for (let i = 0; i < days.length; i += 15) {
    const rows = days.slice(i, i + 15);
    stmts.push(
      db.insert(weatherDaily).values(rows).onConflictDoUpdate({
        target: weatherDaily.date,
        set: { tMax: sql`excluded.t_max`, tMin: sql`excluded.t_min`, rainMm: sql`excluded.rain_mm`, humidity: sql`excluded.humidity`, fetchedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` },
      }),
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    const part = stmts.slice(i, i + 50);
    if (part.length) await db.batch(part as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }
}

/** สรุปรายเดือนตั้งแต่ fromMonth (YYYY-MM) */
export async function monthlyWeather(db: Db, fromMonth: string): Promise<Map<string, MonthWeather>> {
  const rows = await db.all<{ month: string; rain: number | null; tmax: number | null; tmin: number | null; rh: number | null; days: number }>(sql`
    select substr(date, 1, 7) as month, sum(rain_mm) as rain, avg(t_max) as tmax, avg(t_min) as tmin, avg(humidity) as rh, count(*) as days
      from weather_daily
     where date >= ${fromMonth + '-01'} and t_max is not null
     group by month order by month`);
  return new Map(rows.map((r) => [r.month, { month: r.month, rainMm: r.rain, tMaxAvg: r.tmax, tMinAvg: r.tmin, humidityAvg: r.rh, days: r.days }]));
}
