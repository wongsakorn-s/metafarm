// การตั้งค่า: สองคนบันทึกพร้อมกัน — ฟอร์มที่เปิดไว้ก่อนอีกคนบันทึก ไม่ทับค่าของอีกคน
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSettings, saveHero, savePayment, settingsVersion } from './settings.ts';
import { testDb } from './test-d1.ts';

let t: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { t = await testDb(); }, 60_000);
afterAll(() => t?.close());

describe('กันเขียนทับการตั้งค่า', () => {
  it('ฟอร์มที่เห็นเวอร์ชันเก่า → ไม่บันทึก · ใช้เวอร์ชันล่าสุด → บันทึกได้ · ไม่ส่งเวอร์ชัน = ไม่ตรวจ', async () => {
    const seen = await settingsVersion(t.db);
    expect(await savePayment(t.db, t.owner, { paymentInfo: 'บัญชี A' }, seen)).toBe(true);
    // อีกเครื่องเปิดหน้าไว้ก่อน (ยังถือเวอร์ชันเก่า)
    expect(await saveHero(t.db, t.owner, 'A12', seen)).toBe(false);
    expect((await getSettings(t.db)).heroHive).not.toBe('A12');
    expect(await saveHero(t.db, t.owner, 'A12', await settingsVersion(t.db))).toBe(true);
    expect((await getSettings(t.db)).heroHive).toBe('A12');
    expect(await saveHero(t.db, t.owner, 'A13')).toBe(true);
  });
});
