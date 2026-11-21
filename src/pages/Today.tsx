import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { CheckCircle, Circle, Flag } from '@phosphor-icons/react'
import { thisMonth, useActions, useAuth, useData, useSheet } from '../lib/store'
import { lastMonths, longToday, monthKey, monthLabel, today } from '../lib/dates'
import type { Bill, Followup, Task } from '../lib/types'
import { Avatar, Due, Empty, PageHead, RateNotice } from '../ui/kit'

export default function Today() {
  const d = useData()
  const { userId } = useAuth()
  const t = today()

  const work = d.tasks
    .filter((x) => x.status !== 'done' && x.due_on && x.due_on <= t && (d.isOwner || x.assignee_id === userId))
    .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''))
  const follow = d.followups
    .filter((x) => !x.done && x.due_on <= t)
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
  const lateBills = d.bills.filter((b) => b.overdue)

  const parts = [
    `${work.length} ${work.length === 1 ? 'piece' : 'pieces'} of work due`,
    `${follow.length} ${follow.length === 1 ? 'follow-up' : 'follow-ups'}`,
    ...(d.isOwner ? [`${lateBills.length} overdue ${lateBills.length === 1 ? 'payment' : 'payments'}`] : []),
  ]
  const first = (d.me?.full_name || '').split(' ')[0]

  return (
    <>
      <PageHead title={longToday()} sub={`${first ? `${first}, you have ` : ''}${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`} />

      {d.isOwner && <MoneyBoard />}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <section className="min-w-0">
          <SectionHead title="Work due" to="/work" link="Open the board" />
          {work.length === 0
            ? <Empty title="Nothing due today">New work shows up here on the day it is due.</Empty>
            : <ul className="panel divide-y divide-line">{work.map((x) => <WorkRow key={x.id} task={x} />)}</ul>}
        </section>
        <section className="min-w-0">
          <SectionHead title="Follow-ups" to="/follow-ups" link="See all" />
          {follow.length === 0
            ? <Empty title="No one to chase today" />
            : <ul className="panel divide-y divide-line">{follow.map((x) => <FollowRow key={x.id} item={x} />)}</ul>}
        </section>
      </div>

      {d.isOwner && <OwesYou bills={d.bills} />}
    </>
  )
}

function SectionHead({ title, to, link }: { title: string; to: string; link: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Link to={to} className="text-[0.9rem] font-semibold text-mute underline-offset-2 hover:text-ink hover:underline">{link}</Link>
    </div>
  )
}

export function WorkRow({ task, showClient = true }: { task: Task; showClient?: boolean }) {
  const { clientName, personName } = useData()
  const { patch } = useActions()
  const { open } = useSheet()
  const done = task.status === 'done'
  return (
    <li className="row-link flex items-center gap-3 px-4 py-3 first:rounded-t-[0.9rem] last:rounded-b-[0.9rem]">
      <button aria-label={done ? 'Mark as not done' : 'Mark as done'}
        onClick={() => patch('tasks', task.id, { status: done ? 'todo' : 'done' }, done ? undefined : 'Marked done')}
        className={done ? 'text-paid' : 'text-mute hover:text-paid'}>
        {done ? <CheckCircle size={22} weight="fill" /> : <Circle size={22} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => open({ kind: 'task', id: task.id })}>
        <span className={`line-clamp-2 font-medium md:line-clamp-1 ${done ? 'text-mute line-through' : ''}`}>
          {task.priority === 'high' && !done && <Flag size={14} weight="fill" className="mr-1.5 inline -translate-y-px text-late" aria-label="High priority" />}
          {task.title}
        </span>
        {showClient && <span className="block truncate text-[0.87rem] text-mute">{clientName(task.client_id)}</span>}
      </button>
      <Due date={task.due_on} done={done} />
      {task.assignee_id && <Avatar name={personName(task.assignee_id)} />}
    </li>
  )
}

export function FollowRow({ item, showClient = true, extra }: { item: Followup; showClient?: boolean; extra?: ReactNode }) {
  const { clientName, personName } = useData()
  const { patch } = useActions()
  const { open } = useSheet()
  return (
    <li className="row-link px-4 py-3 first:rounded-t-[0.9rem] last:rounded-b-[0.9rem]">
      <div className="flex items-center gap-3">
        <button aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
          onClick={() => patch('followups', item.id, { done: !item.done }, item.done ? undefined : 'Follow-up done')}
          className={item.done ? 'text-paid' : 'text-mute hover:text-paid'}>
          {item.done ? <CheckCircle size={22} weight="fill" /> : <Circle size={22} />}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => open({ kind: 'followup', id: item.id })}>
          <span className={`block font-medium ${item.done ? 'text-mute line-through' : ''}`}>{item.about}</span>
          {showClient && <span className="block truncate text-[0.87rem] text-mute">{clientName(item.client_id)}</span>}
        </button>
        <Due date={item.due_on} done={item.done} />
        {item.owner_id && <Avatar name={personName(item.owner_id)} />}
      </div>
      {extra}
    </li>
  )
}

// ------------------------------------------------------------------ money (owner only)

function MoneyBoard() {
  const { bills, payments, retainers, clients, money, moneyIn, clientName, retainerBase, missingRates, currency } = useData()
  const { open } = useSheet()
  const month = thisMonth()

  // The strip: everything billed this month, plus anything older that is still unpaid.
  const strip = bills
    .filter((b) => monthKey(b.issued_on) === month || b.remaining > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.remaining - a.remaining || b.amount - a.amount)
  const billed = strip.reduce((s, b) => s + b.amount, 0)
  const got = strip.reduce((s, b) => s + b.paid, 0)

  const received = payments.filter((p) => monthKey(p.paid_on) === month).reduce((s, p) => s + p.amount, 0)
  const toCome = bills.filter((b) => !b.overdue).reduce((s, b) => s + b.remaining, 0)
  const overdue = bills.filter((b) => b.overdue).reduce((s, b) => s + b.remaining, 0)
  const active = new Set(clients.filter((c) => c.status === 'active' && c.billing_type === 'retainer').map((c) => c.id))
  const retainerTotal = retainers.filter((r) => active.has(r.client_id)).reduce((s, r) => s + retainerBase(r), 0)

  const months = lastMonths(6)
  const perMonth = months.map((m) => payments.filter((p) => monthKey(p.paid_on) === m).reduce((s, p) => s + p.amount, 0))
  const peak = Math.max(1, ...perMonth)

  if (bills.length === 0)
    return (
      <Empty title="No invoices yet">
        Add an invoice from Invoices, or add a retainer client and bill the month in one click. Payments show up here as a strip.
      </Empty>
    )

  return (
    <>
    <RateNotice missing={missingRates} base={currency} canEdit />
    <section className="panel overflow-hidden">
      <div className="px-5 pt-5 md:px-7 md:pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-display text-[1.6rem] leading-tight font-semibold md:text-[2rem]">
            <span className="text-paid">{money(got)}</span> in, {money(billed - got)} still out
          </p>
          <Legend />
        </div>
        <p className="mt-1 text-mute">Every invoice from {monthLabel(month, true)}, plus older ones that are not fully paid. Each block is one invoice, sized by amount.</p>

        <div className="mt-5 flex gap-1 overflow-x-auto pb-1">
          {strip.map((b) => <StripBlock key={b.id} bill={b} label={clientName(b.client_id)} onOpen={() => open({ kind: 'invoice', id: b.id })} fmt={(n) => moneyIn(n, b.currency)} />)}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-[repeat(4,auto)_1fr]">
        <Figure label={`Received in ${monthLabel(month, true)}`} value={money(received)} tone="text-paid" />
        <Figure label="Still to come" value={money(toCome)} />
        <Figure label="Overdue" value={money(overdue)} tone={overdue > 0 ? 'text-late' : ''} />
        <Figure label="Retainers each month" value={money(retainerTotal)} />
        <div className="col-span-2 bg-surface px-5 py-4 md:px-7 lg:col-span-1">
          <p className="text-[0.87rem] text-mute">Received, last six months</p>
          <div className="mt-2 flex h-16 items-end gap-2">
            {months.map((m, i) => (
              <div key={m} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(m, true)}: ${money(perMonth[i])}`}>
                <motion.div initial={{ height: 3 }} animate={{ height: Math.max(3, (perMonth[i] / peak) * 44) }} transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} className={`w-full rounded-t-[3px] ${m === month ? 'bg-paid' : 'bg-ink/25'}`} />
                <span className={`text-[0.75rem] ${m === month ? 'font-semibold' : 'text-mute'}`}>{monthLabel(m)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
    </>
  )
}

// Blocks are sized by the converted amount so different currencies compare fairly; labels use the invoice currency.
function StripBlock({ bill, label, onOpen, fmt }: { bill: Bill; label: string; onOpen(): void; fmt(n: number): string }) {
  const pct = bill.amount > 0 ? (bill.paid / bill.amount) * 100 : 0
  const status = bill.remaining === 0 ? 'paid in full' : `${fmt(bill.native.paid)} received, ${fmt(bill.native.remaining)} remaining${bill.overdue ? `, ${bill.daysLate} days late` : ''}`
  return (
    <button onClick={onOpen} style={{ flex: `${bill.amount} 0 0` }} title={`${label}: ${bill.title}. ${status}`}
      className="group min-w-24 text-left">
      <span className="flex h-14 gap-px overflow-hidden rounded-[6px] transition-transform group-hover:-translate-y-0.5">
        {bill.paid > 0 && <span className="bg-paid" style={{ width: `${pct}%` }} />}
        {bill.remaining > 0 && <span className={`flex-1 ${bill.overdue ? 'hatch-late' : 'hatch-due'}`} />}
      </span>
      <span className="mt-1.5 block truncate text-[0.87rem] font-semibold">{label}</span>
      <span className={`block truncate text-[0.82rem] ${bill.overdue ? 'font-semibold text-late' : 'text-mute'}`}>
        {bill.remaining === 0 ? 'Paid' : `${fmt(bill.native.remaining)} ${bill.overdue ? 'late' : 'left'}`}
      </span>
    </button>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.85rem] text-mute">
      <span className="flex items-center gap-1.5"><i className="size-3 rounded-[2px] bg-paid" />Received</span>
      <span className="flex items-center gap-1.5"><i className="hatch-due size-3 rounded-[2px]" />Not due yet</span>
      <span className="flex items-center gap-1.5"><i className="hatch-late size-3 rounded-[2px]" />Overdue</span>
    </div>
  )
}

function Figure({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface px-5 py-4 md:px-7">
      <p className="text-[0.87rem] text-mute">{label}</p>
      <p className={`font-display text-[1.45rem] font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function OwesYou({ bills }: { bills: Bill[] }) {
  const { clientName, money, moneyIn } = useData()
  const { open } = useSheet()
  const byClient = new Map<string, { remaining: number; late: number; worst: Bill }>()
  for (const b of bills.filter((x) => x.remaining > 0)) {
    const cur = byClient.get(b.client_id)
    byClient.set(b.client_id, {
      remaining: (cur?.remaining ?? 0) + b.remaining,
      late: (cur?.late ?? 0) + (b.overdue ? b.remaining : 0),
      worst: !cur || b.due_on < cur.worst.due_on ? b : cur.worst,
    })
  }
  const rows = [...byClient.entries()].sort((a, b) => b[1].late - a[1].late || b[1].remaining - a[1].remaining)
  if (rows.length === 0) return null
  const top = Math.max(...rows.map(([, r]) => r.remaining))

  return (
    <section className="mt-8">
      <SectionHead title="Who owes you" to="/money" link="Open invoices" />
      <ul className="panel divide-y divide-line">
        {rows.map(([clientId, r]) => (
          <li key={clientId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,14rem)_1fr_7rem_auto]">
            <Link to={`/clients/${clientId}`} className="min-w-0 truncate font-semibold underline-offset-2 hover:underline">{clientName(clientId)}</Link>
            <div className="order-3 col-span-2 flex h-2.5 md:order-none md:col-span-1" aria-hidden="true">
              <div className={`rounded-[3px] ${r.late > 0 ? 'hatch-late' : 'hatch-due'}`} style={{ width: `${(r.remaining / top) * 100}%` }} />
            </div>
            <div className="text-right">
              <span className="font-semibold">{money(r.remaining)}</span>
              {r.late > 0 && <span className="block text-[0.82rem] font-semibold text-late">{r.worst.daysLate} days late</span>}
            </div>
            <div className="order-4 col-span-2 flex gap-2 md:order-none md:col-span-1">
              <button className="btn btn-quiet btn-sm" onClick={() => open({ kind: 'followup', clientId, invoiceId: r.worst.id, about: `Ask about payment for "${r.worst.title}" (${moneyIn(r.worst.native.remaining, r.worst.currency)} remaining)` })}>
                Add follow-up
              </button>
              <button className="btn btn-sm" onClick={() => open({ kind: 'payment', invoiceId: r.worst.id })}>Record payment</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
