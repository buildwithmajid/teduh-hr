/**
 * Klien API.
 *
 * - Access token hanya disimpan di memori (tidak di localStorage) untuk memperkecil dampak XSS.
 * - Refresh token ada di cookie httpOnly yang dikelola server; `refreshSession()` menukarnya
 *   dengan access token baru.
 * - Server mendeteksi pemakaian ulang refresh token dan mencabut seluruh sesi, jadi refresh
 *   tidak boleh berjalan paralel: dalam satu tab dipakai satu promise bersama, antar-tab
 *   diserialkan dengan Web Locks.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

async function doRefresh(): Promise<string | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/** Tukar cookie refresh dengan access token baru. Null jika sesi sudah tidak valid. */
export function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    const run = async () => {
      const token =
        typeof navigator !== 'undefined' && navigator.locks
          ? await navigator.locks.request('hris-refresh', doRefresh)
          : await doRefresh();
      accessToken = token;
      return token;
    };
    refreshInFlight = run().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Permintaan gagal (${res.status})`;
  let details: string[] = [];
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      details = body.message;
      message = body.message[0] ?? message;
    } else if (body.message) {
      message = body.message;
    }
  } catch {
    /* body bukan JSON */
  }
  if (res.status === 429) message = 'Terlalu banyak percobaan. Coba lagi sebentar lagi.';
  return new ApiError(res.status, message, details);
}

type Body = Record<string, unknown> | unknown[] | undefined;

async function request<T>(method: string, path: string, body?: Body, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });

  if (res.status === 401 && retry && !/^\/auth\/(login|refresh|logout|mfa)/.test(path)) {
    const token = await refreshSession();
    if (token) return request<T>(method, path, body, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: Body) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: Body) => request<T>('PUT', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

export async function downloadFile(path: string, fallbackFilename: string, retry = true): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api${path}`, { method: 'GET', headers, credentials: 'same-origin' });
  if (res.status === 401 && retry) {
    const token = await refreshSession();
    if (token) return downloadFile(path, fallbackFilename, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await parseError(res);

  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = disp.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function uploadAttachment(
  file: File,
  retry = true,
): Promise<{ key: string; originalName: string; mimeType: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers,
    body: form,
    credentials: 'same-origin',
  });
  if (res.status === 401 && retry) {
    const token = await refreshSession();
    if (token) return uploadAttachment(file, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { key: string; originalName: string; mimeType: string; size: number };
}

export async function fetchAttachmentBlob(
  key: string,
  retry = true,
): Promise<{ url: string; mimeType: string }> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api/uploads/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers,
    credentials: 'same-origin',
  });
  if (res.status === 401 && retry) {
    const token = await refreshSession();
    if (token) return fetchAttachmentBlob(key, false);
    onSessionExpired?.();
  }
  if (!res.ok) throw await parseError(res);
  const mimeType = res.headers.get('Content-Type') ?? 'application/octet-stream';
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mimeType };
}

/** Buang field bernilai "" / undefined supaya validasi API tidak menolak string kosong. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined)) as Partial<T>;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.details.length > 1 ? err.details.join('; ') : err.message;
  if (err instanceof Error) return err.message;
  return 'Terjadi kesalahan';
}
