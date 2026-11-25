import { useMemo, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { useActions, useAuth, useData, useSheet, useToast, type Sheet } from '../lib/store'
import { dayLabel, today } from '../lib/dates'
import { ASSIGNMENT_STATUSES, CURRENCIES, currencyLabel, type AssignmentPaymentKind, type AssignmentStatus } from '../lib/types'
import { Drawer, Field, PayBar } from './kit'
import { splitAdvance } from '../lib/assignments'

const METHODS = ['Bank transfer', 'PayPal', 'UPI', 'Card', 'Cash', 'Stripe', 'Wise', 'Other']

/** ISO timestamp -> value for <input type="datetime-local"> in the viewer's time zone. */
const toLocalInput = (isoString: string) => {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const defaultDeadline = () => {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  d.setHours(17, 0, 0, 0)
  return toLocalInput(d.toISOString())
}

function Shell({ title, saveLabel, onSave, onDelete, children, busy }: {
  title: string; saveLabel: string; onSave(): void; onDelete?(): void; children: React.ReactNode; busy: boolean
}) {
  const { close, leaving } = useSheet()
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave() }}>
      <Drawer title={title} onClose={close} leaving={leaving} footer={
        <>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
          <button type="button" className="btn btn-quiet" onClick={close}>Cancel</button>
          {onDelete && <button type="button" className="btn btn-danger ml-auto" onClick={onDelete}><Trash size={16} />Delete</button>}
        </>
      }>{children}</Drawer>
    </form>
  )
}

export function AssignmentSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'assignment' }> }) {
  const { assignments, team, isOwner, currency: base, moneyIn, rateFor, money } = useData()
  const { userId } = useAuth()
  const { add, patch, upsert, remove } = useActions()
  const { close } = useSheet()
  const toast = useToast()
  const existing = assignments.find((a) => a.id === sheet.id)
  const pre = sheet.prefill
  const lastCurrency = useMemo(() => [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((a) => a.priced)?.currency, [assignments])

  const [f, setF] = useState({
    title: existing?.title ?? '',
    student_name: existing?.student_name ?? '',
    student_contact: existing?.student_contact ?? '',
    institution: existing?.institution ?? '',
    subject: existing?.subject ?? '',
    word_count: existing?.word_count != null ? String(existing.word_count) : pre?.words ? String(pre.words) : '',
    details: existing?.details ?? '',
    status: (existing?.status ?? 'new') as AssignmentStatus,
    assignee_id: existing?.assignee_id ?? '',
    deadline: existing ? toLocalInput(existing.deadline) : defaultDeadline(),
  })
  const [m, setM] = useState({
    price: existing?.priced ? String(existing.native.amount) : pre ? String(pre.amount) : '',
    currency: existing?.priced ? existing.currency : pre?.currency ?? lastCurrency ?? base,
    advanceMode: 'percent' as 'percent' | 'amount',
    advancePercent: existing?.priced && existing.native.amount > 0 ? String(Math.round((existing.native.advanceDue / existing.native.amount) * 1000) / 10) : pre && pre.amount > 0 ? String(Math.round((pre.advance / pre.amount) * 1000) / 10) : '50',
    advanceAmount: existing?.priced ? String(existing.native.advanceDue) : pre ? String(pre.advance) : '',
    receivedNow: !existing,
    method: METHODS[0],
    paid_on: today(),
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const writerOnly = !isOwner
  const hasPayments = (existing?.payments.length ?? 0) > 0

  const price = Math.max(0, Number(m.price) || 0)
  const { advance, remaining } = splitAdvance(price, m.advanceMode === 'percent' ? { percent: Number(m.advancePercent) || 0 } : { amount: Number(m.advanceAmount) || 0 })
  const fmt = (n: number) => moneyIn(n, m.currency)
  const foreign = m.currency !== base
  const rate = rateFor(m.currency)

  const students = useMemo(() => [...new Set(assignments.map((a) => a.student_name).filter(Boolean))].sort(), [assignments])
  const institutions = useMemo(() => [...new Set(assignments.map((a) => a.institution).filter(Boolean))].sort(), [assignments])

  const save = async () => {
    setBusy(true)
    const deadline = new Date(f.deadline).toISOString()
    const delivered_at = f.status === 'delivered' ? existing?.delivered_at ?? new Date().toISOString() : null
    if (writerOnly && existing) {
      await patch('assignments', existing.id, { status: f.status, details: f.details, delivered_at }, 'Assignment updated')
      setBusy(false); close(); return
    }
    const row = {
      title: f.title.trim(), student_name: f.student_name.trim(), student_contact: f.student_contact.trim(),
      institution: f.institution.trim(), subject: f.subject.trim(), details: f.details,
      word_count: f.word_count === '' ? null : Math.max(0, Math.round(Number(f.word_count))),
      status: f.status, assignee_id: f.assignee_id || null, deadline, delivered_at,
    }
    let id = existing?.id
    if (existing) await patch('assignments', existing.id, row)
    else id = (await add('assignments', { ...row, created_by: userId }))?.id
    if (!id) { setBusy(false); return }

    if (m.price !== '') {
      await upsert('assignment_fees', { assignment_id: id, amount: price, currency: m.currency, advance_due: advance }, 'assignment_id')
    }
    let note = existing ? 'Assignment saved' : 'Assignment added'
    if (!existing && m.price !== '' && m.receivedNow && advance > 0) {
      const paid = await add('assignment_payments', { assignment_id: id, amount: advance, kind: 'advance', paid_on: m.paid_on, method: m.method })
      if (paid) note = `Assignment added. Advance ${fmt(advance)} received, ${fmt(remaining)} remaining`
    }
    setBusy(false)
    close()
    toast(note)
  }

  const del = async () => {
    if (!existing || !confirm(`Delete "${existing.title}" and its payments? This cannot be undone.`)) return
    await remove('assignments', existing.id, 'Assignment deleted')
    close()
  }

  return (
    <Shell title={existing ? (writerOnly ? existing.title : 'Edit assignment') : 'New assignment'} saveLabel={existing ? 'Save' : 'Add assignment'}
      onSave={save} onDelete={existing && isOwner ? del : undefined} busy={busy}>
      <Field label="Assignment">
        <input className="input" required autoFocus={!existing} disabled={writerOnly} placeholder="e.g. Marketing plan, 2,500 words" value={f.title} onChange={set('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Student">
          <input className="input" required disabled={writerOnly} list="student-names" placeholder="Full name" value={f.student_name} onChange={set('student_name')} />
          <datalist id="student-names">{students.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Email or phone">
          <input className="input" disabled={writerOnly} placeholder="Optional" value={f.student_contact} onChange={set('student_contact')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="University or school">
          <input className="input" disabled={writerOnly} list="institutions" placeholder="Optional" value={f.institution} onChange={set('institution')} />
          <datalist id="institutions">{institutions.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Subject or unit code">
          <input className="input" disabled={writerOnly} placeholder="e.g. MKTG20001" value={f.subject} onChange={set('subject')} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Deadline" hint="Date and time it must be delivered.">
          <input className="input" type="datetime-local" required disabled={writerOnly} value={f.deadline} onChange={set('deadline')} />
        </Field>
        <Field label="Words">
          <input className="input" type="number" min="0" step="1" inputMode="numeric" disabled={writerOnly} placeholder="Optional" value={f.word_count} onChange={set('word_count')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Writer">
          <select className="input" disabled={writerOnly} value={f.assignee_id} onChange={set('assignee_id')}>
            <option value="">Nobody yet</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            {ASSIGNMENT_STATUSES.filter((s) => !writerOnly || s.id !== 'cancelled' || f.status === 'cancelled').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Brief and notes">
        <textarea className="input" rows={3} placeholder="Marking rubric, referencing style, files shared…" value={f.details} onChange={set('details')} />
      </Field>

      {isOwner && (
        <fieldset className="space-y-3 rounded-[0.8rem] border border-line p-4">
          <legend className="px-1 font-semibold">Price and advance</legend>
          <div className="grid grid-cols-[1fr_9.5rem] gap-3">
            <Field label="Total price">
              <input className="input" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={m.price} onChange={(e) => setM({ ...m, price: e.target.value })} />
            </Field>
            <Field label="Currency">
              <select className="input" disabled={hasPayments} value={m.currency} onChange={(e) => setM({ ...m, currency: e.target.value })}>
                {[...new Set([m.currency, base, ...CURRENCIES])].map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="field-label mb-0">Advance asked up front</span>
              <div className="inline-flex rounded-[0.5rem] bg-sunk p-0.5 text-[0.82rem] font-semibold" role="tablist" aria-label="Advance as">
                {(['percent', 'amount'] as const).map((mode) => (
                  <button key={mode} type="button" role="tab" aria-selected={m.advanceMode === mode}
                    onClick={() => setM({ ...m, advanceMode: mode, advanceAmount: mode === 'amount' ? String(advance) : m.advanceAmount, advancePercent: mode === 'percent' && price > 0 ? String(Math.round((advance / price) * 1000) / 10) : m.advancePercent })}
                    className={`rounded-[0.4rem] px-2.5 py-1 ${m.advanceMode === mode ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_27_59/0.12)]' : 'text-mute'}`}>
                    {mode === 'percent' ? '%' : m.currency}
                  </button>
                ))}
              </div>
            </div>
            {m.advanceMode === 'percent' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 25, 30, 40, 50, 100].map((p) => (
                  <button key={p} type="button" className={`btn btn-sm ${Number(m.advancePercent) === p ? 'border-ink' : ''}`} aria-pressed={Number(m.advancePercent) === p} onClick={() => setM({ ...m, advancePercent: String(p) })}>{p}%</button>
                ))}
                <input className="input h-8 w-20" type="number" min="0" max="100" step="any" aria-label="Advance percent" value={m.advancePercent} onChange={(e) => setM({ ...m, advancePercent: e.target.value })} />
              </div>
            ) : (
              <input className="input" type="number" min="0" max={price || undefined} step="any" inputMode="decimal" aria-label="Advance amount" value={m.advanceAmount} onChange={(e) => setM({ ...m, advanceAmount: e.target.value })} />
            )}
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-[0.65rem] border border-line text-center">
            <div className="p-2.5"><p className="text-[0.78rem] text-mute">Total</p><p className="font-semibold">{fmt(price)}</p></div>
            <div className="border-x border-line p-2.5"><p className="text-[0.78rem] text-mute">Advance</p><p className="font-semibold text-paid">{fmt(advance)}</p></div>
            <div className="p-2.5"><p className="text-[0.78rem] text-mute">On delivery</p><p className="font-semibold text-due">{fmt(remaining)}</p></div>
          </div>
          {foreign && price > 0 && (
            <p className="text-[0.82rem] text-mute">{rate ? <>About {money(price * rate)} at your saved rate.</> : <>Add a {m.currency} rate in Settings so this counts in {base} totals.</>}</p>
          )}

          {!existing && m.price !== '' && advance > 0 && (
            <div className="rounded-[0.65rem] bg-sunk p-3">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" className="size-4 accent-[var(--paid)]" checked={m.receivedNow} onChange={(e) => setM({ ...m, receivedNow: e.target.checked })} />
                Advance of {fmt(advance)} already received
              </label>
              {m.receivedNow && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" type="date" aria-label="Received on" required value={m.paid_on} onChange={(e) => setM({ ...m, paid_on: e.target.value })} />
                  <select className="input" aria-label="Paid by" value={m.method} onChange={(e) => setM({ ...m, method: e.target.value })}>{METHODS.map((x) => <option key={x}>{x}</option>)}</select>
                </div>
              )}
            </div>
          )}
          {existing?.priced && <PaymentHistory assignmentId={existing.id} />}
        </fieldset>
      )}
    </Shell>
  )
}

function PaymentHistory({ assignmentId }: { assignmentId: string }) {
  const { assignments, moneyIn } = useData()
  const { remove } = useActions()
  const { open } = useSheet()
  const a = assignments.find((x) => x.id === assignmentId)
  if (!a) return null
  const fmt = (n: number) => moneyIn(n, a.currency)
  return (
    <div className="border-t border-line pt-3">
      <PayBar bill={{ amount: a.native.amount, paid: a.native.paid, remaining: a.native.remaining, overdue: a.status === 'delivered' && a.native.remaining > 0 }} />
      <p className="mt-1.5 flex justify-between text-[0.87rem]">
        <span><span className="font-semibold text-paid">{fmt(a.native.paid)}</span> <span className="text-mute">received</span></span>
        <span><span className="font-semibold">{fmt(a.native.remaining)}</span> <span className="text-mute">remaining</span></span>
      </p>
      {a.payments.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-[0.6rem] border border-line text-[0.9rem]">
          {a.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className={`tag ${p.kind === 'advance' ? 'tag-paid' : ''}`}>{p.kind === 'advance' ? 'Advance' : 'Balance'}</span>
              <span className="font-semibold">{fmt(p.amount)}</span>
              <span className="min-w-0 flex-1 truncate text-mute">{dayLabel(p.paid_on)}{p.method ? ` · ${p.method}` : ''}</span>
              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Delete ${p.kind} payment of ${fmt(p.amount)}`}
                onClick={() => confirm(`Delete this ${fmt(p.amount)} payment?`) && remove('assignment_payments', p.id, 'Payment deleted')}><Trash size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {a.native.remaining > 0 && (
        <button type="button" className="btn btn-sm mt-2" onClick={() => open({ kind: 'assignmentPayment', assignmentId: a.id })}>Record payment</button>
      )}
    </div>
  )
}

export function AssignmentPaymentSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'assignmentPayment' }> }) {
  const { assignments, moneyIn } = useData()
  const { add } = useActions()
  const { close } = useSheet()
  const a = assignments.find((x) => x.id === sheet.assignmentId)
  const advanceLeft = a ? Math.max(0, Math.round((a.native.advanceDue - a.native.advancePaid) * 100) / 100) : 0
  const startKind: AssignmentPaymentKind = advanceLeft > 0 ? 'advance' : 'balance'
  const [f, setF] = useState({ kind: startKind, amount: a ? String(startKind === 'advance' ? Math.min(advanceLeft, a.native.remaining) : a.native.remaining) : '', paid_on: today(), method: METHODS[0], note: '' })
  const [busy, setBusy] = useState(false)
  if (!a) return null

  const owed = a.native.remaining
  const fmt = (n: number) => moneyIn(n, a.currency)
  const amount = Math.min(Number(f.amount) || 0, owed)
  const after = Math.max(0, Math.round((owed - amount) * 100) / 100)
  const save = async () => {
    setBusy(true)
    await add('assignment_payments', { assignment_id: a.id, amount, kind: f.kind, paid_on: f.paid_on, method: f.method, note: f.note },
      after > 0 ? `Payment recorded. ${fmt(after)} remaining` : 'Payment recorded. Paid in full')
    setBusy(false)
    close()
  }
  const pick = (kind: AssignmentPaymentKind) => setF({ ...f, kind, amount: String(kind === 'advance' && advanceLeft > 0 ? Math.min(advanceLeft, owed) : owed) })

  return (
    <Shell title="Record payment" saveLabel="Record payment" onSave={save} busy={busy}>
      <section className="rounded-[0.7rem] bg-sunk p-4">
        <p className="font-semibold">{a.title}</p>
        <p className="text-mute">{a.student_name}</p>
        <PayBar className="mt-3" bill={{ amount: a.native.amount, paid: a.native.paid + amount, remaining: after, overdue: false }} />
        <p className="mt-2 text-[0.9rem]">
          {after > 0 ? <>After this, <span className="font-semibold">{fmt(after)}</span> is still remaining.</> : <span className="font-semibold text-paid">This pays the assignment in full.</span>}
        </p>
      </section>
      <div>
        <span className="field-label">This payment is the</span>
        <div className="grid grid-cols-2 gap-2">
          {(['advance', 'balance'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => pick(k)}
              className={`rounded-[0.6rem] border px-3 py-2 text-left ${f.kind === k ? 'border-ink bg-sunk' : 'border-line'}`}>
              <span className="block font-semibold">{k === 'advance' ? 'Advance' : 'Balance'}</span>
              <span className="block text-[0.82rem] text-mute">{k === 'advance' ? (advanceLeft > 0 ? `${fmt(advanceLeft)} of the advance left` : 'Advance already received') : `${fmt(owed)} left in total`}</span>
            </button>
          ))}
        </div>
      </div>
      <Field label={`Amount received (${a.currency})`}>
        <input className="input" type="number" min="0.01" max={owed} step="any" required autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received on"><input className="input" type="date" required value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="How"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{METHODS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label="Note"><input className="input" placeholder="Transaction ID, promise for the rest" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Shell>
  )
}
