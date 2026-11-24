'use client';

import { CheckCircle2, ChevronDown, Loader2, X, XCircle } from 'lucide-react';
import {
  ButtonHTMLAttributes,
  createContext,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { twMerge } from 'tailwind-merge';

/** Gabungkan class; jika bentrok (misal w-full vs w-auto), class terakhir yang menang. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(' '));
}

// ───────────── Button ─────────────

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]',
  secondary:
    'bg-white text-ink border border-line-strong hover:bg-canvas hover:border-stone-400/80 active:bg-rail disabled:text-ink-subtle disabled:bg-canvas',
  danger:
    'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-red-700/45',
  ghost:
    'text-ink-muted hover:bg-rail/80 hover:text-ink active:bg-rail disabled:opacity-35 disabled:hover:bg-transparent',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }
>(function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ───────────── Form fields ─────────────

const inputBase =
  'block w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted';

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-brand-600">*</span>}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
});

/** Input nominal Rupiah dengan pemisah ribuan otomatis (2.500.000) sambil tetap menyimpan string angka polos. */
export function CurrencyInput({
  id,
  value,
  onChange,
  placeholder = '0',
  required,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (rawDigits: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const digits = value.replace(/\D/g, '');
  const formatted = digits ? Number(digits).toLocaleString('id-ID') : '';
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-subtle">
        Rp
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={formatted}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className={cn(inputBase, 'pl-9 font-mono tabular', className)}
      />
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className?.includes('w-auto') ? 'inline-block' : 'w-full')}>
      <select
        ref={ref}
        className={cn(inputBase, 'appearance-none pr-8', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-[84px] py-2', className)} rows={3} {...rest} />;
}

export function Checkbox({
  label,
  description,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded border-line-strong accent-brand-600"
        {...rest}
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}

// ───────────── Avatar ─────────────

const AVATAR_TONES = [
  'bg-brand-100 text-brand-800',
  'bg-amber-100 text-amber-900',
  'bg-emerald-100 text-emerald-900',
  'bg-stone-200 text-stone-800',
  'bg-sky-100 text-sky-900',
  'bg-rose-100 text-rose-900',
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % AVATAR_TONES.length;
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-7 text-[11px]',
    md: 'size-9 text-xs',
    lg: 'size-12 text-base',
  };
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight select-none',
        sizes[size],
        AVATAR_TONES[toneIndex(name)],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

// ───────────── Layout bits ─────────────

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  gray: 'bg-stone-100 text-stone-700 border-stone-200/80',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  red: 'bg-red-50 text-red-800 border-red-200/80',
  amber: 'bg-amber-50 text-amber-900 border-amber-200/90',
  blue: 'bg-sky-50 text-sky-800 border-sky-200/80',
  brand: 'bg-brand-50 text-brand-800 border-brand-200/80',
};

const dotTones = {
  gray: 'bg-stone-400',
  green: 'bg-emerald-600',
  red: 'bg-red-600',
  amber: 'bg-amber-600',
  blue: 'bg-sky-600',
  brand: 'bg-brand-600',
};

export function Badge({
  tone = 'gray',
  dot = false,
  children,
}: {
  tone?: keyof typeof badgeTones;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        badgeTones[tone],
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dotTones[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted" role="status">
      <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
      {label}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line px-5 py-2" role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className={cn(
                'h-3.5 animate-pulse rounded bg-rail',
                c === 0 ? 'w-40' : c === cols - 1 ? 'ml-auto w-16' : 'w-28',
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'blue' | 'green'; children: ReactNode }) {
  const tones = {
    red: 'bg-red-50/90 text-red-900 border-red-200',
    amber: 'bg-amber-50/90 text-amber-950 border-amber-200',
    blue: 'bg-sky-50/90 text-sky-950 border-sky-200',
    green: 'bg-emerald-50/90 text-emerald-950 border-emerald-200',
  };
  return (
    <div
      role={tone === 'red' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3.5 py-2.5 text-sm', tones[tone])}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DescriptionList({
  items,
  columns = 3,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3',
      )}
    >
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">{it.label}</dt>
          <dd className="mt-1 text-sm text-ink">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────── Segmented Control ─────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex rounded-md border border-line bg-canvas p-0.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-white text-ink shadow-[0_1px_2px_rgba(24,23,21,0.08)]'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────── Table ─────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-line text-sm tabular">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap bg-canvas/70 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle text-ink', className)}>{children}</td>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted tabular">
      <span>
        Menampilkan <strong className="font-medium text-ink">{total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</strong> dari{' '}
        <strong className="font-medium text-ink">{total}</strong>
      </span>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Sebelumnya
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

// ───────────── Tabs ─────────────

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
            value === t.value
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ───────────── Modal & ConfirmModal ─────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-surface p-0 shadow-2xl',
        size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md p-1 text-ink-subtle transition-colors hover:bg-rail hover:text-ink"
              aria-label="Tutup"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Lanjutkan',
  variant = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-ink-muted">{description}</p>
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button variant={variant} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ModalActions>
    </Modal>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">{children}</div>;
}

// ───────────── Slide-Over Drawer (Sheet) ─────────────

export function Drawer({
  open,
  onClose,
  title,
  description,
  headerActions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:static print:block">
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-[1px] print:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-drawer-in relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-2xl print:h-auto print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 print:hidden">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 truncate text-xs text-ink-muted">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-rail hover:text-ink"
              aria-label="Tutup panel"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 print:overflow-visible print:p-0">{children}</div>
      </aside>
    </div>
  );
}

// ───────────── Toast ─────────────

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg',
              t.tone === 'success'
                ? 'border-stone-800 bg-ink text-white'
                : 'border-red-800 bg-red-700 text-white',
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="size-4 shrink-0 text-red-200" aria-hidden />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
