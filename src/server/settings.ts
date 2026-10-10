import type { BatchItem } from 'drizzle-orm/batch';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { auditLogs, settings } from '../db/schema.ts';
import { contactToRows, courseToRows, locationToRows, parseSettingRows, paymentToRows, type SiteSettings, type contactSchema, type courseSchema, type locationSchema, type paymentSchema } from '../lib/settings.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';
import { abortIf, isGuardAbort } from './versioned.ts';

export async function getSettings(db: Db): Promise<SiteSettings> {
  return parseSettingRows(await db.select({ key: settings.key, value: settings.value }).from(settings));
}

const upsert = (db: Db, rows: { key: string; value: string }[]) =>
  rows.map((r) =>
    db.insert(settings).values(r).onConflictDoUpdate({ target: settings.key, set: { value: r.value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` } }),
  );

/**
 * เวอร์ชันของการตั้งค่า (updated_at ล่าสุดของทุกแถว) — ฟอร์มส่งกลับมาเป็น "version"
 * มีคนบันทึกการตั้งค่าไปก่อนระหว่างที่แก้อยู่ = ไม่ทับ (เดิมฟอร์มหลังทับค่าของอีกคนเงียบ ๆ)
 */
export async function settingsVersion(db: Db): Promise<string> {
  const [r] = await db.select({ v: sql<string>`coalesce(max(${settings.updatedAt}), '')` }).from(settings);
  return r?.v ?? '';
}

/** บันทึก — คืน false ถ้าเวอร์ชันไม่ตรง (มีคนบันทึกไปก่อน) · ไม่ส่ง version = ไม่ตรวจ */
async function save(db: Db, user: SessionUser, action: string, rows: { key: string; value: string }[], diff: unknown, version?: string): Promise<boolean> {
  const stmts: BatchItem<'sqlite'>[] = [
    ...(version === undefined ? [] : [abortIf(db, sql`coalesce((select max(updated_at) from settings), '') != ${version}`)]),
    ...upsert(db, rows),
    db.insert(auditLogs).values({ userId: user.id, action, entity: 'settings', diff }),
  ];
  try {
    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (e) {
    if (isGuardAbort(e)) return false;
    throw e;
  }
  return true;
}

export const saveContact = (db: Db, user: SessionUser, d: z.output<typeof contactSchema>, version?: string) =>
  save(db, user, 'settings.contact', contactToRows(d), { confirmed: d.confirmed, channels: { line: !!d.lineId, phone: !!d.phone, facebook: !!d.facebookUrl, map: !!d.mapUrl } }, version);

export const saveCourse = (db: Db, user: SessionUser, d: z.output<typeof courseSchema>, version?: string) =>
  save(db, user, 'settings.course', courseToRows(d), { slug: d.slug, priceThb: d.priceThb, confirmed: d.confirmed }, version);

export const saveLocation = (db: Db, user: SessionUser, d: z.output<typeof locationSchema>, version?: string) =>
  save(db, user, 'settings.location', locationToRows(d), { changed: true }, version);

export const saveHero = (db: Db, user: SessionUser, heroHive: string, version?: string) =>
  save(db, user, 'settings.hero', [{ key: 'site.heroHive', value: heroHive }], { heroHive }, version);

export const savePayment = (db: Db, user: SessionUser, d: z.output<typeof paymentSchema>, version?: string) =>
  save(db, user, 'settings.payment', paymentToRows(d), { set: d.paymentInfo !== '' }, version);
