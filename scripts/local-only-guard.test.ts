import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { GUARD_TABLE, localOnlyGuard } from './local-only-guard.ts';

// รัน SQL ทีละคำสั่งแบบ wrangler d1 execute --file (หยุดที่คำสั่งแรกที่ผิด) แล้วต่อด้วยคำสั่งล้างข้อมูล
const run = (emails: string[]) => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (email TEXT); CREATE TABLE hives (code TEXT); INSERT INTO hives VALUES (\'A1\');');
  for (const e of emails) db.prepare('INSERT INTO users VALUES (?)').run(e);
  const apply = () => db.exec([...localOnlyGuard(), 'DELETE FROM hives;'].join('\n'));
  return { db, apply, hives: () => (db.prepare('SELECT count(*) n FROM hives').get() as { n: number }).n };
};

describe('localOnlyGuard', () => {
  it('ฐานข้อมูลในเครื่อง (อีเมล @metafarm.local หรือยังไม่มีผู้ใช้) → ผ่าน', () => {
    for (const emails of [[], ['owner@metafarm.local', 'staff123@METAFARM.local']]) {
      const t = run(emails);
      t.apply();
      expect(t.hives()).toBe(0);
      expect(t.db.prepare(`SELECT name FROM sqlite_master WHERE name = ?`).get(GUARD_TABLE)).toBeUndefined();
    }
  });

  it('มีบัญชีอีเมลจริง (ระบบจริง) → หยุดก่อนล้างข้อมูล', () => {
    const t = run(['owner@metafarm.local', 'someone@gmail.com']);
    expect(t.apply).toThrow(/refuse_production_db_has_real_users/);
    expect(t.hives()).toBe(1);
  });
});
