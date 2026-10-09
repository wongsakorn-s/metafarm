// ฐานข้อมูล D1 ชั่วคราวสำหรับ test ฝั่งเซิร์ฟเวอร์ (vitest) — miniflare ตัวเดียวกับ astro dev แต่เก็บในโฟลเดอร์ชั่วคราว
// ใช้ migration จริงใน drizzle/ จึงทดสอบ SQL/batch/constraint ได้เหมือนระบบจริง · ไม่แตะฐานข้อมูลในเครื่อง (.wrangler/state)
// ใช้เฉพาะในไฟล์ *.test.ts — ไม่ถูก import จากหน้าเว็บ
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import * as schema from '../db/schema.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

/** `until`: หยุดก่อน migration ที่ชื่อขึ้นต้นด้วยค่านี้ (เช่น '0013') เพื่อใส่ข้อมูลแบบเก่า แล้วค่อย `migrate()` ส่วนที่เหลือ */
export async function testDb(opts: { until?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'metafarm-d1-'));
  const proxy = await getPlatformProxy<{ DB: D1Database; MEDIA: R2Bucket }>({ persist: { path: dir } });
  const d1 = proxy.env.DB;
  const files = readdirSync('drizzle').filter((x) => x.endsWith('.sql')).sort();
  const apply = async (list: string[]) => {
    for (const f of list) for (const stmt of readFileSync(join('drizzle', f), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await d1.prepare(stmt).run();
  };
  const cut = opts.until ? files.findIndex((f) => f >= opts.until!) : -1;
  await apply(cut < 0 ? files : files.slice(0, cut));
  const migrate = () => apply(cut < 0 ? [] : files.slice(cut));
  const db: Db = drizzle(d1, { schema });
  await d1.batch([
    d1.prepare(`INSERT INTO species (id, name_th) VALUES (1, 'ชันโรงขนเงิน')`),
    d1.prepare(`INSERT INTO users (id, email, name, password_hash, role, active) VALUES (1, 'owner@metafarm.local', 'เจ้าของ', 'x', 'owner', 1), (2, 'staff@metafarm.local', 'พนักงาน', 'x', 'staff', 1)`),
  ]);
  const owner: SessionUser = { id: 1, email: 'owner@metafarm.local', name: 'เจ้าของ', role: 'owner', mustChangePassword: false };
  const staff: SessionUser = { id: 2, email: 'staff@metafarm.local', name: 'พนักงาน', role: 'staff', mustChangePassword: false };
  return {
    db, d1, owner, staff, migrate,
    /** R2 ชั่วคราว (โฟลเดอร์เดียวกับฐานข้อมูล) */
    media: proxy.env.MEDIA,
    close: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
