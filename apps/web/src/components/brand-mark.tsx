import { cn } from './ui';

/**
 * Mark geometris arsitektural untuk TeduhHR — PT Ruang Teduh Karya.
 * Bentuk bingkai atap/ruang terbuka dengan proporsi presisi.
 */
export function BrandMark({
  className,
  variant = 'terracotta',
}: {
  className?: string;
  variant?: 'terracotta' | 'light';
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md',
        variant === 'terracotta' ? 'bg-brand-600 text-white' : 'bg-white/15 text-white ring-1 ring-white/25',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11.5L12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M12 19v-5.5" />
        <path d="M9.5 13.5h5" />
      </svg>
    </span>
  );
}
