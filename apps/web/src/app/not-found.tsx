'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="bg-architectural flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <BrandMark />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-700">404</p>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tautan yang Anda buka mungkin sudah dipindahkan atau tidak tersedia untuk akun Anda.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button>Kembali ke Beranda</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
