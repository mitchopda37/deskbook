import { Link, Navigate, useParams } from 'react-router-dom'
import { CaretLeft, EnvelopeSimple, PencilSimple, Phone, Plus } from '@phosphor-icons/react'
import { useData, useSheet } from '../lib/store'
import { BILLING_LABEL, CLIENT_SOURCES, PIPELINE_STAGES } from '../lib/types'
import { Empty, PayBar } from '../ui/kit'
import { FollowRow, WorkRow } from './Today'
import { BillRow } from './Money'

export default function ClientDetail() {
  const { id = '' } = useParams()
  const { clientById, retainers, tasks, bills, followups, isOwner, money, moneyIn, currencyOfClient } = useData()
  const { open } = useSheet()
  const c = clientById.get(id)
  if (!c) return <Navigate to="/clients" replace />

  const retainer = retainers.find((r) => r.client_id === id)
  const work = tasks.filter((t) => t.client_id === id).sort((a, b) =>
    Number(a.status === 'done') - Number(b.status === 'done') || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))
  const openWork = work.filter((t) => t.status !== 'done')
  const doneWork = work.filter((t) => t.status === 'done').slice(0, 5)
  const mine = bills.filter((b) => b.client_id === id).sort((a, b) => b.issued_on.localeCompare(a.issued_on))
  const follow = followups.filter((f) => f.client_id === id).sort((a, b) => Number(a.done) - Number(b.done) || a.due_on.localeCompare(b.due_on))
  // One currency across this client's invoices: total in that currency. Mixed: total in the workspace currency.
  const single = mine.length > 0 && mine.every((b) => b.currency === mine[0].currency) ? mine[0].currency : null
  const total = (n: number) => (single ? moneyIn(n, single) : money(n))
  const billed = mine.reduce((s, b) => s + (single ? b.native.amount : b.amount), 0)
  const paid = mine.reduce((s, b) => s + (single ? b.native.paid : b.paid), 0)
  const anyLate = mine.some((b) => b.overdue)

  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-[0.9rem] font-semibold text-mute hover:text-ink">
        <CaretLeft size={14} weight="bold" />Clients
      </Link>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.9rem] leading-tight font-semibold md:text-[2.25rem]">{c.name}</h1>
          <p className="mt-1 text-mute">
            {BILLING_LABEL[c.billing_type]}
            {retainer && `, ${moneyIn(retainer.amount, currencyOfClient(id))} a month, due on day ${retainer.billing_day}`}
            {c.currency && `, billed in ${c.currency}`}
            {c.status !== 'active' && `, ${c.status}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5"><span className="tag tag-paid">{PIPELINE_STAGES.find((s) => s.id === c.pipeline_stage)?.label}</span><span className="tag">Source: {CLIENT_SOURCES.find((s) => s.id === c.source)?.label}</span></div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.93rem]">
            {c.contact_name && <span className="font-semibold">{c.contact_name}</span>}
            {c.email && <a className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline" href={`mailto:${c.email}`}><EnvelopeSimple size={16} />{c.email}</a>}
            {c.phone && <a className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline" href={`tel:${c.phone.replace(/\s/g, '')}`}><Phone size={16} />{c.phone}</a>}
          </div>
        </div>
        {isOwner && <button className="btn" onClick={() => open({ kind: 'client', id })}><PencilSimple size={16} />Edit client</button>}
      </header>

      {c.notes && <p className="mb-7 max-w-[70ch] rounded-[0.7rem] border-l-[3px] border-gold bg-surface px-4 py-3 whitespace-pre-wrap">{c.notes}</p>}

      <div className="grid gap-8 lg:grid-cols-2">
        <Block title="Work" action="Add work" onAdd={() => open({ kind: 'task', clientId: id })}>
          {work.length === 0 ? <Empty title="No work for this client yet" /> : (
            <ul className="panel divide-y divide-line">
              {openWork.map((t) => <WorkRow key={t.id} task={t} showClient={false} />)}
              {doneWork.map((t) => <WorkRow key={t.id} task={t} showClient={false} />)}
            </ul>
          )}
        </Block>
        <Block title="Follow-ups" action="Add follow-up" onAdd={() => open({ kind: 'followup', clientId: id })}>
          {follow.length === 0 ? <Empty title="No follow-ups planned" /> : (
            <ul className="panel divide-y divide-line">{follow.slice(0, 8).map((f) => <FollowRow key={f.id} item={f} showClient={false} />)}</ul>
          )}
        </Block>
      </div>

      {isOwner && (
        <div className="mt-8">
          <Block title="Invoices and payments" action="Add invoice" onAdd={() => open({ kind: 'invoice', clientId: id })}>
            {mine.length === 0 ? <Empty title="Nothing billed yet" /> : (
              <>
                <div className="mb-3 max-w-xl">
                  <PayBar bill={{ amount: billed, paid, remaining: billed - paid, overdue: anyLate }} />
                  <p className="mt-1.5 text-[0.93rem]">
                    <span className="font-semibold text-paid">{total(paid)}</span> received of {total(billed)} billed in total.{' '}
                    {billed - paid > 0.005 && <span className={`font-semibold ${anyLate ? 'text-late' : ''}`}>{total(billed - paid)} remaining.</span>}
                  </p>
                </div>
                <ul className="panel divide-y divide-line">{mine.map((b) => <BillRow key={b.id} bill={b} showClient={false} />)}</ul>
              </>
            )}
          </Block>
        </div>
      )}
    </>
  )
}

function Block({ title, action, onAdd, children }: { title: string; action: string; onAdd(): void; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button className="btn btn-sm" onClick={onAdd}><Plus size={14} weight="bold" />{action}</button>
      </div>
      {children}
    </section>
  )
}
