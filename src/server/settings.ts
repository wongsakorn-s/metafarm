import type { BatchItem } from 'drizzle-orm/batch';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { auditLogs, settings } from '../db/schema.ts';
import { contactToRows, courseToRows, parseSettingRows, type SiteSettings, type contactSchema, type courseSchema } from '../lib/settings.ts';
import type { SessionUser } from './auth.ts';
import type { Db } from './db.ts';

export async function getSettings(db: Db): Promise<SiteSettings> {
  return parseSettingRows(await db.select({ key: settings.key, value: settings.value }).from(settings));
}

const upsert = (db: Db, rows: { key: string; value: string }[]) =>
  rows.map((r) =>
    db.insert(settings).values(r).onConflictDoUpdate({ target: settings.key, set: { value: r.value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` } }),
  );

async function save(db: Db, user: SessionUser, action: string, rows: { key: string; value: string }[], diff: unknown) {
  const stmts: BatchItem<'sqlite'>[] = [...upsert(db, rows), db.insert(auditLogs).values({ userId: user.id, action, entity: 'settings', diff })];
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

export const saveContact = (db: Db, user: SessionUser, d: z.output<typeof contactSchema>) =>
  save(db, user, 'settings.contact', contactToRows(d), { confirmed: d.confirmed, channels: { line: !!d.lineId, phone: !!d.phone, facebook: !!d.facebookUrl, map: !!d.mapUrl } });

export const saveCourse = (db: Db, user: SessionUser, d: z.output<typeof courseSchema>) =>
  save(db, user, 'settings.course', courseToRows(d), { slug: d.slug, priceThb: d.priceThb, confirmed: d.confirmed });
