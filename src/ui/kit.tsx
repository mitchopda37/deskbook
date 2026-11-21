import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { dayLabel, today } from '../lib/dates'
import type { Bill } from '../lib/types'

const TINTS = ['#2f5bd9', '#0e8a5e', '#b0481e', '#7a4bc4', '#0b7f96', '#a8317a']

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const clean = name.trim() || '?'
  const initials = clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const tint = TINTS[[...clean].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length]
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: tint }}
    >
      {initials}
    </span>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
        <h1 className="text-[1.9rem] leading-tight font-semibold md:text-[2.25rem]">{title}</h1>
        {sub && <p className="mt-1 max-w-[62ch] text-mute">{sub}</p>}
      </motion.div>
      {children && <motion.div initial={reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.06 }} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</motion.div>}
    </header>
  )
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange(v: T): void; options: { id: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[0.6rem] bg-sunk p-[3px]">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex h-8 items-center gap-1.5 rounded-[0.45rem] px-3 text-[0.9rem] font-semibold whitespace-nowrap ${
            value === o.id ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_27_59/0.12)]' : 'text-mute hover:text-ink'
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="font-medium opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Solid green = received. Hatched = still to come (gold) or overdue (red). */
export function PayBar({ bill, className = '' }: { bill: Pick<Bill, 'amount' | 'paid' | 'remaining' | 'overdue'>; className?: string }) {
  const pct = bill.amount > 0 ? (bill.paid / bill.amount) * 100 : 0
  return (
    <div className={`flex h-2.5 gap-px overflow-hidden rounded-[3px] bg-sunk ${className}`} role="img"
      aria-label={`${Math.round(pct)}% received`}>
      {bill.paid > 0 && <motion.div className="bg-paid" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />}
      {bill.remaining > 0 && <div className={`flex-1 ${bill.overdue ? 'hatch-late' : 'hatch-due'}`} />}
    </div>
  )
}

export function PayTag({ bill }: { bill: Bill }) {
  if (bill.state === 'paid') return <span className="tag tag-paid"><Check weight="bold" size={12} />Paid</span>
  if (bill.overdue) return <span className="tag tag-late">{bill.daysLate} {bill.daysLate === 1 ? 'day' : 'days'} late</span>
  return <span className="tag tag-due">{bill.state === 'partial' ? 'Part paid' : 'Not paid'}</span>
}

export function Due({ date, done = false }: { date: string | null; done?: boolean }) {
  const late = !done && !!date && date < today()
  const isToday = !done && date === today()
  return (
    <span className={`text-[0.87rem] whitespace-nowrap ${late ? 'font-semibold text-late' : isToday ? 'font-semibold text-ink' : 'text-mute'}`}>
      {dayLabel(date)}
    </span>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[0.9rem] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[46ch] text-mute">{children}</div>}
    </motion.div>
  )
}

export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) { setShown(value); return }
    const controls = animate(shown, value, { duration: 0.75, ease: [0.22, 1, 0.36, 1], onUpdate: setShown })
    return () => controls.stop()
    // Start each transition from the currently displayed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced])
  return <span className={className}>{format(shown)}</span>
}

export function Drawer({
  title, onClose, children, footer,
}: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="scrim absolute inset-0 bg-[rgb(8_13_30/0.45)]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title}
        className="sheet relative flex h-full w-full max-w-[460px] flex-col bg-surface shadow-[-12px_0_40px_rgb(8_13_30/0.18)]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </aside>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.85rem] text-mute">{hint}</span>}
    </label>
  )
}

/** Warns when invoices use a currency that has no exchange rate yet, because totals would be wrong. */
export function RateNotice({ missing, base, canEdit }: { missing: string[]; base: string; canEdit: boolean }) {
  if (missing.length === 0) return null
  return (
    <div role="status" className="mb-5 rounded-[0.9rem] border border-gold bg-[color-mix(in_srgb,var(--gold)_14%,var(--surface))] px-4 py-3 text-[0.93rem]">
      <span className="font-semibold">No exchange rate for {missing.join(', ')}.</span>{' '}
      <span className="text-mute">Totals count those amounts one-for-one in {base} until a rate is set{canEdit ? <> in <Link to="/settings" className="font-semibold text-ink underline underline-offset-2">Settings</Link></> : ''}.</span>
    </div>
  )
}
