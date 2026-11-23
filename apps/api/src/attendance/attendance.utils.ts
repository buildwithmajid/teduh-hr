import { addDays, formatDateOnly, parseDateOnly, todayIn } from '../common/dates';

const EARTH_RADIUS_M = 6_371_000;

/** Jarak great-circle (meter, dibulatkan ke integer) memakai rumus Haversine. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Ubah "HH:MM" menjadi menit sejak 00:00 (0..1439). */
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Menit lokal (0..1439) dari timestamp UTC di zona waktu IANA tertentu. */
export function localMinutesOf(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/**
 * Menentukan tanggal kerja ("YYYY-MM-DD") di zona waktu lokasi kerja.
 * Untuk shift malam (misal 22:00–06:00), kejadian dini hari sebelum (endTime + 2 jam)
 * masih dihitung sebagai tanggal mulai shift kemarin.
 */
export function resolveWorkDateStr(
  now: Date,
  timeZone: string,
  isOvernight = false,
  shiftEndHHMM?: string,
): string {
  const localDate = todayIn(timeZone, now);
  if (isOvernight && shiftEndHHMM) {
    const nowMin = localMinutesOf(now, timeZone);
    const endMin = parseHHMM(shiftEndHHMM);
    if (nowMin <= endMin + 120) {
      return formatDateOnly(addDays(parseDateOnly(localDate), -1));
    }
  }
  return localDate;
}

/** Hitung menit terlambat (> 0 hanya jika melewati start + tolerance). */
export function computeLateMinutes(
  clockIn: Date,
  shiftStartHHMM: string,
  toleranceMinutes: number,
  timeZone: string,
  isOvernight = false,
): number {
  let actual = localMinutesOf(clockIn, timeZone);
  const start = parseHHMM(shiftStartHHMM);
  // Untuk shift malam (misal mulai 22:00), clock-in jam 00:15 berarti lewat tengah malam (+1440).
  if (isOvernight && actual < 720 && start >= 720) {
    actual += 1440;
  }
  const diff = actual - start;
  return diff > toleranceMinutes ? diff : 0;
}
