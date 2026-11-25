import type { AssignmentView } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Splits a price into the advance asked up front and what is left for delivery.
 * The advance never goes below zero or above the price.
 */
export function splitAdvance(price: number, by: { percent: number } | { amount: number }) {
  const total = Math.max(0, price)
  const raw = 'percent' in by ? (total * by.percent) / 100 : by.amount
  const advance = round2(Math.min(total, Math.max(0, raw)))
  return { advance, remaining: round2(total - advance), percent: total > 0 ? round2((advance / total) * 100) : 0 }
}

/** "in 3 h", "in 2 days", "5 h late", "2 days late". */
export function deadlineIn(hoursLeft: number) {
  const late = hoursLeft < 0
  const h = Math.abs(hoursLeft)
  const text = h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`
  return late ? `${text} late` : `in ${text}`
}

/** "Mon 25 Nov, 5:00 pm" in the viewer's time zone. */
export function deadlineLabel(isoString: string) {
  const d = new Date(isoString)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export type Urgency = 'late' | 'today' | 'soon' | 'later' | 'done'
/** late = past deadline; today = within 24 h; soon = within 3 days. */
export function urgency(a: Pick<AssignmentView, 'open' | 'hoursLeft'>): Urgency {
  if (!a.open) return 'done'
  if (a.hoursLeft < 0) return 'late'
  if (a.hoursLeft <= 24) return 'today'
  if (a.hoursLeft <= 72) return 'soon'
  return 'later'
}

export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
