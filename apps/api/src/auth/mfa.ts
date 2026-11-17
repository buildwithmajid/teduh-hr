import { authenticator } from 'otplib';

// Toleransi ±1 langkah (30 detik) untuk selisih jam perangkat.
authenticator.options = { window: 1 };

export const MFA_ISSUER = 'HRIS';

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function mfaOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, MFA_ISSUER, secret);
}

export function verifyMfaCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}
