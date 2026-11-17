export interface EncryptionKey {
  version: string;
  key: Buffer;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  corsOrigin: string[];
  jwtAccessSecret: string;
  jwtMfaSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  /** Kunci pertama dipakai untuk enkripsi baru; sisanya hanya untuk dekripsi data lama. */
  encryptionKeys: EncryptionKey[];
  hmacKey: Buffer;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  }
  return value.trim();
}

function secret(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (value.length < 32) {
    throw new Error(`${name} minimal 32 karakter`);
  }
  return value;
}

function key32(base64: string, name: string): Buffer {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length !== 32) {
    throw new Error(`${name} harus 32 byte (base64), didapat ${buf.length} byte`);
  }
  return buf;
}

export function parseEncryptionKeys(raw: string): EncryptionKey[] {
  const keys = raw.split(',').map((part) => {
    const idx = part.indexOf(':');
    if (idx <= 0) {
      throw new Error('ENCRYPTION_KEYS harus berformat "<versi>:<kunci-base64>,..."');
    }
    const version = part.slice(0, idx).trim();
    if (!/^[A-Za-z0-9]+$/.test(version)) {
      throw new Error(`Versi kunci "${version}" hanya boleh huruf/angka`);
    }
    return { version, key: key32(part.slice(idx + 1).trim(), `ENCRYPTION_KEYS[${version}]`) };
  });
  const versions = new Set(keys.map((k) => k.version));
  if (versions.size !== keys.length) {
    throw new Error('Versi di ENCRYPTION_KEYS tidak boleh duplikat');
  }
  return keys;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} harus bilangan bulat positif`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const config: AppConfig = {
    port: positiveInt(env, 'PORT', 3100),
    nodeEnv,
    isProduction: nodeEnv === 'production',
    corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:3001')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jwtAccessSecret: secret(env, 'JWT_ACCESS_SECRET'),
    jwtMfaSecret: secret(env, 'JWT_MFA_SECRET'),
    accessTokenTtlSeconds: positiveInt(env, 'ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtlDays: positiveInt(env, 'REFRESH_TOKEN_TTL_DAYS', 7),
    encryptionKeys: parseEncryptionKeys(required(env, 'ENCRYPTION_KEYS')),
    hmacKey: key32(required(env, 'HMAC_KEY'), 'HMAC_KEY'),
  };
  if (config.jwtAccessSecret === config.jwtMfaSecret) {
    throw new Error('JWT_ACCESS_SECRET dan JWT_MFA_SECRET harus berbeda');
  }
  if (config.isProduction && /dev-only/.test(config.jwtAccessSecret + config.jwtMfaSecret)) {
    throw new Error('Rahasia JWT development tidak boleh dipakai di production');
  }
  return config;
}
