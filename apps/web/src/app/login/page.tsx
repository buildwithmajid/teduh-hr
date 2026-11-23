'use client';

import { Lock, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { BrandMark } from '@/components/brand-mark';
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

  const headingByStep: Record<Step['kind'], { title: string; subtitle: string }> = {
    credentials: { title: 'Masuk ke TeduhHR', subtitle: 'Gunakan email perusahaan yang terdaftar.' },
    company: { title: 'Pilih perusahaan', subtitle: 'Akun Anda memiliki akses ke lebih dari satu entitas.' },
    mfa_setup: { title: 'Aktifkan verifikasi 2 langkah', subtitle: 'Wajib untuk peran dengan akses data sensitif.' },
    mfa_verify: { title: 'Verifikasi dua langkah', subtitle: 'Masukkan kode 6 digit dari aplikasi authenticator Anda.' },
  };

  const heading = headingByStep[step.kind];

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <BrandMark />
        <div>
          <p className="text-sm font-semibold leading-tight text-ink">TeduhHR</p>
          <p className="text-[11px] leading-tight text-ink-muted">PT Ruang Teduh Karya</p>
        </div>
      </div>

      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{heading.title}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{heading.subtitle}</p>
      </div>

      {params.get('expired') && step.kind === 'credentials' && (
        <div className="mb-5">
          <Alert tone="amber">Sesi Anda berakhir. Silakan masuk kembali.</Alert>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {step.kind === 'credentials' && (
        <form onSubmit={(e) => submitCredentials(e)} className="space-y-4">
          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                placeholder="hr@ruangteduh.test"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
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
          <div className="pt-1">
            <Button type="submit" loading={busy} className="h-10 w-full">
              Masuk
            </Button>
          </div>
          <p className="pt-2 text-xs leading-relaxed text-ink-muted">
            Akun HR Admin, Finance, dan Super Admin memerlukan kode verifikasi dua langkah (TOTP) setelah password.
          </p>
        </form>
      )}

      {step.kind === 'company' && (
        <form
          onSubmit={(e) => submitCredentials(e, String(new FormData(e.currentTarget).get('companyId')))}
          className="space-y-4"
        >
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
          <div className="space-y-2 pt-1">
            <Button type="submit" loading={busy} className="h-10 w-full">
              Lanjut
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Kembali
            </Button>
          </div>
        </form>
      )}

      {step.kind === 'mfa_setup' && (
        <form onSubmit={submitCode} className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface p-3.5 text-xs leading-relaxed text-ink-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <p>
              Pindai kode QR menggunakan Google Authenticator, Microsoft Authenticator, atau 1Password, lalu masukkan kode 6 digitnya.
            </p>
          </div>
          {step.otpauthUrl ? (
            <>
              <div className="flex justify-center rounded-lg border border-line bg-surface p-4">
                <QRCode value={step.otpauthUrl} size={172} />
              </div>
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer hover:text-ink">Tidak bisa memindai? Masukkan kode manual</summary>
                <code className="mt-2 block break-all rounded-md border border-line bg-surface p-2.5 font-mono text-ink">
                  {step.secret}
                </code>
              </details>
            </>
          ) : (
            <Spinner label="Menyiapkan kode QR…" />
          )}
          <CodeField />
          <div className="space-y-2 pt-1">
            <Button type="submit" loading={busy} disabled={!step.otpauthUrl} className="h-10 w-full">
              Aktifkan & masuk
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {step.kind === 'mfa_verify' && (
        <form onSubmit={submitCode} className="space-y-4">
          <CodeField />
          <div className="space-y-2 pt-1">
            <Button type="submit" loading={busy} className="h-10 w-full">
              Verifikasi
            </Button>
            <Button variant="ghost" className="w-full" onClick={backToStart}>
              Batal
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function CodeField() {
  return (
    <Field label="Kode verifikasi (6 digit)">
      {(id) => (
        <Input
          id={id}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
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
    <main className="grid min-h-screen lg:grid-cols-12">
      {/* Real full-bleed architectural studio photograph */}
      <section className="relative hidden overflow-hidden bg-[#1B1917] lg:col-span-5 lg:flex lg:flex-col lg:justify-between">
        <Image
          src="/images/studio-interior.png"
          alt="Interior studio PT Ruang Teduh Karya"
          fill
          priority
          sizes="(min-width: 1024px) 42vw, 0px"
          className="object-cover object-center"
        />
        {/* Gentle top & strong bottom warm scrim so photography breathes while text stays crisp */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-[#161412]/90"
        />

        <div className="relative z-10 flex items-center gap-2.5 p-10 xl:p-12">
          <BrandMark />
          <div>
            <p className="text-sm font-semibold leading-tight tracking-tight text-white">TeduhHR</p>
            <p className="text-[11px] leading-tight text-stone-200/90">PT Ruang Teduh Karya</p>
          </div>
        </div>

        <div className="relative z-10 space-y-6 p-10 xl:p-12">
          <div className="max-w-md space-y-3">
            <h2 className="text-2xl font-semibold leading-snug tracking-tight text-white xl:text-[28px]">
              Catatan kepegawaian dan kompensasi dalam satu sistem yang tertib.
            </h2>
            <p className="text-sm text-stone-200/85">
              Studio Arsitektur & Design-Build · Jakarta · Bandung · Bali
            </p>
          </div>

          <div className="grid gap-2 border-t border-white/15 pt-5 text-xs text-stone-200/85">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 shrink-0 text-brand-300" aria-hidden />
              <span>NIK, NPWP, rekening & gaji pokok dienkripsi per kolom (AES-256-GCM).</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 shrink-0 text-brand-300" aria-hidden />
              <span>Audit log append-only dengan verifikasi rantai hash SHA-256.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Clean right form surface */}
      <section className="bg-architectural flex items-center justify-center px-6 py-12 lg:col-span-7">
        <Suspense fallback={<Spinner />}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
