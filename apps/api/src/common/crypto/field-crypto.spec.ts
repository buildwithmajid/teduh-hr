import { randomBytes } from 'crypto';
import { FieldCrypto } from './field-crypto';

const k = () => randomBytes(32);

describe('FieldCrypto', () => {
  const v1 = { version: 'v1', key: k() };
  const hmac = k();
  const crypto = new FieldCrypto([v1], hmac);

  it('mengenkripsi lalu mendekripsi kembali ke nilai asal', () => {
    const ct = crypto.encrypt('3171234567890001', 'employees.nik');
    expect(ct).not.toContain('3171234567890001');
    expect(ct.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(ct, 'employees.nik')).toBe('3171234567890001');
  });

  it('menghasilkan ciphertext berbeda untuk plaintext sama (IV acak)', () => {
    expect(crypto.encrypt('x', 'c')).not.toBe(crypto.encrypt('x', 'c'));
  });

  it('gagal jika ciphertext dipindah ke kolom lain (AAD berbeda)', () => {
    const ct = crypto.encrypt('8000000', 'employees.base_salary');
    expect(() => crypto.decrypt(ct, 'employee_salary_components.amount')).toThrow();
  });

  it('gagal jika ciphertext dimodifikasi', () => {
    const ct = crypto.encrypt('8000000', 'employees.base_salary');
    const parts = ct.split(':');
    const data = Buffer.from(parts[3], 'base64');
    data[0] ^= 0xff;
    parts[3] = data.toString('base64');
    expect(() => crypto.decrypt(parts.join(':'), 'employees.base_salary')).toThrow();
  });

  it('mendukung rotasi kunci: data lama tetap terbaca dan ditandai perlu enkripsi ulang', () => {
    const old = crypto.encrypt('rahasia', 'c');
    const rotated = new FieldCrypto([{ version: 'v2', key: k() }, v1], hmac);
    expect(rotated.decrypt(old, 'c')).toBe('rahasia');
    expect(rotated.needsReencryption(old)).toBe(true);
    expect(rotated.needsReencryption(rotated.encrypt('rahasia', 'c'))).toBe(false);
  });

  it('menolak versi kunci yang tidak dikenal', () => {
    const other = new FieldCrypto([{ version: 'v9', key: k() }], hmac);
    expect(() => crypto.decrypt(other.encrypt('a', 'c'), 'c')).toThrow(/v9/);
  });

  it('nominal: hanya integer rupiah >= 0', () => {
    const ct = crypto.encryptAmount(8_500_000, 'employees.base_salary');
    expect(crypto.decryptAmount(ct, 'employees.base_salary')).toBe(8_500_000);
    expect(() => crypto.encryptAmount(1.5, 'c')).toThrow();
    expect(() => crypto.encryptAmount(-1, 'c')).toThrow();
  });

  it('blind index deterministik dan bergantung pada konteks & kunci', () => {
    const a = crypto.blindIndex('3171234567890001', 'employees.nik');
    expect(a).toBe(crypto.blindIndex('3171234567890001', 'employees.nik'));
    expect(a).not.toBe(crypto.blindIndex('3171234567890001', 'other'));
    expect(a).not.toBe(new FieldCrypto([v1], k()).blindIndex('3171234567890001', 'employees.nik'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
