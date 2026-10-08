import { describe, expect, it } from 'vitest';
import { LIMITS, lockedBy, throttleKeys } from './throttle.ts';

describe('throttleKeys', () => {
  it('pair คงรูปแบบเดิม (อีเมล|IP) · อีเมลตัวเล็กและตัดช่องว่าง', () => {
    expect(throttleKeys(' Owner@Farm.Local ', '1.2.3.4')).toEqual({ pair: 'owner@farm.local|1.2.3.4', email: 'email|owner@farm.local', ip: 'ip|1.2.3.4' });
  });
  it('กุญแจสามแบบไม่ชนกัน', () => {
    const k = throttleKeys('a@b.c', 'x');
    expect(new Set(Object.values(k)).size).toBe(3);
  });
});

describe('lockedBy', () => {
  it('ต่ำกว่าขีด = ลองได้', () => {
    expect(lockedBy({})).toEqual([]);
    expect(lockedBy({ pair: LIMITS.pair - 1, email: LIMITS.email - 1, ip: LIMITS.ip - 1 })).toEqual([]);
  });
  it('ถึงขีดของกุญแจไหน = ล็อกด้วยกุญแจนั้น', () => {
    expect(lockedBy({ pair: 5 })).toEqual(['pair']);
    expect(lockedBy({ pair: 1, email: 10 })).toEqual(['email']);
    expect(lockedBy({ ip: 30 })).toEqual(['ip']);
    expect(lockedBy({ pair: 9, email: 12, ip: 40 })).toEqual(['pair', 'email', 'ip']);
  });
  it('บอทเปลี่ยน IP ทุก 4 ครั้ง: ไม่ติด pair แต่ติด email ที่ 10 ครั้ง', () => {
    expect(LIMITS.email).toBeGreaterThan(LIMITS.pair);
    expect(lockedBy({ pair: 2, email: 10, ip: 2 })).toEqual(['email']);
  });
});
