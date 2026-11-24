import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { EncryptionKey } from '../../config/app-config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Enkripsi kolom AES-256-GCM.
 *
 * Format ciphertext: `<versi-kunci>:<iv b64>:<auth-tag b64>:<data b64>`.
 * `context` (misal "employees.base_salary") dipakai sebagai AAD, sehingga ciphertext
 * dari satu kolom tidak bisa dipindahkan ke kolom lain tanpa gagal didekripsi.
 *
 * Kelas ini murni (tanpa Nest) supaya bisa dipakai juga oleh seed & script.
 */
export class FieldCrypto {
  private readonly current: EncryptionKey;
  private readonly byVersion: Map<string, Buffer>;

  constructor(keys: EncryptionKey[], private readonly hmacKey: Buffer) {
    if (keys.length === 0) throw new Error('Minimal satu kunci enkripsi diperlukan');
    this.current = keys[0];
    this.byVersion = new Map(keys.map((k) => [k.version, k.key]));
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.current.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [this.current.version, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
  }

  decrypt(payload: string, context: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4) throw new Error('Format ciphertext tidak valid');
    const [version, ivB64, tagB64, dataB64] = parts;
    const key = this.byVersion.get(version);
    if (!key) throw new Error(`Kunci enkripsi versi "${version}" tidak tersedia`);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  }

  encryptNullable(plaintext: string | null | undefined, context: string): string | null {
    return plaintext === null || plaintext === undefined ? null : this.encrypt(plaintext, context);
  }

  decryptNullable(payload: string | null | undefined, context: string): string | null {
    return payload === null || payload === undefined ? null : this.decrypt(payload, context);
  }

  /** Nominal rupiah (integer) disimpan sebagai string terenkripsi. */
  encryptAmount(amount: number, context: string): string {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error('Nominal harus integer rupiah >= 0');
    }
    return this.encrypt(String(amount), context);
  }

  decryptAmount(payload: string, context: string): number {
    const value = Number(this.decrypt(payload, context));
    if (!Number.isSafeInteger(value)) throw new Error('Nominal terdekripsi tidak valid');
    return value;
  }

  /** True jika ciphertext dibuat dengan kunci lama dan perlu dienkripsi ulang. */
  needsReencryption(payload: string): boolean {
    return !payload.startsWith(`${this.current.version}:`);
  }

  /** HMAC-SHA256 deterministik untuk pencarian/keunikan kolom terenkripsi (misal NIK). */
  blindIndex(value: string, context: string): string {
    return createHmac('sha256', this.hmacKey).update(`${context}\u0000${value}`, 'utf8').digest('hex');
  }
}

/** Konteks AAD per kolom — satu tempat supaya tidak ada typo. */
export const CryptoContext = {
  nik: 'employees.nik',
  baseSalary: 'employees.base_salary',
  bankAccount: 'employees.bank_account',
  npwp: 'employees.npwp',
  componentAmount: 'employee_salary_components.amount',
  payrollAmount: 'payroll.amount',
  history: (field: string) => `employee_history.${field}`,
  mfaSecret: 'users.mfa_secret',
} as const;
