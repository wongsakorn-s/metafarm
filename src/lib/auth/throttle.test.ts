import { describe, expect, it } from 'vitest';
import { ipBucket, LIMITS, lockedBy, throttleKeys } from './throttle.ts';

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

describe('ipBucket', () => {
  it('IPv4 ตามเดิม · IPv4 ในรูป IPv6 = IPv4', () => {
    expect(ipBucket('1.2.3.4')).toBe('1.2.3.4');
    expect(ipBucket('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(ipBucket('local')).toBe('local');
  });
  it('IPv6 → ช่วง /64 ไม่ว่าเขียนย่อแบบไหน', () => {
    const b = '2001:db8:1:2::/64';
    for (const ip of ['2001:db8:1:2::1', '2001:0db8:0001:0002:abcd:ef01:2345:6789', '2001:DB8:1:2:0:0:0:99', '2001:db8:1:2::1%eth0']) expect(ipBucket(ip)).toBe(b);
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(b);
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
  });
  it('กุญแจของ IPv6 ใช้ช่วง /64', () => {
    expect(throttleKeys('a@b.c', '2001:db8:1:2::7')).toEqual(throttleKeys('a@b.c', '2001:db8:1:2:ffff::1'));
  });
});
