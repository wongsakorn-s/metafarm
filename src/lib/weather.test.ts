import { describe, expect, it } from 'vitest';
import { compareDryWet, isDryMonth, monthRange, parseLatLng, parsePowerDaily, powerDailyUrl, yearsToFetch, type MonthWeather } from './weather.ts';
import { monthLabel, niceRange, niceScale } from './chart.ts';

describe('NASA POWER', () => {
  it('URL มีพารามิเตอร์ที่ต้องใช้ และวันที่แบบ YYYYMMDD', () => {
    const u = new URL(powerDailyUrl({ lat: 12.98, lng: 101.22 }, '2024-01-01', '2024-12-31'));
    expect(u.hostname).toBe('power.larc.nasa.gov');
    expect(u.searchParams.get('parameters')).toBe('T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M');
    expect(u.searchParams.get('start')).toBe('20240101');
    expect(u.searchParams.get('latitude')).toBe('12.9800');
  });
  it('ค่า -999 เป็น null และวันที่ไม่มีค่าเลยถูกข้าม', () => {
    const rows = parsePowerDaily({
      header: { fill_value: -999 },
      properties: { parameter: {
        T2M_MAX: { '20240101': 31.2, '20240102': -999 },
        T2M_MIN: { '20240101': 22.1, '20240102': -999 },
        PRECTOTCORR: { '20240101': 0, '20240102': -999 },
        RH2M: { '20240101': 70, '20240102': -999 },
      } },
    });
    expect(rows).toEqual([{ date: '2024-01-01', tMax: 31.2, tMin: 22.1, rainMm: 0, humidity: 70 }]);
  });
  it('รูปแบบผิด → error ชัดเจน', () => {
    expect(() => parsePowerDaily({ messages: ['bad'] })).toThrow(/NASA POWER/);
  });
});

describe('ปีที่ต้องดึง', () => {
  it('ปีล่าสุดก่อน · ปีที่ครบแล้วข้าม · ปีแรกเริ่มจากวันเริ่ม', () => {
    const r = yearsToFetch({ 2023: 365 }, '2022-03-25', '2024-03-01');
    expect(r.map((x) => x.year)).toEqual([2024, 2022]);
    expect(r.find((x) => x.year === 2022)!.start).toBe('2022-03-25');
    expect(r.find((x) => x.year === 2024)!.end).toBe('2024-03-01');
  });
  it('ปีปัจจุบันถือว่าครบเมื่อมีถึงวันนี้ − 7 วัน', () => {
    // 1 ม.ค.–24 ก.พ. 2024 = 55 วัน
    expect(yearsToFetch({ 2024: 55 }, '2024-01-01', '2024-03-02')).toEqual([]);
    expect(yearsToFetch({ 2024: 54 }, '2024-01-01', '2024-03-02')).toHaveLength(1);
  });
});

describe('รายเดือนและเดือนแล้ง', () => {
  const w = (month: string, rainMm: number, days = 30): MonthWeather => ({ month, rainMm, tMaxAvg: 33, tMinAvg: 24, humidityAvg: 75, days });
  it('monthRange ข้ามปีได้', () => {
    expect(monthRange('2023-11', '2024-02')).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
  });
  it('เดือนแล้ง = ฝน < 50 มม. และข้อมูลเกือบครบเดือน', () => {
    expect(isDryMonth(w('2024-01', 12))).toBe(true);
    expect(isDryMonth(w('2024-06', 180))).toBe(false);
    expect(isDryMonth(w('2024-10', 5, 6))).toBe(false); // เดือนที่เพิ่งเริ่ม
  });
  it('เทียบเดือนแล้ง/ปกติ: ข้อมูลน้อยเกินไป → null', () => {
    const weather = new Map([w('2024-01', 10), w('2024-02', 200)].map((x) => [x.month, x]));
    expect(compareDryWet([{ month: '2024-01', value: 1 }, { month: '2024-02', value: 5 }], weather)).toBeNull();
    expect(compareDryWet([{ month: '2024-01', value: 1 }, { month: '2024-02', value: 5 }], weather, 1)).toMatchObject({ dryAvg: 1, wetAvg: 5 });
  });
});

describe('พิกัดฟาร์ม', () => {
  it('รับ "lat, lng" และลิงก์ Google Maps แบบยาว · ปฏิเสธนอกประเทศไทย', () => {
    expect(parseLatLng('12.9812, 101.2234')).toEqual({ lat: 12.9812, lng: 101.2234 });
    expect(parseLatLng('https://www.google.com/maps/place/x/@12.98123,101.22345,17z')).toEqual({ lat: 12.98123, lng: 101.22345 });
    expect(parseLatLng('40.7, -74.0')).toBeNull();
    expect(parseLatLng('ระยอง')).toBeNull();
  });
});

describe('สเกลกราฟ', () => {
  it('niceScale ปัดขึ้นเป็นเลขกลม', () => {
    expect(niceScale(37)).toEqual({ max: 40, step: 10 });
    expect(niceScale(0)).toEqual({ max: 1, step: 0.25 });
    expect(niceScale(460).max).toBe(500);
  });
  it('niceRange ไม่เริ่มที่ 0', () => {
    expect(niceRange(29.3, 35.1)).toEqual({ min: 28, max: 36, step: 2 });
  });
  it('ป้ายเดือนเป็น พ.ศ.', () => {
    expect(monthLabel('2024-07')).toBe('ก.ค. 67');
    expect(monthLabel('2024-07', false)).toBe('ก.ค.');
  });
});
