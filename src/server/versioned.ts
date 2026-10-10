// ตัวช่วยกันเขียนทับกัน (Phase 5.3) — ใช้คู่กับ src/lib/concurrency.ts
// รูปแบบ: db.batch([ UPDATE ... WHERE id = ? AND updated_at = <เวอร์ชันที่ฟอร์มเห็น> RETURNING id, auditIfChanged(...) ])
//   ผลของคำสั่งแรกว่าง = มีคนบันทึกไปก่อน → ไม่มีอะไรเปลี่ยน และ audit ก็ไม่ถูกเขียน (อยู่ใน batch/transaction เดียวกัน)
import { and, desc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { auditLogs, onceKeys, users } from '../db/schema.ts';
import type { Db } from './db.ts';

/**
 * เขียน audit เฉพาะเมื่อคำสั่งก่อนหน้าใน batch แก้แถวได้จริง (SQLite changes())
 * ใช้ insert … select ของ drizzle เพราะ db.batch รับเฉพาะ query builder (db.run(sql) ใส่ใน batch ไม่ได้)
 * — drizzle บังคับให้เลือกครบทุกคอลัมน์ตามลำดับในตาราง
 */
export const auditIfChanged = (db: Db, userId: number, action: string, entity: string, entityId: number, diff?: unknown) =>
  db.insert(auditLogs).select(
    db.select({
      id: sql<number>`null`.as('id'),
      userId: sql<number>`${userId}`.as('user_id'),
      action: sql<string>`${action}`.as('action'),
      entity: sql<string>`${entity}`.as('entity'),
      entityId: sql<number>`${entityId}`.as('entity_id'),
      diff: sql<string | null>`${diff == null ? null : JSON.stringify(diff)}`.as('diff'),
      at: sql<string>`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`.as('at'),
    }).from(sql`(select 1)`).where(sql`changes() > 0`),
  );

/** ชื่อคนที่บันทึกแถวนี้ล่าสุด หลังเวอร์ชันที่ฟอร์มเห็น (ถ้ารู้) — ใช้ในข้อความแจ้งว่าใครแก้ไปก่อน */
export async function editedBy(db: Db, entity: string, entityId: number, since: string): Promise<string | null> {
  const [r] = await db
    .select({ name: users.name })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId), gt(auditLogs.at, since)))
    .orderBy(desc(auditLogs.id))
    .limit(1);
  return r?.name ?? null;
}

/** คำสั่งแรกของ batch ที่ทำได้ครั้งเดียว — ทำซ้ำ/พร้อมกัน = UNIQUE error ทั้ง batch ย้อนกลับ (จับด้วย isOnceConflict) */
export const once = (db: Db, key: string) => db.insert(onceKeys).values({ key });
const ONCE_DUP = /UNIQUE constraint failed: once_keys/i;
export const isOnceConflict = (e: unknown) => ONCE_DUP.test(String(e)) || ONCE_DUP.test(String((e as { cause?: unknown })?.cause ?? ''));

/**
 * ตัวกันใน batch: ถ้าเงื่อนไขเป็นจริง (ข้อมูลเปลี่ยนไปหลังจากที่อ่านมาตรวจ) ทั้ง batch ย้อนกลับ — จับด้วย isGuardAbort
 * SQLite ไม่มี RAISE นอก trigger จึงใส่ NULL ลง once_keys.key (NOT NULL) ให้คำสั่งล้มเฉพาะเมื่อเงื่อนไขจริง
 * ใช้เมื่อการตัดสินใจอาศัยค่าที่อ่านก่อน batch เช่นสถานะรัง (อ่านแล้ว → อีกเครื่องเปลี่ยน → batch ของเราต้องไม่ทับ)
 */
export const abortIf = (db: Db, condition: SQL) =>
  db.insert(onceKeys).select(sql`select null, (strftime('%Y-%m-%dT%H:%M:%fZ','now')) where ${condition}`);
const GUARD = /NOT NULL constraint failed: once_keys\.key/i;
export const isGuardAbort = (e: unknown) => GUARD.test(String(e)) || GUARD.test(String((e as { cause?: unknown })?.cause ?? ''));

/** ผลของการบันทึกที่อาจชน: conflict = มีคนบันทึกไปก่อน (หน้าแสดงค่าล่าสุดให้เทียบ) */
export type Saved = { ok: true } | { ok: false; error: string; conflict?: boolean };
