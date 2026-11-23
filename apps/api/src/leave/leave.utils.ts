import { WorkPattern } from '@prisma/client';
import { addDays, formatDateOnly, parseDateOnly } from '../common/dates';

export interface LeaveDaysInput {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  isHalfDay: boolean;
  countsWorkingDaysOnly: boolean;
  workPattern: WorkPattern;
  holidayDates: Set<string>;
}

/**
 * Hitung total hari cuti dan rinciannya per tahun (untuk cuti lintas tahun).
 * Melewati akhir pekan (Sabtu/Minggu untuk 5_day, Minggu saja untuk 6_day) & hari libur
 * jika `countsWorkingDaysOnly = true`.
 */
export function calculateLeaveDays(input: LeaveDaysInput): { totalDays: number; byYear: Record<number, number> } {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (end < start) return { totalDays: 0, byYear: {} };

  const byYear: Record<number, number> = {};
  let total = 0;

  for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
    const iso = formatDateOnly(cur);
    if (input.countsWorkingDaysOnly) {
      const dow = cur.getUTCDay(); // 0 = Minggu, 6 = Sabtu
      if (dow === 0) continue;
      if (input.workPattern === 'FIVE_DAY' && dow === 6) continue;
      if (input.holidayDates.has(iso)) continue;
    }
    const year = cur.getUTCFullYear();
    const inc = input.isHalfDay ? 0.5 : 1;
    byYear[year] = (byYear[year] ?? 0) + inc;
    total += inc;
  }

  return { totalDays: total, byYear };
}

/** Hitung masa kerja penuh dalam bulan antara joinDate dan targetDate. */
export function serviceMonths(joinDate: Date, targetDate: Date): number {
  let months =
    (targetDate.getUTCFullYear() - joinDate.getUTCFullYear()) * 12 +
    (targetDate.getUTCMonth() - joinDate.getUTCMonth());
  if (targetDate.getUTCDate() < joinDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Rentang minggu ISO (Senin s.d. Minggu) untuk tanggal kerja tertentu. */
export function isoWeekBounds(dateStr: string): { monday: Date; sunday: Date } {
  const d = parseDateOnly(dateStr);
  const dow = d.getUTCDay(); // 0=Min, 1=Sen ... 6=Sab
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(d, diffToMon);
  const sunday = addDays(monday, 6);
  return { monday, sunday };
}
