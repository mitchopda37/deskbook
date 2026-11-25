import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DownloadSimple, Printer } from '@phosphor-icons/react'
import { useData, useSheet } from '../lib/store'
import { addMonths, lastMonths, monthEnd, monthKey, monthLabel, monthStart, today } from '../lib/dates'
import { deadlineIn, deadlineLabel, downloadCsv } from '../lib/assignments'
import { ASSIGNMENT_STATUSES, type AssignmentView } from '../lib/types'
import { Avatar, Empty, PageHead, RateNotice, Segmented } from '../ui/kit'

type Preset = 'month' | 'last' | 'quarter' | 'year' | 'all'
const range = (p: Preset): [string, string] => {
  const m = monthKey(today())
  if (p === 'month') return [monthStart(m), monthEnd(m)]
  if (p === 'last') return [monthStart(addMonths(m, -1)), monthEnd(addMonths(m, -1))]
  if (p === 'quarter') return [monthStart(addMonths(m, -2)), monthEnd(m)]
  if (p === 'year') return [`${m.slice(0, 4)}-01-01`, `${m.slice(0, 4)}-12-31`]
  return ['0000-01-01', '9999-12-31']
}
const sum = <T,>(list: T[], f: (x: T) => number) => Math.round(list.reduce((s, x) => s + f(x), 0) * 100) / 100
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
/** Local calendar day of a timestamp. */
const dayOf = (isoString: string) => {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AssignmentReport() {
  const { assignments, money, moneyIn, currency, missingRates, personName, workspaceName, currenciesInUse } = useData()
  const { open } = useSheet()
  const [preset, setPreset] = useState<Preset>('month')
  const [from, to] = range(preset)

  const r = useMemo(() => {
    const inRange = (d: string) => d >= from && d <= to
    const live = assignments.filter((a) => a.status !== 'cancelled')
    // Work is counted in the period its deadline falls in; money in the period it arrived.
    const booked = live.filter((a) => inRange(dayOf(a.deadline)))
    const cancelled = assignments.filter((a) => a.status === 'cancelled' && inRange(dayOf(a.deadline)))
    const payments = assignments.flatMap((a) => a.payments.map((p) => ({ ...p, a }))).filter((p) => inRange(p.paid_on))
    const delivered = booked.filter((a) => a.status === 'delivered')
    const onTime = delivered.filter((a) => a.onTime)

    const writers = [...new Set(booked.map((a) => a.assignee_id ?? ''))].map((id) => {
      const list = booked.filter((a) => (a.assignee_id ?? '') === id)
      const done = list.filter((a) => a.status === 'delivered')
      return {
        id, name: id ? personName(id) : 'No writer yet', count: list.length, delivered: done.length,
        onTime: pct(done.filter((a) => a.onTime).length, done.length), open: list.filter((a) => a.open).length,
        late: list.filter((a) => a.late).length, words: sum(list, (a) => a.word_count ?? 0), value: sum(list, (a) => a.base.amount),
      }
    }).sort((a, b) => b.count - a.count)

    // Balances are a "right now" view across every period: what students still owe today.
    const owing = new Map<string, { name: string; institution: string; count: number; value: number; paid: number; remaining: number }>()
    for (const a of live) {
      const key = a.student_name.trim().toLowerCase()
      const row = owing.get(key) ?? { name: a.student_name, institution: a.institution, count: 0, value: 0, paid: 0, remaining: 0 }
      row.count += 1; row.value += a.base.amount; row.paid += a.base.paid; row.remaining += a.base.remaining
      owing.set(key, row)
    }
    const students = [...owing.values()].map((s) => ({ ...s, value: Math.round(s.value * 100) / 100, paid: Math.round(s.paid * 100) / 100, remaining: Math.round(s.remaining * 100) / 100 }))
      .sort((a, b) => b.remaining - a.remaining || b.value - a.value)

    const subjects = [...new Set(booked.map((a) => a.subject || 'No subject'))].map((s) => {
      const list = booked.filter((a) => (a.subject || 'No subject') === s)
      return { name: s, count: list.length, value: sum(list, (a) => a.base.amount) }
    }).sort((a, b) => b.value - a.value).slice(0, 8)

    const months = lastMonths(6).map((m) => ({
      key: m,
      booked: sum(live.filter((a) => monthKey(dayOf(a.deadline)) === m), (a) => a.base.amount),
      received: sum(assignments.flatMap((a) => a.payments).filter((p) => monthKey(p.paid_on) === m), (p) => p.base_amount),
    }))

    return {
      booked, cancelled, payments, delivered, onTime, writers, students, subjects, months,
      value: sum(booked, (a) => a.base.amount),
      received: sum(payments, (p) => p.base_amount),
      advance: sum(payments.filter((p) => p.kind === 'advance'), (p) => p.base_amount),
      balance: sum(payments.filter((p) => p.kind === 'balance'), (p) => p.base_amount),
      outstanding: sum(live, (a) => a.base.remaining),
      collectNow: live.filter((a) => a.status === 'delivered' && a.native.remaining > 0).sort((a, b) => a.deadline.localeCompare(b.deadline)),
      advanceMissing: live.filter((a) => a.open && a.advanceShort).sort((a, b) => a.deadline.localeCompare(b.deadline)),
      lateNow: live.filter((a) => a.late).sort((a, b) => a.deadline.localeCompare(b.deadline)),
      upcoming: live.filter((a) => a.open && !a.late && a.hoursLeft <= 24 * 7).sort((a, b) => a.deadline.localeCompare(b.deadline)),
      words: sum(booked, (a) => a.word_count ?? 0),
    }
  }, [assignments, from, to, personName])

  const label = { month: 'This month', last: 'Last month', quarter: 'Last 3 months', year: 'This year', all: 'All time' }[preset]
  const topMonth = Math.max(1, ...r.months.flatMap((m) => [m.booked, m.received]))
  const fmtIn = (a: AssignmentView, n: number) => moneyIn(n, a.currency)

  const exportCsv = () => downloadCsv(`assignment-report-${preset}-${today()}.csv`, [
    ['Assignment', 'Student', 'University', 'Subject', 'Words', 'Writer', 'Status', 'Deadline', 'Delivered', 'On time', 'Currency', 'Price', 'Advance paid', 'Balance paid', 'Remaining', `Price (${currency})`, `Remaining (${currency})`],
    ...[...r.booked, ...r.cancelled].map((a) => [a.title, a.student_name, a.institution, a.subject, a.word_count, personName(a.assignee_id),
      ASSIGNMENT_STATUSES.find((s) => s.id === a.status)?.label ?? a.status, a.deadline, a.delivered_at ?? '',
      a.onTime === null ? '' : a.onTime ? 'Yes' : 'No', a.currency, a.native.amount, a.native.advancePaid, a.native.balancePaid, a.native.remaining, a.base.amount, a.base.remaining]),
    [],
    ['Payments received', '', '', '', '', '', '', 'Date', '', '', 'Currency', 'Amount', 'Type', 'Method', 'Note', `Amount (${currency})`],
    ...r.payments.map((p) => [p.a.title, p.a.student_name, '', '', '', '', '', p.paid_on, '', '', p.currency, p.amount, p.kind === 'advance' ? 'Advance' : 'Balance', p.method, p.note, p.base_amount]),
  ])

  return (
    <>
      <PageHead title="Assignment report" sub={`Deadlines, delivery, writers and money for student assignments.${currenciesInUse.length > 1 ? ` Totals are in ${currency}, converted at the rates in Settings.` : ''}`}>
        <button className="btn print:hidden" onClick={() => window.print()}><Printer size={16} />Print or save PDF</button>
        <button className="btn print:hidden" onClick={exportCsv} disabled={r.booked.length + r.payments.length === 0}><DownloadSimple size={16} />Export CSV</button>
      </PageHead>
      <RateNotice missing={missingRates} base={currency} canEdit />

      <div className="mb-5 print:hidden">
        <Segmented<Preset> label="Period" value={preset} onChange={setPreset} options={[
          { id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'quarter', label: 'Last 3 months' },
          { id: 'year', label: 'This year' }, { id: 'all', label: 'All time' },
        ]} />
      </div>
      <p className="mb-3 hidden text-mute print:block">{workspaceName}, assignment report, {label.toLowerCase()}</p>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Assignments due · ${label.toLowerCase()}`} value={String(r.booked.length)} sub={`${r.delivered.length} delivered${r.cancelled.length ? `, ${r.cancelled.length} cancelled` : ''}${r.words ? ` · ${r.words.toLocaleString()} words` : ''}`} />
        <Kpi label="Value of that work" value={money(r.value)} sub={r.booked.length ? `Average ${money(r.value / r.booked.length)}` : undefined} />
        <Kpi label={`Received · ${label.toLowerCase()}`} value={money(r.received)} tone="paid" sub={`Advance ${money(r.advance)} · balance ${money(r.balance)}`} />
        <Kpi label="Still owed, today" value={money(r.outstanding)} tone={r.outstanding > 0 ? 'due' : undefined} sub={r.collectNow.length ? `${r.collectNow.length} delivered and unpaid` : 'Nothing delivered is unpaid'} />
        <Kpi label="Delivered on time" value={r.delivered.length ? `${pct(r.onTime.length, r.delivered.length)}%` : '–'} sub={r.delivered.length ? `${r.onTime.length} of ${r.delivered.length}` : 'Nothing delivered yet'} tone={r.delivered.length && pct(r.onTime.length, r.delivered.length) < 90 ? 'late' : 'paid'} />
        <Kpi label="Past the deadline now" value={String(r.lateNow.length)} tone={r.lateNow.length ? 'late' : undefined} />
        <Kpi label="Due in the next 7 days" value={String(r.upcoming.length)} />
        <Kpi label="Advance not received" value={String(r.advanceMissing.length)} tone={r.advanceMissing.length ? 'due' : undefined} sub="Open work without its full advance" />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Last six months" note={`Work by deadline month, money by the day it arrived (${currency}).`}>
          <ul className="space-y-3">
            {r.months.map((m) => (
              <li key={m.key} className="grid grid-cols-[3rem_1fr] items-center gap-3">
                <span className="text-[0.87rem] font-semibold">{monthLabel(m.key)}</span>
                <div className="space-y-1">
                  <Bar value={m.booked} max={topMonth} className="bg-ink/25" label={`Work ${money(m.booked)}`} />
                  <Bar value={m.received} max={topMonth} className="bg-paid" label={`Received ${money(m.received)}`} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-4 text-[0.82rem] text-mute"><span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-ink/25" />Work due</span><span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-paid" />Received</span></p>
        </Card>

        <Card title="By status" note={label}>
          {r.booked.length + r.cancelled.length === 0 ? <p className="text-mute">No assignments due in this period.</p> : (
            <ul className="space-y-2.5">
              {ASSIGNMENT_STATUSES.map((s) => {
                const n = [...r.booked, ...r.cancelled].filter((a) => a.status === s.id).length
                return (
                  <li key={s.id} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-[0.92rem]">
                    <span>{s.label}</span>
                    <Bar value={n} max={Math.max(1, r.booked.length + r.cancelled.length)} className={s.id === 'delivered' ? 'bg-paid' : s.id === 'cancelled' ? 'bg-mute/40' : 'bg-gold'} />
                    <span className="text-right font-semibold">{n}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Writers" note={label} className="mt-5">
        {r.writers.length === 0 ? <p className="text-mute">No assignments in this period.</p> : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-[0.92rem]">
              <thead><tr className="border-b border-line text-left text-[0.85rem] text-mute"><th className="px-1 py-2 font-medium">Writer</th><th className="px-1 py-2 text-right font-medium">Assignments</th><th className="px-1 py-2 text-right font-medium">Delivered</th><th className="px-1 py-2 text-right font-medium">On time</th><th className="px-1 py-2 text-right font-medium">Open</th><th className="px-1 py-2 text-right font-medium">Late now</th><th className="px-1 py-2 text-right font-medium">Words</th><th className="px-1 py-2 text-right font-medium">Value</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.writers.map((w) => (
                  <tr key={w.id}>
                    <td className="px-1 py-2.5"><span className="flex items-center gap-2">{w.id ? <Avatar name={w.name} size={24} /> : null}<span className={w.id ? 'font-semibold' : 'text-due font-semibold'}>{w.name}</span></span></td>
                    <td className="px-1 text-right">{w.count}</td>
                    <td className="px-1 text-right">{w.delivered}</td>
                    <td className={`px-1 text-right font-semibold ${w.delivered && w.onTime < 90 ? 'text-late' : 'text-paid'}`}>{w.delivered ? `${w.onTime}%` : '–'}</td>
                    <td className="px-1 text-right">{w.open}</td>
                    <td className={`px-1 text-right ${w.late ? 'font-semibold text-late' : ''}`}>{w.late}</td>
                    <td className="px-1 text-right">{w.words ? w.words.toLocaleString() : '–'}</td>
                    <td className="px-1 text-right">{money(w.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Collect now" note="Delivered, but the balance is not paid.">
          <ActionList items={r.collectNow} empty="Every delivered assignment is paid in full." render={(a) => (
            <><span className="font-semibold text-late">{fmtIn(a, a.native.remaining)}</span><span className="text-mute"> of {fmtIn(a, a.native.amount)}</span></>
          )} onOpen={(a) => open({ kind: 'assignmentPayment', assignmentId: a.id })} action="Record payment" />
        </Card>
        <Card title="Advance not received" note="Open work that started without its full advance.">
          <ActionList items={r.advanceMissing} empty="Every open assignment has its advance." render={(a) => (
            <><span className="font-semibold text-due">{fmtIn(a, a.native.advanceDue - a.native.advancePaid)}</span><span className="text-mute"> advance due · {deadlineIn(a.hoursLeft)}</span></>
          )} onOpen={(a) => open({ kind: 'assignmentPayment', assignmentId: a.id })} action="Record payment" />
        </Card>
        <Card title="Past the deadline" note="Not delivered yet.">
          <ActionList items={r.lateNow} empty="Nothing is late." render={(a) => (
            <><span className="font-semibold text-late">{deadlineIn(a.hoursLeft)}</span><span className="text-mute"> · {personName(a.assignee_id)}</span></>
          )} onOpen={(a) => open({ kind: 'assignment', id: a.id })} action="Open" />
        </Card>
        <Card title="Due in the next 7 days">
          <ActionList items={r.upcoming} empty="No deadlines this week." render={(a) => (
            <><span className="font-semibold">{deadlineLabel(a.deadline)}</span><span className="text-mute"> · {deadlineIn(a.hoursLeft)} · {personName(a.assignee_id)}</span></>
          )} onOpen={(a) => open({ kind: 'assignment', id: a.id })} action="Open" />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Students" note="Everything they have ordered, and what they owe today.">
          {r.students.length === 0 ? <p className="text-mute">No students yet.</p> : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-[0.92rem]">
                <thead><tr className="border-b border-line text-left text-[0.85rem] text-mute"><th className="px-1 py-2 font-medium">Student</th><th className="px-1 py-2 text-right font-medium">Orders</th><th className="px-1 py-2 text-right font-medium">Value</th><th className="px-1 py-2 text-right font-medium">Paid</th><th className="px-1 py-2 text-right font-medium">Owes</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {r.students.slice(0, 15).map((s) => (
                    <tr key={s.name}>
                      <td className="px-1 py-2.5"><p className="font-semibold">{s.name}</p>{s.institution && <p className="text-[0.82rem] text-mute">{s.institution}</p>}</td>
                      <td className="px-1 text-right">{s.count}</td>
                      <td className="px-1 text-right">{money(s.value)}</td>
                      <td className="px-1 text-right text-paid">{money(s.paid)}</td>
                      <td className={`px-1 text-right font-semibold ${s.remaining > 0 ? 'text-due' : 'text-mute'}`}>{s.remaining > 0 ? money(s.remaining) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Top subjects" note={label}>
          {r.subjects.length === 0 ? <p className="text-mute">No assignments in this period.</p> : (
            <ul className="space-y-2.5">
              {r.subjects.map((s) => (
                <li key={s.name} className="text-[0.92rem]">
                  <div className="mb-1 flex justify-between gap-2"><span className="truncate">{s.name} <span className="text-mute">· {s.count}</span></span><span className="font-semibold">{money(s.value)}</span></div>
                  <Bar value={s.value} max={Math.max(1, r.subjects[0].value)} className="bg-ink/30" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {r.payments.length > 0 && (
        <Card title="Payments received" note={label} className="mt-5">
          <ul className="divide-y divide-line">
            {[...r.payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on)).map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-2.5 text-[0.92rem] sm:grid-cols-[6.5rem_1fr_auto_auto]">
                <span className="text-mute">{p.paid_on}</span>
                <span className="min-w-0 truncate"><span className="font-semibold">{p.a.student_name}</span> <span className="text-mute">· {p.a.title}</span></span>
                <span className={`tag ${p.kind === 'advance' ? 'tag-paid' : ''} justify-self-start sm:justify-self-end`}>{p.kind === 'advance' ? 'Advance' : 'Balance'}</span>
                <span className="text-right font-semibold">{moneyIn(p.amount, p.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {assignments.length === 0 && <div className="mt-6"><Empty title="No assignments yet">Add assignments from the Assignments page and this report fills in by itself.</Empty></div>}
    </>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'paid' | 'due' | 'late' }) {
  return (
    <div className="panel p-4">
      <p className="text-[0.85rem] text-mute">{label}</p>
      <p className={`mt-1 font-display text-[1.5rem] leading-tight font-semibold ${tone === 'paid' ? 'text-paid' : tone === 'due' ? 'text-due' : tone === 'late' ? 'text-late' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.8rem] text-mute">{sub}</p>}
    </div>
  )
}

function Card({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel min-w-0 p-5 ${className}`}>
      <div className="mb-4"><h2 className="text-lg font-semibold">{title}</h2>{note && <p className="text-[0.85rem] text-mute">{note}</p>}</div>
      {children}
    </section>
  )
}

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-[3px] bg-sunk" aria-hidden="true">
        {value > 0 && <motion.div className={`h-full rounded-[3px] ${className}`} initial={{ width: 0 }} animate={{ width: `${Math.max(2, (value / max) * 100)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />}
      </div>
      {label && <span className="w-36 shrink-0 text-right text-[0.76rem] whitespace-nowrap text-mute sm:w-40 sm:text-[0.8rem]">{label}</span>}
    </div>
  )
}

function ActionList({ items, empty, render, onOpen, action }: {
  items: AssignmentView[]; empty: string; render(a: AssignmentView): ReactNode; onOpen(a: AssignmentView): void; action: string
}) {
  if (items.length === 0) return <p className="text-mute">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, 8).map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{a.student_name} <span className="font-normal text-mute">· {a.title}</span></p>
            <p className="truncate text-[0.87rem]">{render(a)}</p>
          </div>
          <button className="btn btn-sm shrink-0 print:hidden" onClick={() => onOpen(a)}>{action}</button>
        </li>
      ))}
      {items.length > 8 && <li className="pt-2.5 text-[0.87rem] text-mute">and {items.length - 8} more</li>}
    </ul>
  )
}
