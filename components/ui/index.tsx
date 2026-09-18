import * as React from 'react'
import { cn } from '@/lib/cn'

// -------------------------------------------------------------------- card

/** One soft, warm elevation, shared by every surface that sits on the ground.
 *  Two layered shadows — a tight contact shadow plus a wider, lifted one — read
 *  as considered depth rather than a flat outline. */
const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(32,27,22,0.04),0_6px_20px_-12px_rgba(32,27,22,0.14)]'

export function Card({ className, ...p }: React.ComponentProps<'div'>) {
  return (
    <div
      {...p}
      className={cn('rounded-[var(--radius-card)] border border-line bg-surface', CARD_SHADOW, className)}
    />
  )
}

export function CardHead({
  title,
  hint,
  action,
  className,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-faint">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

// ------------------------------------------------------------------ button

const BTN = {
  primary: 'bg-brand text-white hover:bg-brand-hover border-transparent',
  secondary: 'bg-surface text-ink hover:bg-raised border-line-strong',
  ghost: 'bg-transparent text-ink-soft hover:bg-raised hover:text-ink border-transparent',
  danger: 'bg-bad text-white hover:brightness-95 border-transparent',
} as const

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...p
}: React.ComponentProps<'button'> & { variant?: keyof typeof BTN; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BTN[variant],
        className,
      )}
    />
  )
}

// ------------------------------------------------------------------- badge

const TONE = {
  neutral: 'bg-raised text-ink-soft border-line',
  brand: 'bg-brand-soft text-brand border-brand-line',
  good: 'bg-good-soft text-good border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  info: 'bg-info-soft text-info border-transparent',
} as const

export type Tone = keyof typeof TONE

export function Badge({
  tone = 'neutral',
  className,
  ...p
}: React.ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      {...p}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    />
  )
}

// ------------------------------------------------------------------ inputs

export function Input({ className, ...p }: React.ComponentProps<'input'>) {
  return (
    <input
      {...p}
      className={cn(
        'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink',
        'placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft',
        className,
      )}
    />
  )
}

export function Textarea({ className, ...p }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...p}
      className={cn(
        'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft',
        className,
      )}
    />
  )
}

export function Select({ className, ...p }: React.ComponentProps<'select'>) {
  return (
    <select
      {...p}
      className={cn(
        'h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft',
        className,
      )}
    />
  )
}

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
        {required ? <span className="text-brand"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span> : null}
    </label>
  )
}

// ------------------------------------------------------------------ layout

/** A labelled number. `hint` is for the caveat that stops a wrong reading. */
export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface p-4', CARD_SHADOW, className)}>
      <div className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</div>
      <div
        className={cn(
          'tnum mt-1 font-display text-[22px] leading-tight font-semibold',
          tone === 'good' && 'text-good',
          tone === 'bad' && 'text-bad',
          tone === 'brand' && 'text-brand',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-ink-faint">{hint}</div> : null}
    </div>
  )
}

export function Progress({
  pct,
  className,
  tone = 'brand',
}: {
  pct: number
  className?: string
  tone?: 'brand' | 'good' | 'silver' | 'gold'
}) {
  const fill =
    tone === 'good' ? 'bg-good' : tone === 'silver' ? 'bg-silver' : tone === 'gold' ? 'bg-gold' : 'bg-brand'
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export function Empty({
  title,
  body,
  action,
  icon,
}: {
  title: string
  body?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-line bg-raised text-ink-faint">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * A failure the user needs to see. Used wherever a read could fail — an
 * unreachable catalogue or an errored query renders this, never an empty list.
 */
export function Problem({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-bad-soft bg-bad-soft px-4 py-3">
      <p className="text-sm font-semibold text-bad">{title}</p>
      {detail ? <p className="mt-1 text-xs leading-relaxed text-ink-soft">{detail}</p> : null}
    </div>
  )
}

export function Table({ className, ...p }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table {...p} className={cn('w-full min-w-[640px] border-collapse text-sm', className)} />
    </div>
  )
}

export function Th({ className, ...p }: React.ComponentProps<'th'>) {
  return (
    <th
      {...p}
      className={cn(
        // A tinted header rule, and first/last cells that line up with the card's
        // own px-4 padding, are what read as a considered data table rather than
        // a bare grid of borders.
        'border-b border-line bg-raised px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-ink-faint uppercase whitespace-nowrap first:pl-4 last:pr-4',
        className,
      )}
    />
  )
}

export function Td({ className, ...p }: React.ComponentProps<'td'>) {
  return (
    <td
      {...p}
      className={cn('border-b border-line px-3 py-2.5 align-middle text-ink first:pl-4 last:pr-4', className)}
    />
  )
}
