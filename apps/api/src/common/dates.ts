const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Ubah "YYYY-MM-DD" menjadi Date pada 00:00 UTC (dipakai untuk kolom @db.Date). */
export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new Error(`Tanggal "${value}" harus berformat YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new Error(`Tanggal "${value}" tidak valid`);
  }
  return d;
}

export function parseDateOnlyNullable(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseDateOnly(value);
}

export function formatDateOnly(date: Date): string;
export function formatDateOnly(date: Date | null): string | null;
export function formatDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu tertentu. */
export function todayIn(timeZone = 'Asia/Jakarta', now: Date = new Date()): string {
  // en-CA memformat sebagai YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
