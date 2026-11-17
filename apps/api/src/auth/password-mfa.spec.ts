import { authenticator } from 'otplib';
import { generateMfaSecret, mfaOtpAuthUrl, verifyMfaCode } from './mfa';
import { hashPassword, passwordPolicyViolation, verifyPassword } from './password';

describe('password', () => {
  it('hash argon2id dapat diverifikasi dan menolak password salah', async () => {
    const h = await hashPassword('Rahasia-Kuat-2026');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Rahasia-Kuat-2026')).toBe(true);
    expect(await verifyPassword(h, 'rahasia-kuat-2026')).toBe(false);
  });

  it('verifyPassword tidak melempar untuk hash rusak', async () => {
    expect(await verifyPassword('bukan-hash', 'x')).toBe(false);
  });

  it('kebijakan password', () => {
    expect(passwordPolicyViolation('pendek1')).toMatch(/12/);
    expect(passwordPolicyViolation('hanyahurufsaja')).toMatch(/huruf dan angka/);
    expect(passwordPolicyViolation('budi.santoso2026', 'budi.santoso@contoh.id')).toMatch(/email/);
    expect(passwordPolicyViolation('Kalimat-Panjang-77')).toBeNull();
  });
});

describe('mfa', () => {
  it('kode TOTP saat ini valid, kode acak tidak', () => {
    const secret = generateMfaSecret();
    expect(verifyMfaCode(secret, authenticator.generate(secret))).toBe(true);
    expect(verifyMfaCode(secret, '000000') && verifyMfaCode(secret, '999999')).toBe(false);
    expect(verifyMfaCode(secret, '12ab56')).toBe(false);
  });

  it('otpauth URL memuat issuer dan email', () => {
    const url = mfaOtpAuthUrl('hr@contoh.id', 'JBSWY3DPEHPK3PXP');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('issuer=HRIS');
    expect(decodeURIComponent(url)).toContain('hr@contoh.id');
  });
});
