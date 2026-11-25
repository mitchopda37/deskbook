import { useState, type FormEvent, type ReactNode } from 'react'
import { Trash } from '@phosphor-icons/react'
import { useActions, useAuth, useData, useSheet, type Sheet } from '../lib/store'
import { addDays, dayLabel, today } from '../lib/dates'
import { BILLING_LABEL, CLIENT_SOURCES, CURRENCIES, currencyLabel, PIPELINE_STAGES, TASK_STATUSES, type BillingType } from '../lib/types'
import { Drawer, Field, PayBar, PayTag } from './kit'
import { AssignmentPaymentSheet, AssignmentSheet } from './AssignmentSheets'

const METHODS = ['Bank transfer', 'UPI', 'Card', 'Cash', 'Cheque', 'PayPal', 'Other']

export function Sheets() {
  const { sheet } = useSheet()
  if (!sheet) return null
  const key = JSON.stringify(sheet)
  switch (sheet.kind) {
    case 'client': return <ClientSheet key={key} sheet={sheet} />
    case 'task': return <TaskSheet key={key} sheet={sheet} />
    case 'invoice': return <InvoiceSheet key={key} sheet={sheet} />
    case 'payment': return <PaymentSheet key={key} sheet={sheet} />
    case 'followup': return <FollowupSheet key={key} sheet={sheet} />
    case 'assignment': return <AssignmentSheet key={key} sheet={sheet} />
    case 'assignmentPayment': return <AssignmentPaymentSheet key={key} sheet={sheet} />
  }
}

function FormDrawer({
  title, saveLabel, onSave, onDelete, deleteLabel, children,
}: { title: string; saveLabel: string; onSave(): Promise<unknown> | void; onDelete?(): void; deleteLabel?: string; children: ReactNode }) {
  const { close, leaving } = useSheet()
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await onSave()
    setBusy(false)
  }
  return (
    <form onSubmit={submit}>
      <Drawer
        title={title}
        onClose={close}
        leaving={leaving}
        footer={
          <>
            <button type="submit" className="btn btn-primary" disabled={busy}>{saveLabel}</button>
            <button type="button" className="btn btn-quiet" onClick={close}>Cancel</button>
            {onDelete && (
              <button type="button" className="btn btn-danger ml-auto" onClick={onDelete}>
                <Trash size={16} />{deleteLabel ?? 'Delete'}
              </button>
            )}
          </>
        }
      >
        {children}
      </Drawer>
    </form>
  )
}

function ClientSelect({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { clients } = useData()
  return (
    <select className="input" required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Choose a client</option>
      {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

// ------------------------------------------------------------------ client

function ClientSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'client' }> }) {
  const { clients, retainers, currency, bills } = useData()
  const { add, patch, upsert, remove } = useActions()
  const { close } = useSheet()
  const existing = clients.find((c) => c.id === sheet.id)
  const retainer = retainers.find((r) => r.client_id === sheet.id)
  const [f, setF] = useState({
    name: existing?.name ?? '', contact_name: existing?.contact_name ?? '', email: existing?.email ?? '',
    phone: existing?.phone ?? '', billing_type: (existing?.billing_type ?? 'retainer') as BillingType,
    status: existing?.status ?? 'active', source: existing?.source ?? 'referral',
    pipeline_stage: existing?.pipeline_stage ?? 'lead', notes: existing?.notes ?? '',
    amount: retainer ? String(retainer.amount) : '', billing_day: String(retainer?.billing_day ?? 1),
    currency: existing?.currency || currency,
  })
  const billedBefore = !!existing && bills.some((b) => b.client_id === existing.id)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    const { amount, billing_day, ...fields } = f
    // Null means "same as the workspace", so a later change of workspace currency follows through.
    const row = { ...fields, currency: fields.currency === currency ? null : fields.currency }
    let id = existing?.id
    if (id) await patch('clients', id, row, 'Client saved')
    else id = (await add('clients', row, 'Client added'))?.id
    if (!id) return
    if (f.billing_type === 'retainer' && Number(amount) > 0) {
      await upsert('retainers', { client_id: id, amount: Number(amount), billing_day: Number(billing_day) }, 'client_id')
    } else if (retainer) {
      await remove('retainers', id, undefined, 'client_id')
    }
    close()
  }
  const del = async () => {
    if (!existing || !confirm(`Delete ${existing.name}? Their work, invoices, payments and follow-ups are deleted too.`)) return
    await remove('clients', existing.id, 'Client deleted')
    close()
  }

  return (
    <FormDrawer title={existing ? 'Edit client' : 'New client'} saveLabel={existing ? 'Save client' : 'Add client'}
      onSave={save} onDelete={existing ? del : undefined}>
      <Field label="Client or company name"><input className="input" required autoFocus value={f.name} onChange={set('name')} /></Field>
      <Field label="Contact person"><input className="input" value={f.contact_name} onChange={set('contact_name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="How you bill them">
        <select className="input" value={f.billing_type} onChange={set('billing_type')}>
          {Object.entries(BILLING_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead source">
          <select className="input" value={f.source} onChange={set('source')}>
            {CLIENT_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Pipeline stage">
          <select className="input" value={f.pipeline_stage} onChange={set('pipeline_stage')}>
            {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Billing currency" hint={billedBefore ? 'New invoices use this currency. Existing invoices keep theirs.' : f.currency === currency ? 'Same as the workspace.' : `Totals convert to ${currency} using the rate in Settings.`}>
        <select className="input" value={f.currency} onChange={set('currency')}>
          {[currency, ...CURRENCIES.filter((c) => c !== currency)].map((c) => <option key={c} value={c}>{currencyLabel(c)}{c === currency ? ' (workspace)' : ''}</option>)}
        </select>
      </Field>
      {f.billing_type === 'retainer' && (
        <div className="grid grid-cols-2 gap-3 rounded-[0.7rem] bg-sunk p-3">
          <Field label={`Amount each month (${f.currency})`}>
            <input className="input" type="number" min="1" step="any" required value={f.amount} onChange={set('amount')} />
          </Field>
          <Field label="Due on day of month">
            <input className="input" type="number" min="1" max="28" required value={f.billing_day} onChange={set('billing_day')} />
          </Field>
        </div>
      )}
      <Field label="Status">
        <select className="input" value={f.status} onChange={set('status')}>
          <option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
        </select>
      </Field>
      <Field label="Notes" hint="Anything the team should know before working with this client.">
        <textarea className="input" rows={4} value={f.notes} onChange={set('notes')} />
      </Field>
    </FormDrawer>
  )
}

// ------------------------------------------------------------------ work item

function TaskSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'task' }> }) {
  const { tasks, team, isOwner } = useData()
  const { userId } = useAuth()
  const { add, patch, remove } = useActions()
  const { close } = useSheet()
  const existing = tasks.find((t) => t.id === sheet.id)
  const [f, setF] = useState({
    title: existing?.title ?? '', client_id: existing?.client_id ?? sheet.clientId ?? '',
    assignee_id: existing ? existing.assignee_id ?? '' : userId ?? '',
    due_on: existing ? existing.due_on ?? '' : today(), priority: existing?.priority ?? 'normal',
    status: existing?.status ?? sheet.status ?? 'todo', details: existing?.details ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    const row = { ...f, assignee_id: f.assignee_id || null, due_on: f.due_on || null }
    if (existing) await patch('tasks', existing.id, row, 'Work saved')
    else await add('tasks', row, 'Work added')
    close()
  }
  const del = async () => {
    if (!existing || !confirm('Delete this work item?')) return
    await remove('tasks', existing.id, 'Work deleted')
    close()
  }

  return (
    <FormDrawer title={existing ? 'Edit work' : 'New work'} saveLabel={existing ? 'Save work' : 'Add work'}
      onSave={save} onDelete={existing && isOwner ? del : undefined}>
      <Field label="What needs doing"><input className="input" required autoFocus value={f.title} onChange={set('title')} /></Field>
      <Field label="Client"><ClientSelect value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who does it">
          <select className="input" value={f.assignee_id} onChange={set('assignee_id')} disabled={!isOwner}>
            {isOwner && <option value="">Nobody yet</option>}
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}{p.id === userId ? ' (you)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Due"><input className="input" type="date" value={f.due_on} onChange={set('due_on')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <select className="input" value={f.status} onChange={set('status')}>
            {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={f.priority} onChange={set('priority')}>
            <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
        </Field>
      </div>
      <Field label="Details"><textarea className="input" rows={5} value={f.details} onChange={set('details')} /></Field>
    </FormDrawer>
  )
}

// ------------------------------------------------------------------ invoice

function InvoiceSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'invoice' }> }) {
  const { bills, currency, money, moneyIn, currencyOfClient, rateFor } = useData()
  const { add, patch, remove } = useActions()
  const { close, open } = useSheet()
  const existing = bills.find((b) => b.id === sheet.id)
  const startClient = existing?.client_id ?? sheet.clientId ?? ''
  const [f, setF] = useState({
    client_id: startClient, title: existing?.title ?? '',
    amount: existing ? String(existing.native.amount) : '', issued_on: existing?.issued_on ?? today(),
    due_on: existing?.due_on ?? addDays(today(), 7), notes: existing?.notes ?? '',
    currency: existing?.currency ?? (startClient ? currencyOfClient(startClient) : currency),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  // Payments are recorded in the invoice currency, so it is fixed once money has come in.
  const currencyLocked = !!existing && existing.payments.length > 0
  const rate = rateFor(f.currency)
  const preview = Number(f.amount) > 0 && f.currency !== currency && rate ? money(Number(f.amount) * rate) : ''

  const save = async () => {
    const row = { ...f, amount: Number(f.amount) }
    if (existing) await patch('invoices', existing.id, row, 'Invoice saved')
    else await add('invoices', row, 'Invoice added')
    close()
  }
  const del = async () => {
    if (!existing || !confirm('Delete this invoice and every payment recorded against it?')) return
    await remove('invoices', existing.id, 'Invoice deleted')
    close()
  }

  return (
    <FormDrawer title={existing ? 'Invoice' : 'New invoice'} saveLabel={existing ? 'Save invoice' : 'Add invoice'}
      onSave={save} onDelete={existing ? del : undefined}>
      {existing && (
        <section className="rounded-[0.7rem] bg-sunk p-4">
          <div className="mb-2 flex items-center justify-between">
            <PayTag bill={existing} />
            {existing.remaining > 0 && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => open({ kind: 'payment', invoiceId: existing.id })}>
                Record payment
              </button>
            )}
          </div>
          <PayBar bill={existing} />
          <div className="mt-2 flex justify-between text-[0.9rem]">
            <span><span className="font-semibold text-paid">{moneyIn(existing.native.paid, existing.currency)}</span> received</span>
            <span><span className="font-semibold">{moneyIn(existing.native.remaining, existing.currency)}</span> remaining</span>
          </div>
          {existing.payments.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {existing.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-[0.9rem]">
                  <span className="w-20 shrink-0 text-mute">{dayLabel(p.paid_on)}</span>
                  <span className="min-w-0 flex-1 truncate">{[p.method, p.note].filter(Boolean).join(', ') || 'Payment'}</span>
                  <span className="font-semibold">{moneyIn(p.native_amount, p.currency)}</span>
                  <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Remove payment"
                    onClick={() => confirm('Remove this payment?') && remove('payments', p.id, 'Payment removed')}>
                    <Trash size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Field label="Client"><ClientSelect value={f.client_id} onChange={(v) => setF({ ...f, client_id: v, currency: currencyLocked ? f.currency : currencyOfClient(v) })} /></Field>
      <Field label="What it is for"><input className="input" required placeholder="Logo design, March retainer" value={f.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <Field label={`Amount (${f.currency})`} hint={preview ? `About ${preview} at your saved rate.` : undefined}>
          <input className="input" type="number" min="0.01" step="any" required value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Currency" hint={currencyLocked ? 'Fixed after a payment.' : undefined}>
          <select className="input" value={f.currency} onChange={set('currency')} disabled={currencyLocked}>
            {[currency, ...CURRENCIES.filter((c) => c !== currency)].map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Billed on"><input className="input" type="date" required value={f.issued_on} onChange={set('issued_on')} /></Field>
        <Field label="Due on"><input className="input" type="date" required value={f.due_on} onChange={set('due_on')} /></Field>
      </div>
      <Field label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
    </FormDrawer>
  )
}

// ------------------------------------------------------------------ payment

function PaymentSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'payment' }> }) {
  const { bills, clientName, moneyIn } = useData()
  const { add } = useActions()
  const { close } = useSheet()
  const bill = bills.find((b) => b.id === sheet.invoiceId)
  const [f, setF] = useState({ amount: bill ? String(bill.native.remaining) : '', paid_on: today(), method: METHODS[0], note: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  if (!bill) return null

  // Everything here is in the invoice's own currency; the database checks the same numbers.
  const owed = bill.native.remaining
  const fmt = (n: number) => moneyIn(n, bill.currency)
  const amount = Number(f.amount) || 0
  const applied = Math.min(amount, owed)
  const after = Math.max(0, Math.round((owed - amount) * 100) / 100)
  const save = async () => {
    await add('payments', { ...f, amount: applied, invoice_id: bill.id },
      after > 0 ? `Payment recorded. ${fmt(after)} remaining` : 'Payment recorded. Paid in full')
    close()
  }

  return (
    <FormDrawer title="Record payment" saveLabel="Record payment" onSave={save}>
      <section className="rounded-[0.7rem] bg-sunk p-4">
        <p className="font-semibold">{clientName(bill.client_id)}</p>
        <p className="text-mute">{bill.title}</p>
        <PayBar className="mt-3" bill={{ ...bill, amount: bill.native.amount, paid: bill.native.paid + applied, remaining: after }} />
        <p className="mt-2 text-[0.9rem]">
          {after > 0
            ? <>After this payment <span className="font-semibold">{fmt(after)}</span> is still remaining.</>
            : <span className="font-semibold text-paid">This pays the invoice in full.</span>}
        </p>
      </section>
      <Field label={`Amount received (${bill.currency})`}>
        <input className="input" type="number" min="0.01" max={owed} step="any" required autoFocus value={f.amount} onChange={set('amount')} />
      </Field>
      <div className="-mt-2 flex gap-2">
        <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, amount: String(owed) })}>All {fmt(owed)}</button>
        <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, amount: String(Math.round(owed * 50) / 100) })}>Half</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received on"><input className="input" type="date" required value={f.paid_on} onChange={set('paid_on')} /></Field>
        <Field label="How">
          <select className="input" value={f.method} onChange={set('method')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
      </div>
      <Field label="Note"><input className="input" placeholder="Reference number, promise for the rest" value={f.note} onChange={set('note')} /></Field>
    </FormDrawer>
  )
}

// ------------------------------------------------------------------ follow-up

function FollowupSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'followup' }> }) {
  const { followups, team, isOwner } = useData()
  const { userId } = useAuth()
  const { add, patch, remove } = useActions()
  const { close } = useSheet()
  const existing = followups.find((x) => x.id === sheet.id)
  const [f, setF] = useState({
    client_id: existing?.client_id ?? sheet.clientId ?? '', about: existing?.about ?? sheet.about ?? '',
    due_on: existing?.due_on ?? today(), owner_id: existing ? existing.owner_id ?? '' : userId ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    const row = { ...f, owner_id: f.owner_id || null }
    if (existing) await patch('followups', existing.id, row, 'Follow-up saved')
    else await add('followups', { ...row, invoice_id: sheet.invoiceId ?? null }, 'Follow-up added')
    close()
  }
  const del = async () => {
    if (!existing || !confirm('Delete this follow-up?')) return
    await remove('followups', existing.id, 'Follow-up deleted')
    close()
  }

  return (
    <FormDrawer title={existing ? 'Edit follow-up' : 'New follow-up'} saveLabel={existing ? 'Save follow-up' : 'Add follow-up'}
      onSave={save} onDelete={existing && isOwner ? del : undefined}>
      <Field label="Client"><ClientSelect value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} /></Field>
      <Field label="What to follow up on">
        <textarea className="input" rows={3} required autoFocus placeholder="Call about the unpaid invoice" value={f.about} onChange={set('about')} />
      </Field>
      <Field label="When"><input className="input" type="date" required value={f.due_on} onChange={set('due_on')} /></Field>
      <div className="-mt-2 flex gap-2">
        {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([label, n]) => (
          <button key={label} type="button" className="btn btn-sm" onClick={() => setF({ ...f, due_on: addDays(today(), n as number) })}>{label}</button>
        ))}
      </div>
      <Field label="Who follows up">
        <select className="input" value={f.owner_id} onChange={set('owner_id')} disabled={!isOwner}>
          {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}{p.id === userId ? ' (you)' : ''}</option>)}
        </select>
      </Field>
    </FormDrawer>
  )
}
