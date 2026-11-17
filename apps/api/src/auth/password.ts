import { hash, verify } from '@node-rs/argon2';

// Parameter Argon2id sesuai rekomendasi minimum OWASP (19 MiB, 2 iterasi).
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Kebijakan password: minimal 12 karakter, ada huruf dan angka, tidak sama dengan email. */
export function passwordPolicyViolation(password: string, email?: string): string | null {
  if (password.length < 12) return 'Password minimal 12 karakter';
  if (password.length > 128) return 'Password maksimal 128 karakter';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password harus mengandung huruf dan angka';
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
    return 'Password tidak boleh mengandung nama email';
  }
  return null;
}
