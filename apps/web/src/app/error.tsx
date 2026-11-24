'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="bg-architectural flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <BrandMark />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-red-700">Gangguan sistem</p>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">Terjadi kesalahan saat memuat halaman</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {error.message || 'Coba muat ulang halaman atau kembali ke beranda.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden /> Coba lagi
          </Button>
          <Link href="/">
            <Button variant="secondary">Ke Beranda</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
