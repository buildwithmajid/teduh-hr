'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  User,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { formatDateTime, LABELS } from '@/lib/format';
import { useActiveEmployees } from '@/lib/queries';
import type { AppNotification, PendingApproval } from '@/lib/types';
import { BrandMark } from './brand-mark';
import { Avatar, cn, Modal } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  anyOf?: string[];
  needsEmployee?: boolean;
}

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/', label: 'Beranda', icon: LayoutDashboard },
      { href: '/approvals', label: 'Persetujuan', icon: CheckSquare },
      { href: '/me', label: 'Profil saya', icon: User, needsEmployee: true },
      { href: '/team', label: 'Tim saya', icon: UsersRound, anyOf: ['employee.view_team'] },
    ],
  },
  {
    section: 'Kehadiran & Cuti',
    items: [
      { href: '/attendance', label: 'Absensi', icon: Clock },
      { href: '/leaves', label: 'Cuti & izin', icon: CalendarDays },
      { href: '/overtime', label: 'Lembur', icon: Timer },
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

const ROUTE_LABELS: Record<string, string> = {
  '': 'Beranda',
  approvals: 'Persetujuan',
  attendance: 'Absensi',
  leaves: 'Cuti & izin',
  overtime: 'Lembur',
  me: 'Profil saya',
  team: 'Tim saya',
  employees: 'Karyawan',
  new: 'Tambah karyawan',
  edit: 'Ubah data',
  organization: 'Organisasi',
  'salary-components': 'Komponen gaji',
  users: 'User & role',
  settings: 'Pengaturan',
  audit: 'Audit log',
};

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function buildBreadcrumbs(pathname: string) {
  if (pathname === '/') return [{ label: 'Beranda', href: '/' }];
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const isUuid = /^[0-9a-f-]{36}$/i.test(seg);
    crumbs.push({
      label: isUuid ? 'Detail karyawan' : (ROUTE_LABELS[seg] ?? seg),
      href: acc,
    });
  }
  return crumbs;
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { logout, can } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const pending = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<PendingApproval[]>('/approvals/pending'),
    staleTime: 30_000,
  });
  const pendingCount = pending.data?.length ?? 0;

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => (!item.anyOf || item.anyOf.some((p) => can(p))) && (!item.needsEmployee || me.employee),
        ),
      })).filter((g) => g.items.length > 0),
    [can, me.employee],
  );

  const flatNav = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const crumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const displayName = me.employee?.fullName ?? me.email;

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand + Company */}
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight tracking-tight text-ink">TeduhHR</p>
          <p className="truncate text-[11px] leading-tight text-ink-muted" title={me.company.name}>
            {me.company.name}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
        {visible.map((group, i) => (
          <div key={i}>
            {group.section && (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                {group.section}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(24,23,21,0.06)] ring-1 ring-line'
                          : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink',
                      )}
                    >
                      <item.icon
                        className={cn('size-4 shrink-0', active ? 'text-brand-600' : 'text-ink-subtle')}
                        aria-hidden
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.href === '/approvals' && pendingCount > 0 && (
                        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white tabular">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account footer */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <Avatar name={displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{displayName}</p>
            <p className="truncate text-[11px] text-ink-muted">
              {me.roles.map((r) => LABELS.role[r] ?? r).join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title="Keluar"
            aria-label="Keluar"
            className="cursor-pointer rounded-md p-1.5 text-ink-muted transition-colors hover:bg-black/[0.05] hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-architectural min-h-screen lg:pl-60">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-rail lg:block">
        {sidebar}
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-rail shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2.5 top-3.5 cursor-pointer rounded-md p-1 text-ink-muted hover:bg-black/[0.05] hover:text-ink"
              aria-label="Tutup menu"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button
          type="button"
          className="cursor-pointer rounded-md p-1.5 text-ink-muted hover:bg-rail hover:text-ink lg:hidden"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
        >
          <Menu className="size-5" />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, idx) => {
            const last = idx === crumbs.length - 1;
            return (
              <span key={c.href} className="flex min-w-0 items-center gap-1.5">
                {idx > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />}
                {last ? (
                  <span className="truncate font-medium text-ink">{c.label}</span>
                ) : (
                  <Link href={c.href} className="truncate text-ink-muted hover:text-ink">
                    {c.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        {/* Quick Search Trigger & Notifications */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-stone-400 hover:text-ink"
          >
            <Search className="size-3.5 text-ink-subtle" aria-hidden />
            <span className="hidden sm:inline">Cari halaman atau karyawan…</span>
            <span className="sm:hidden">Cari…</span>
            <kbd className="hidden rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle sm:inline">
              Ctrl K
            </kbd>
          </button>
          <NotificationsBell />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

      <QuickJumpModal open={cmdOpen} onClose={() => setCmdOpen(false)} navItems={flatNav} />
    </div>
  );
}

function QuickJumpModal({
  open,
  onClose,
  navItems,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
}) {
  const router = useRouter();
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const employees = useActiveEmployees(open && can('employee.view'));

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const matchedNav = navItems.filter((n) => !q || n.label.toLowerCase().includes(q));
  const matchedEmp = can('employee.view')
    ? (employees.data ?? [])
        .filter(
          (e) =>
            !q ||
            e.fullName.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q) ||
            e.department.name.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pencarian cepat" size="md">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama menu, karyawan, atau kode RTK…"
            className="block w-full rounded-md border border-line-strong bg-canvas py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
        </div>

        <div className="space-y-3">
          {matchedNav.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Halaman</p>
              <ul className="space-y-0.5">
                {matchedNav.map((item) => (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-canvas"
                    >
                      <item.icon className="size-4 text-ink-subtle" aria-hidden />
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matchedEmp.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Karyawan aktif</p>
              <ul className="space-y-0.5">
                {matchedEmp.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => go(`/employees/${e.id}`)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-canvas"
                    >
                      <Avatar name={e.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{e.fullName}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {e.position.title} · {e.department.name}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-ink-subtle">{e.employeeCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matchedNav.length === 0 && matchedEmp.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-muted">Tidak ditemukan hasil untuk “{query}”.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function NotificationsBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notif = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: AppNotification[]; unreadCount: number }>('/notifications'),
    staleTime: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unread = notif.data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifikasi"
        className="relative flex size-8 cursor-pointer items-center justify-center rounded-md border border-line-strong bg-surface text-ink-muted transition-colors hover:border-stone-400 hover:text-ink"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-600" />}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-xs font-semibold text-ink">Notifikasi {unread > 0 ? `(${unread})` : ''}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="cursor-pointer text-[11px] font-medium text-brand-700 hover:underline"
              >
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-80 divide-y divide-line overflow-y-auto">
            {!notif.data?.items.length ? (
              <p className="px-4 py-8 text-center text-xs text-ink-muted">Belum ada notifikasi.</p>
            ) : (
              notif.data.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.isRead) markRead.mutate(n.id);
                    setOpen(false);
                    if (n.linkUrl) router.push(n.linkUrl);
                  }}
                  className={cn(
                    'block w-full cursor-pointer px-3.5 py-3 text-left transition-colors hover:bg-canvas',
                    !n.isRead && 'bg-brand-50/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-ink">{n.title}</p>
                    {!n.isRead && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-600" />}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{n.message}</p>
                  <p className="mt-1 font-mono text-[10px] text-ink-subtle">{formatDateTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!anyOf.some((p) => can(p))) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-14 text-center">
        <p className="text-sm font-semibold text-ink">Anda tidak punya akses ke halaman ini</p>
        <p className="mt-1 text-xs text-ink-muted">Hubungi HR Admin atau Super Admin jika Anda membutuhkan akses.</p>
      </div>
    );
  }
  return <>{children}</>;
}
