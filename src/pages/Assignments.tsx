import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, ChartBar, DownloadSimple, MagnifyingGlass, Plus, Warning } from '@phosphor-icons/react'
import { useActions, useData, useSheet } from '../lib/store'
import { missingTables } from '../lib/backend'
import { monthKey, today } from '../lib/dates'
import { deadlineIn, deadlineLabel, downloadCsv, urgency, type Urgency } from '../lib/assignments'
import { ASSIGNMENT_STATUSES, type AssignmentStatus, type AssignmentView } from '../lib/types'
import { Avatar, Empty, PageHead, PayBar, RateNotice, Segmented } from '../ui/kit'

type Filter = 'open' | 'late' | 'collect' | 'delivered' | 'cancelled' | 'all'

const GROUPS: { id: Urgency; label: string }[] = [
  { id: 'late', label: 'Past the deadline' },
  { id: 'today', label: 'Due in the next 24 hours' },
  { id: 'soon', label: 'Due in the next 3 days' },
  { id: 'later', label: 'Later' },
  { id: 'done', label: 'Finished' },
]

export default function Assignments() {
  const { assignments, isOwner, money, currency, missingRates, team, personName } = useData()
  const { open } = useSheet()
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [writer, setWriter] = useState('')

  const notSetUp = missingTables.has('assignments')
  const live = assignments.filter((a) => a.status !== 'cancelled')
  const openOnes = assignments.filter((a) => a.open)
  const late = openOnes.filter((a) => a.late)
  const next24 = openOnes.filter((a) => !a.late && a.hoursLeft <= 24)
  const week = openOnes.filter((a) => !a.late && a.hoursLeft <= 24 * 7)
  const outstanding = live.reduce((s, a) => s + a.base.remaining, 0)
  const toCollect = live.filter((a) => a.priced && (a.native.remaining > 0 && (a.status === 'delivered' || a.advanceShort)))
  const month = monthKey(today())
  const deliveredThisMonth = assignments.filter((a) => a.status === 'delivered' && a.delivered_at && monthKey(a.delivered_at.slice(0, 10)) === month)

  const match: Record<Filter, (a: AssignmentView) => boolean> = {
    open: (a) => a.open, late: (a) => a.late, collect: (a) => toCollect.includes(a),
    delivered: (a) => a.status === 'delivered', cancelled: (a) => a.status === 'cancelled', all: () => true,
  }
  const needle = q.trim().toLowerCase()
  const rows = useMemo(() => assignments
    .filter(match[filter])
    .filter((a) => !writer || (writer === 'none' ? !a.assignee_id : a.assignee_id === writer))
    .filter((a) => !needle || [a.title, a.student_name, a.subject, a.institution, a.student_contact].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => (filter === 'delivered' || filter === 'all' || filter === 'cancelled')
      ? b.deadline.localeCompare(a.deadline)
      : a.deadline.localeCompare(b.deadline)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [assignments, filter, writer, needle])

  const grouped = filter === 'open' || filter === 'late'
    ? GROUPS.map((g) => ({ ...g, rows: rows.filter((a) => urgency(a) === g.id) })).filter((g) => g.rows.length > 0)
    : [{ id: 'all' as const, label: '', rows }]

  const exportCsv = () => downloadCsv(`assignments-${today()}.csv`, [
    ['Assignment', 'Student', 'Contact', 'University', 'Subject', 'Words', 'Writer', 'Status', 'Deadline', 'Delivered', 'On time',
      'Currency', 'Price', 'Advance asked', 'Advance paid', 'Balance paid', 'Remaining', `Remaining (${currency})`],
    ...assignments.map((a) => [a.title, a.student_name, a.student_contact, a.institution, a.subject, a.word_count, personName(a.assignee_id),
      ASSIGNMENT_STATUSES.find((s) => s.id === a.status)?.label ?? a.status, a.deadline, a.delivered_at ?? '',
      a.onTime === null ? '' : a.onTime ? 'Yes' : 'No', a.currency, a.native.amount, a.native.advanceDue, a.native.advancePaid,
      a.native.balancePaid, a.native.remaining, a.base.remaining]),
  ])

  return (
    <>
      <PageHead title="Assignments" sub={
        <>
          <span className="font-semibold text-ink">{openOnes.length} open</span>
          {late.length > 0 && <>, <span className="font-semibold text-late">{late.length} past the deadline</span></>}
          {next24.length > 0 && <>, {next24.length} due in 24 hours</>}.
          {isOwner && outstanding > 0 && <> <span className="font-semibold text-ink">{money(outstanding)}</span> still to collect.</>}
        </>
      }>
        {isOwner && <Link to="/assignments/report" className="btn"><ChartBar size={16} />Report</Link>}
        {isOwner && <Link to="/calculator" className="btn"><Calculator size={16} />Calculator</Link>}
        {isOwner && <button className="btn" onClick={exportCsv} disabled={assignments.length === 0}><DownloadSimple size={16} />Export CSV</button>}
        {isOwner && <button className="btn btn-primary" onClick={() => open({ kind: 'assignment' })} disabled={notSetUp}><Plus size={16} weight="bold" />New assignment</button>}
      </PageHead>

      {notSetUp && isOwner && (
        <p role="status" className="mb-5 flex gap-2.5 rounded-[0.9rem] border border-gold bg-[color-mix(in_srgb,var(--gold)_14%,var(--surface))] px-4 py-3">
          <Warning size={20} className="mt-0.5 shrink-0 text-due" />
          <span><span className="font-semibold">Assignments need a one-time database update.</span> Run the whole <code className="font-mono text-[0.9em]">supabase/schema.sql</code> again in the Supabase SQL editor, then reload. Your existing data is kept.</span>
        </p>
      )}
      {isOwner && <RateNotice missing={missingRates} base={currency} canEdit />}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Past the deadline" value={String(late.length)} tone={late.length > 0 ? 'late' : undefined} onClick={() => setFilter('late')} />
        <Tile label="Due in 24 hours" value={String(next24.length)} tone={next24.length > 0 ? 'due' : undefined} onClick={() => setFilter('open')} />
        <Tile label="Due this week" value={String(week.length)} onClick={() => setFilter('open')} />
        {isOwner
          ? <Tile label="Still to collect" value={money(outstanding)} sub={toCollect.length > 0 ? `${toCollect.length} to chase now` : undefined} onClick={() => setFilter('collect')} />
          : <Tile label="Delivered this month" value={String(deliveredThisMonth.length)} onClick={() => setFilter('delivered')} />}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Filter> label="Filter assignments" value={filter} onChange={setFilter} options={[
          { id: 'open', label: 'Open', count: openOnes.length },
          { id: 'late', label: 'Late', count: late.length },
          ...(isOwner ? [{ id: 'collect' as const, label: 'To collect', count: toCollect.length }] : []),
          { id: 'delivered', label: 'Delivered' },
          { id: 'cancelled', label: 'Cancelled' },
          { id: 'all', label: 'All' },
        ]} />
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search assignments</span>
          <MagnifyingGlass size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-mute" />
          <input className="input h-9 pl-9" placeholder="Student, subject, university…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {isOwner && team.length > 0 && (
          <select className="input h-9 w-auto" aria-label="Filter by writer" value={writer} onChange={(e) => setWriter(e.target.value)}>
            <option value="">Every writer</option>
            <option value="none">No writer yet</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title={assignments.length === 0 ? 'No assignments yet' : 'Nothing in this list'}>
          {assignments.length === 0
            ? (isOwner ? 'Add an assignment with its deadline, price and advance. Deadlines, balances and writers are tracked from there.' : 'Assignments given to you will show here.')
            : filter === 'late' ? 'Everything is on schedule.' : filter === 'collect' ? 'No balances or advances to chase.' : undefined}
        </Empty>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.id}>
              {g.label && <h2 className={`mb-2 text-[0.95rem] font-semibold ${g.id === 'late' ? 'text-late' : ''}`}>{g.label} <span className="font-normal text-mute">{g.rows.length}</span></h2>}
              <ul className="panel divide-y divide-line">{g.rows.map((a) => <AssignmentRow key={a.id} a={a} />)}</ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function Tile({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: 'late' | 'due'; onClick?(): void }) {
  return (
    <button type="button" onClick={onClick} className="panel row-link p-4 text-left">
      <p className="text-[0.87rem] text-mute">{label}</p>
      <p className={`mt-1 font-display text-[1.6rem] leading-tight font-semibold ${tone === 'late' ? 'text-late' : tone === 'due' ? 'text-due' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.82rem] text-mute">{sub}</p>}
    </button>
  )
}

export function AssignmentRow({ a }: { a: AssignmentView }) {
  const { isOwner, moneyIn, personName } = useData()
  const { patch } = useActions()
  const { open } = useSheet()
  const show = () => open({ kind: 'assignment', id: a.id })
  const fmt = (n: number) => moneyIn(n, a.currency)
  const u = urgency(a)
  const setStatus = (status: AssignmentStatus) => patch('assignments', a.id, {
    status, delivered_at: status === 'delivered' ? a.delivered_at ?? new Date().toISOString() : null,
  }, status === 'delivered' ? 'Marked delivered' : 'Status updated')
  const meta = [a.student_name, a.subject, a.institution, a.word_count ? `${a.word_count.toLocaleString()} words` : ''].filter(Boolean).join(' · ')
  const stripe = { late: 'bg-late', today: 'bg-gold', soon: 'bg-[color-mix(in_srgb,var(--gold)_45%,transparent)]', later: 'bg-transparent', done: 'bg-transparent' }[u]

  return (
    <li className="row-link relative grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 px-4 py-3.5 first:rounded-t-[0.9rem] last:rounded-b-[0.9rem] md:grid-cols-[minmax(0,1.5fr)_11rem_minmax(0,1.2fr)_auto]"
      onClick={show} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && show()} tabIndex={0}>
      <span aria-hidden="true" className={`absolute inset-y-2 left-0 w-1 rounded-r ${stripe}`} />
      <div className="min-w-0">
        <p className={`truncate font-semibold ${a.status === 'cancelled' ? 'text-mute line-through' : ''}`}>{a.title}</p>
        <p className="truncate text-[0.87rem] text-mute">{meta}</p>
      </div>

      <div className="text-right md:text-left">
        <p className="text-[0.87rem] whitespace-nowrap">{deadlineLabel(a.deadline)}</p>
        <p className={`text-[0.82rem] font-semibold whitespace-nowrap ${u === 'late' ? 'text-late' : u === 'today' ? 'text-due' : 'text-mute'}`}>
          {a.open ? deadlineIn(a.hoursLeft) : a.status === 'delivered' ? (a.onTime ? 'Delivered on time' : 'Delivered late') : 'Cancelled'}
        </p>
      </div>

      <div className="col-span-2 min-w-0 md:col-span-1">
        {isOwner && a.priced ? (
          <>
            <PayBar bill={{ amount: a.native.amount, paid: a.native.paid, remaining: a.native.remaining, overdue: a.status === 'delivered' && a.native.remaining > 0 }} />
            <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[0.85rem]">
              <span><span className="font-semibold text-paid">{fmt(a.native.paid)}</span> <span className="text-mute">of {fmt(a.native.amount)}</span></span>
              {a.native.remaining > 0
                ? <span className={a.status === 'delivered' ? 'font-semibold text-late' : ''}>{fmt(a.native.remaining)} <span className="font-normal text-mute">left</span></span>
                : <span className="font-semibold text-paid">Paid in full</span>}
            </p>
            {a.advanceShort && <p className="mt-0.5 text-[0.8rem] font-semibold text-due">Advance not received: {fmt(a.native.advanceDue - a.native.advancePaid)} due</p>}
          </>
        ) : isOwner ? (
          <p className="text-[0.85rem] text-mute">No price set</p>
        ) : (
          <p className="flex items-center gap-2 text-[0.87rem] text-mute">{a.details ? a.details.slice(0, 80) : 'Open for the brief'}</p>
        )}
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end" onClick={(e) => e.stopPropagation()}>
        {isOwner && (
          <span className="flex min-w-0 items-center gap-1.5 text-[0.85rem] md:hidden xl:flex">
            {a.assignee_id ? <><Avatar name={personName(a.assignee_id)} size={22} /><span className="truncate">{personName(a.assignee_id)}</span></> : <span className="tag tag-due">No writer</span>}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <select className="input h-8 w-auto py-0 text-[0.82rem]" aria-label={`Status of ${a.title}`} value={a.status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}>
            {ASSIGNMENT_STATUSES.filter((s) => isOwner || s.id !== 'cancelled' || a.status === 'cancelled').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {isOwner && a.priced && a.native.remaining > 0 && a.status !== 'cancelled' && (
            <button className="btn btn-sm" onClick={() => open({ kind: 'assignmentPayment', assignmentId: a.id })}>Payment</button>
          )}
        </div>
      </div>
    </li>
  )
}
