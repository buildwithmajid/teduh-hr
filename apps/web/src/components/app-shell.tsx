'use client';

import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  User,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth, useMe } from '@/lib/auth';
import { LABELS } from '@/lib/format';
import { cn } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Tampil jika user punya salah satu permission ini (kosong = semua user). */
  anyOf?: string[];
  needsEmployee?: boolean;
}

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/', label: 'Beranda', icon: LayoutDashboard },
      { href: '/me', label: 'Profil saya', icon: User, needsEmployee: true },
      { href: '/team', label: 'Tim saya', icon: UsersRound, anyOf: ['employee.view_team'] },
    ],
  },
  {
    section: 'Kepegawaian',
    items: [
      { href: '/employees', label: 'Karyawan', icon: Users, anyOf: ['employee.view'] },
      { href: '/organization', label: 'Organisasi', icon: Building2, anyOf: ['department.view'] },
      { href: '/salary-components', label: 'Komponen gaji', icon: Wallet, anyOf: ['salary.view'] },
    ],
  },
  {
    section: 'Administrasi',
    items: [
      { href: '/users', label: 'User & role', icon: ShieldCheck, anyOf: ['user.manage'] },
      { href: '/settings', label: 'Pengaturan', icon: Settings, anyOf: ['settings.manage', 'company.manage'] },
      { href: '/audit', label: 'Audit log', icon: ClipboardList, anyOf: ['audit.view'] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { logout, can } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const visible = NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => (!item.anyOf || item.anyOf.some((p) => can(p))) && (!item.needsEmployee || me.employee),
    ),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Navigasi utama">
      <div className="px-2">
        <p className="text-lg font-semibold tracking-tight text-white">HRIS</p>
        <p className="truncate text-xs text-brand-100/80" title={me.company.name}>
          {me.company.name}
        </p>
      </div>
      {visible.map((group, i) => (
        <div key={i}>
          {group.section && <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-brand-100/60">{group.section}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-brand-900 lg:block">{sidebar}</aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-brand-900">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-4 rounded p-1 text-brand-100 hover:bg-white/10"
              aria-label="Tutup menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
          <Menu className="size-5" />
        </button>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-slate-900">{me.employee?.fullName ?? me.email}</p>
            <p className="text-xs leading-tight text-slate-500">{me.roles.map((r) => LABELS.role[r] ?? r).join(', ')}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="size-4" aria-hidden />
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}

/** Tampilkan pesan jika user membuka halaman tanpa permission (link langsung). */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!anyOf.some((p) => can(p))) {
    return (
      <div className="rounded-xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
        <p className="text-sm font-medium text-slate-900">Anda tidak punya akses ke halaman ini</p>
        <p className="mt-1 text-sm text-slate-500">Hubungi HR Admin jika Anda membutuhkan akses.</p>
      </div>
    );
  }
  return <>{children}</>;
}
