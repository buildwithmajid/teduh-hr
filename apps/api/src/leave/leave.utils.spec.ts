import { calculateLeaveDays, isoWeekBounds, serviceMonths } from './leave.utils';
import { formatDateOnly, parseDateOnly } from '../common/dates';

describe('leave.utils', () => {
  it('melewati Sabtu, Minggu (5_day) dan hari libur nasional', () => {
    // 2026-11-20 (Jumat) s.d. 2026-11-24 (Selasa), dengan Senin 23 Nov sebagai libur
    const res = calculateLeaveDays({
      startDate: '2026-11-20',
      endDate: '2026-11-24',
      isHalfDay: false,
      countsWorkingDaysOnly: true,
      workPattern: 'FIVE_DAY',
      holidayDates: new Set(['2026-11-23']),
    });
    expect(res.totalDays).toBe(2); // Jumat 20 & Selasa 24
    expect(res.byYear).toEqual({ 2026: 2 });
  });

  it('pola 6_day tetap menghitung Sabtu sebagai hari kerja', () => {
    // 2026-11-20 (Jumat) s.d. 2026-11-23 (Senin)
    const res = calculateLeaveDays({
      startDate: '2026-11-20',
      endDate: '2026-11-23',
      isHalfDay: false,
      countsWorkingDaysOnly: true,
      workPattern: 'SIX_DAY',
      holidayDates: new Set(),
    });
    expect(res.totalDays).toBe(3); // Jum, Sab, Sen
  });

  it('cuti lintas tahun memecah hari per tahun dengan benar', () => {
    // 2026-12-30 (Rab) s.d. 2027-01-04 (Sen), libur 2027-01-01
    const res = calculateLeaveDays({
      startDate: '2026-12-30',
      endDate: '2027-01-04',
      isHalfDay: false,
      countsWorkingDaysOnly: true,
      workPattern: 'FIVE_DAY',
      holidayDates: new Set(['2027-01-01']),
    });
    expect(res.totalDays).toBe(3); // 30 Des, 31 Des (2026) + 4 Jan (2027)
    expect(res.byYear).toEqual({ 2026: 2, 2027: 1 });
  });

  it('cuti setengah hari mengembalikan 0.5', () => {
    const res = calculateLeaveDays({
      startDate: '2026-11-23',
      endDate: '2026-11-23',
      isHalfDay: true,
      countsWorkingDaysOnly: true,
      workPattern: 'FIVE_DAY',
      holidayDates: new Set(),
    });
    expect(res.totalDays).toBe(0.5);
  });

  it('serviceMonths dan isoWeekBounds akurat', () => {
    expect(serviceMonths(parseDateOnly('2025-11-24'), parseDateOnly('2026-11-23'))).toBe(11);
    expect(serviceMonths(parseDateOnly('2025-11-23'), parseDateOnly('2026-11-23'))).toBe(12);
    const week = isoWeekBounds('2026-11-25'); // Rabu
    expect(formatDateOnly(week.monday)).toBe('2026-11-23');
    expect(formatDateOnly(week.sunday)).toBe('2026-11-29');
  });
});
