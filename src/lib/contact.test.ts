import { describe, expect, it } from 'vitest';
import { actionLabel, contactActions, messengerBase, messengerChatUrl } from './contact.ts';
import { DEFAULT_CONTACT, contactSchema, contactToRows, parseSettingRows, type ContactSettings } from './settings.ts';

const fb = (facebookUrl: string, messengerUrl = '') => messengerBase({ facebookUrl, messengerUrl });

describe('messengerBase: เพจและโปรไฟล์ส่วนตัว', () => {
  it('ชื่อเพจ/ชื่อผู้ใช้ → m.me/<ชื่อ>', () => {
    expect(fb('https://www.facebook.com/metafarm.rayong')).toBe('https://m.me/metafarm.rayong');
    expect(fb('https://facebook.com/metafarm/')).toBe('https://m.me/metafarm');
    expect(fb('https://m.facebook.com/metafarm?ref=xyz')).toBe('https://m.me/metafarm');
    expect(fb('https://fb.me/metafarm')).toBe('https://m.me/metafarm');
    expect(fb('https://web.facebook.com/somchai.jaidee')).toBe('https://m.me/somchai.jaidee');
  });
  it('โปรไฟล์ที่เป็นตัวเลข → m.me/<เลข>', () => {
    expect(fb('https://www.facebook.com/profile.php?id=100012345678901')).toBe('https://m.me/100012345678901');
    expect(fb('https://www.facebook.com/people/Somchai-Jaidee/100012345678901/')).toBe('https://m.me/100012345678901');
  });
  it('ลิงก์ที่แปลงไม่ได้ → null', () => {
    expect(fb('https://www.facebook.com/share/1AbCdEf/')).toBeNull();
    expect(fb('https://www.facebook.com/groups/12345678')).toBeNull();
    expect(fb('https://www.facebook.com/profile.php')).toBeNull();
    expect(fb('https://example.com/metafarm')).toBeNull();
    expect(fb('')).toBeNull();
    expect(fb('not a url')).toBeNull();
  });
  it('ลิงก์ Messenger ที่ใส่เองมาก่อนเสมอ', () => {
    expect(fb('https://www.facebook.com/share/1AbCdEf/', 'https://m.me/metafarm.th/')).toBe('https://m.me/metafarm.th');
    expect(fb('', 'https://m.me/abc?ref=web')).toBe('https://m.me/abc');
  });
  it('messengerChatUrl ใส่ข้อความใน ?text=', () => {
    expect(messengerChatUrl({ facebookUrl: 'https://facebook.com/metafarm', messengerUrl: '' }, 'สนใจรัง A25')).toBe(`https://m.me/metafarm?text=${encodeURIComponent('สนใจรัง A25')}`);
    expect(messengerChatUrl({ facebookUrl: '', messengerUrl: '' }, 'x')).toBeNull();
  });
});

describe('contactActions', () => {
  const base: ContactSettings = { ...DEFAULT_CONTACT, lineId: '@metafarm', phone: '081-234-5678', facebookUrl: 'https://facebook.com/metafarm', messengerUrl: '', primary: 'messenger' };
  it('ช่องทางหลักมาก่อน ตามด้วยที่เหลือ', () => {
    expect(contactActions(base, 'สนใจ').map((a) => [a.channel, a.primary])).toEqual([['messenger', true], ['line', false], ['phone', false]]);
    expect(contactActions({ ...base, primary: 'phone' }).map((a) => a.channel)).toEqual(['phone', 'messenger', 'line']);
    expect(contactActions({ ...base, primary: 'line' })[0]!.href).toBe('https://line.me/R/oaMessage/%40metafarm/');
  });
  it('ช่องทางที่เว้นว่างไม่แสดง · ช่องทางหลักว่าง → ปุ่มแรกที่มีเป็นปุ่มหลัก', () => {
    const noFb = { ...base, facebookUrl: '' };
    expect(contactActions(noFb).map((a) => [a.channel, a.primary])).toEqual([['line', true], ['phone', false]]);
    expect(contactActions({ ...base, lineId: '', phone: '', facebookUrl: '' })).toEqual([]);
  });
  it('โทร = tel: · ข้อความติดไปด้วยเพื่อบอกตอนโทร', () => {
    const p = contactActions({ ...base, primary: 'phone' }, 'รัง A25')[0]!;
    expect(p).toMatchObject({ channel: 'phone', href: 'tel:0812345678', message: 'รัง A25' });
  });
  it('คำบนปุ่มตามบริบท', () => {
    expect(actionLabel('messenger', 'order')).toBe('สั่งทาง Messenger');
    expect(actionLabel('phone', 'training')).toBe('โทรสมัครอบรม');
    expect(actionLabel('line')).toBe('ทักไลน์สอบถาม');
  });
});

describe('การตั้งค่าช่องทางหลัก', () => {
  it('ค่าเริ่มต้น = Messenger · ค่าแปลก ๆ ในฐานข้อมูลใช้ค่าเริ่มต้น', () => {
    expect(parseSettingRows([]).contact.primary).toBe('messenger');
    expect(parseSettingRows([{ key: 'contact.primary', value: 'phone' }]).contact.primary).toBe('phone');
    expect(parseSettingRows([{ key: 'contact.primary', value: 'fax' }]).contact.primary).toBe('messenger');
  });
  it('ฟอร์ม: บันทึกลิงก์ Messenger + ช่องทางหลัก · ลิงก์ต้องเป็น m.me/messenger.com', () => {
    const ok = contactSchema.safeParse({ lineId: '', phone: '', facebookUrl: '', messengerUrl: 'https://m.me/metafarm', mapUrl: '', primary: 'messenger', confirmed: 'on' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(contactToRows(ok.data).filter((r) => r.key === 'contact.messengerUrl' || r.key === 'contact.primary').map((r) => r.value)).toEqual(['https://m.me/metafarm', 'messenger']);
    expect(contactSchema.safeParse({ lineId: '', phone: '', facebookUrl: '', messengerUrl: 'https://evil.example/m.me', mapUrl: '', primary: 'line' }).success).toBe(false);
    expect(contactSchema.safeParse({ lineId: '', phone: '', facebookUrl: '', messengerUrl: '', mapUrl: '', primary: 'fax' }).success).toBe(false);
  });
});
