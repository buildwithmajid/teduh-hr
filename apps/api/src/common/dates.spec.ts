import { formatDateOnly, isValidTimeZone, parseDateOnly, todayIn } from './dates';

describe('dates', () => {
  it('parse & format tanggal tanpa pergeseran zona waktu', () => {
    expect(formatDateOnly(parseDateOnly('2026-02-28'))).toBe('2026-02-28');
  });

  it('menolak tanggal yang tidak ada atau format salah', () => {
    expect(() => parseDateOnly('2026-02-30')).toThrow();
    expect(() => parseDateOnly('28-02-2026')).toThrow();
  });

  it('todayIn memakai zona waktu yang diminta', () => {
    // 2026-11-17 18:30 UTC = 2026-11-18 01:30 WIB, 03:30 WIT
    const now = new Date('2026-11-17T18:30:00Z');
    expect(todayIn('Asia/Jakarta', now)).toBe('2026-11-18');
    expect(todayIn('UTC', now)).toBe('2026-11-17');
  });

  it('validasi nama zona waktu IANA', () => {
    expect(isValidTimeZone('Asia/Makassar')).toBe(true);
    expect(isValidTimeZone('WITA')).toBe(false);
  });
});
