'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Alert, Button, Field, Input, Select, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

type Step =
  | { kind: 'credentials' }
  | { kind: 'company'; companies: { id: string; name: string }[] }
  | { kind: 'mfa_verify'; mfaToken: string }
  | { kind: 'mfa_setup'; mfaToken: string; otpauthUrl?: string; secret?: string };

function LoginForm() {
  const { status, startSession } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  async function handleLoginResult(res: LoginResponse) {
    switch (res.status) {
      case 'ok':
        await startSession(res.accessToken);
        router.replace('/');
        return;
      case 'company_selection_required':
        setStep({ kind: 'company', companies: res.companies });
        return;
      case 'mfa_required':
        setStep({ kind: 'mfa_verify', mfaToken: res.mfaToken });
        return;
      case 'mfa_setup_required': {
        setStep({ kind: 'mfa_setup', mfaToken: res.mfaToken });
        const setup = await api.post<{ otpauthUrl: string; secret: string }>('/auth/mfa/setup', { mfaToken: res.mfaToken });
        setStep({ kind: 'mfa_setup', mfaToken: res.mfaToken, ...setup });
        return;
      }
    }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const submitCredentials = (e: FormEvent, companyId?: string) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.post<LoginResponse>('/auth/login', { email, password, ...(companyId ? { companyId } : {}) });
      await handleLoginResult(res);
    });
  };

  const submitCode = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step.kind !== 'mfa_verify' && step.kind !== 'mfa_setup') return;
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s/g, '');
    const path = step.kind === 'mfa_setup' ? '/auth/mfa/enable' : '/auth/mfa/verify';
    void run(async () => {
      const res = await api.post<{ accessToken: string }>(path, { mfaToken: step.mfaToken, code });
      await startSession(res.accessToken);
      router.replace('/');
    });
  };

  const backToStart = () => {
    setStep({ kind: 'credentials' });
    setError(null);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white">
          <KeyRound className="size-5" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Masuk ke HRIS</h1>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {params.get('expired') && step.kind === 'credentials' && (
          <div className="mb-4">
            <Alert tone="amber">Sesi Anda berakhir. Silakan masuk kembali.</Alert>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {step.kind === 'credentials' && (
          <form onSubmit={(e) => submitCredentials(e)} className="space-y-4">
            <Field label="Email">
              {(id) => (
                <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Password">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Masuk
            </Button>
          </form>
        )}

        {step.kind === 'company' && (
          <form
            onSubmit={(e) => submitCredentials(e, String(new FormData(e.currentTarget).get('companyId')))}
            className="space-y-4"
          >
            <p className="text-sm text-slate-600">Akun Anda terdaftar di beberapa perusahaan. Pilih perusahaan yang ingin dibuka.</p>
            <Field label="Perusahaan">
              {(id) => (
                <Select id={id} name="companyId" required>
                  {step.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Lanjut
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Kembali
            </Button>
          </form>
        )}

        {step.kind === 'mfa_setup' && (
          <form onSubmit={submitCode} className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <p>
                Peran Anda wajib memakai verifikasi dua langkah. Pindai kode QR ini dengan aplikasi authenticator (Google Authenticator,
                Microsoft Authenticator, 1Password, dll), lalu masukkan kode 6 digit.
              </p>
            </div>
            {step.otpauthUrl ? (
              <>
                <div className="flex justify-center rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <QRCode value={step.otpauthUrl} size={176} />
                </div>
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer">Tidak bisa memindai? Masukkan kode manual</summary>
                  <code className="mt-2 block break-all rounded bg-slate-100 p-2 font-mono text-slate-800">{step.secret}</code>
                </details>
              </>
            ) : (
              <Spinner label="Menyiapkan kode QR…" />
            )}
            <CodeField />
            <Button type="submit" loading={busy} disabled={!step.otpauthUrl} className="w-full">
              Aktifkan & masuk
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Batal
            </Button>
          </form>
        )}

        {step.kind === 'mfa_verify' && (
          <form onSubmit={submitCode} className="space-y-4">
            <p className="text-sm text-slate-600">Masukkan kode 6 digit dari aplikasi authenticator Anda.</p>
            <CodeField />
            <Button type="submit" loading={busy} className="w-full">
              Verifikasi
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Batal
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function CodeField() {
  return (
    <Field label="Kode verifikasi">
      {(id) => (
        <Input
          id={id}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      )}
    </Field>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
