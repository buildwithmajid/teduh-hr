import { computeLateMinutes, haversineMeters, localMinutesOf, resolveWorkDateStr } from './attendance.utils';

describe('attendance.utils', () => {
  it('haversineMeters menghitung jarak akurat (0m di titik sama, ~111m per 0.001 deg lat)', () => {
    expect(haversineMeters(-6.2724, 106.8148, -6.2724, 106.8148)).toBe(0);
    const d = haversineMeters(-6.2724, 106.8148, -6.2734, 106.8148);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it('localMinutesOf menghormati zona waktu WIB vs WITA', () => {
    // 2026-11-23T02:00:00Z = 09:00 WIB (540m) = 10:00 WITA (600m)
    const utc = new Date('2026-11-23T02:00:00.000Z');
    expect(localMinutesOf(utc, 'Asia/Jakarta')).toBe(540);
    expect(localMinutesOf(utc, 'Asia/Makassar')).toBe(600);
  });

  it('computeLateMinutes menghormati toleransi keterlambatan', () => {
    // 09:10 WIB untuk shift 09:00 toleransi 15 menit → tidak telat
    expect(computeLateMinutes(new Date('2026-11-23T02:10:00.000Z'), '09:00', 15, 'Asia/Jakarta')).toBe(0);
    // 09:20 WIB untuk shift 09:00 toleransi 15 menit → telat 20 menit
    expect(computeLateMinutes(new Date('2026-11-23T02:20:00.000Z'), '09:00', 15, 'Asia/Jakarta')).toBe(20);
  });

  it('shift malam: clock-in jam 00:15 untuk shift 22:00-06:00 tercatat di tanggal kemarin & telat 135 menit', () => {
    // 2026-11-24 00:15 WIB = 2026-11-23T17:15:00Z
    const clockIn = new Date('2026-11-23T17:15:00.000Z');
    expect(resolveWorkDateStr(clockIn, 'Asia/Jakarta', true, '06:00')).toBe('2026-11-23');
    expect(computeLateMinutes(clockIn, '22:00', 10, 'Asia/Jakarta', true)).toBe(135);
  });
});
