import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartBar, DownloadSimple, Plus, Repeat } from '@phosphor-icons/react'
import { thisMonth, useActions, useData, useSheet } from '../lib/store'
import { addDays, dueText, monthKey, monthLabel, today } from '../lib/dates'
import type { Bill } from '../lib/types'
import { Empty, PageHead, PayBar, PayTag, RateNotice, Segmented } from '../ui/kit'

type Filter = 'open' | 'late' | 'partial' | 'paid' | 'all'

export default function Money() {
  const { bills, clients, retainers, payments, money, clientName, currencyOfClient, retainerBase, currency, missingRates } = useData()
  const { add } = useActions()
  const { open } = useSheet()
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState(false)
  const month = thisMonth()

  const match: Record<Filter, (b: Bill) => boolean> = {
    open: (b) => b.remaining > 0, late: (b) => b.overdue, partial: (b) => b.state === 'partial',
    paid: (b) => b.state === 'paid', all: () => true,
  }
  const rows = bills.filter(match[filter]).sort((a, b) =>
    filter === 'paid' || filter === 'all' ? b.issued_on.localeCompare(a.issued_on) : a.due_on.localeCompare(b.due_on))

  const remaining = bills.reduce((s, b) => s + b.remaining, 0)
  const overdue = bills.filter((b) => b.overdue).reduce((s, b) => s + b.remaining, 0)
  const received = payments.filter((p) => monthKey(p.paid_on) === month).reduce((s, p) => s + p.amount, 0)

  // Retainer clients that have no invoice for this month yet
  const unbilled = retainers.filter((r) => {
    const c = clients.find((x) => x.id === r.client_id)
    return c?.status === 'active' && c.billing_type === 'retainer' && !bills.some((b) => b.client_id === r.client_id && b.period === month)
  })
  const billRetainers = async () => {
    setBusy(true)
    const t = today()
    for (const r of unbilled) {
      const due = `${month}-${String(r.billing_day).padStart(2, '0')}`
      await add('invoices', {
        client_id: r.client_id, title: `${monthLabel(month, true)} retainer`, amount: r.amount,
        currency: currencyOfClient(r.client_id), issued_on: t, due_on: due < t ? addDays(t, 7) : due, period: month,
      })
    }
    setBusy(false)
  }

  const exportCsv = () => {
    const head = ['Client', 'Invoice', 'Billed on', 'Due on', 'Currency', 'Amount', 'Received', 'Remaining', `Remaining (${currency})`, 'Status']
    const lines = bills.map((b) => [clientName(b.client_id), b.title, b.issued_on, b.due_on, b.currency, b.native.amount, b.native.paid, b.native.remaining, b.remaining,
      b.state === 'paid' ? 'Paid' : b.overdue ? 'Overdue' : b.state === 'partial' ? 'Part paid' : 'Not paid'])
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `invoices-${today()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <PageHead title="Invoices"
        sub={<><span className="font-semibold text-ink">{money(remaining)}</span> still to come{overdue > 0 && <>, of which <span className="font-semibold text-late">{money(overdue)}</span> is overdue</>}. {money(received)} received in {monthLabel(month, true)}.</>}>
        <Link to="/reports" className="btn"><ChartBar size={16} />Reports</Link>
        <button className="btn" onClick={exportCsv} disabled={bills.length === 0}><DownloadSimple size={16} />Export CSV</button>
        <button className="btn btn-primary" onClick={() => open({ kind: 'invoice' })}><Plus size={16} weight="bold" />Add invoice</button>
      </PageHead>

      <RateNotice missing={missingRates} base={currency} canEdit />

      {unbilled.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[0.9rem] border border-gold bg-[color-mix(in_srgb,var(--gold)_14%,var(--surface))] px-4 py-3">
          <Repeat size={20} className="shrink-0 text-due" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{unbilled.length} retainer {unbilled.length === 1 ? 'client has' : 'clients have'} no {monthLabel(month, true)} invoice yet.</span>{' '}
            <span className="text-mute">{unbilled.map((r) => clientName(r.client_id)).join(', ')}</span>
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={billRetainers}>
            Bill {monthLabel(month, true)} retainers ({money(unbilled.reduce((s, r) => s + retainerBase(r), 0))})
          </button>
        </div>
      )}

      <div className="mb-4">
        <Segmented<Filter> label="Filter invoices" value={filter} onChange={setFilter} options={[
          { id: 'open', label: 'Unpaid', count: bills.filter(match.open).length },
          { id: 'late', label: 'Overdue', count: bills.filter(match.late).length },
          { id: 'partial', label: 'Part paid', count: bills.filter(match.partial).length },
          { id: 'paid', label: 'Paid', count: bills.filter(match.paid).length },
          { id: 'all', label: 'All' },
        ]} />
      </div>

      {rows.length === 0 ? (
        <Empty title={bills.length === 0 ? 'No invoices yet' : 'Nothing in this list'}>
          {bills.length === 0 ? 'Add an invoice, then record payments against it as they arrive. Part payments are tracked automatically.' : filter === 'open' ? 'Everyone has paid in full.' : undefined}
        </Empty>
      ) : (
        <ul className="panel divide-y divide-line">{rows.map((b) => <BillRow key={b.id} bill={b} />)}</ul>
      )}
    </>
  )
}

export function BillRow({ bill, showClient = true }: { bill: Bill; showClient?: boolean }) {
  const { clientName, money, moneyIn, currency } = useData()
  const { open } = useSheet()
  const show = () => open({ kind: 'invoice', id: bill.id })
  const fmt = (n: number) => moneyIn(n, bill.currency)
  const foreign = bill.currency !== currency
  return (
    <li className="row-link grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 px-4 py-3.5 first:rounded-t-[0.9rem] last:rounded-b-[0.9rem] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_7.5rem_9.5rem]"
      onClick={show} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && show()} tabIndex={0}>
      <div className="min-w-0">
        <p className="truncate font-semibold">{showClient ? clientName(bill.client_id) : bill.title}</p>
        <p className="truncate text-[0.87rem] text-mute">{showClient ? `${bill.title}, ` : ''}{dueText(bill.due_on)}</p>
      </div>
      <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
        <PayBar bill={bill} />
        <p className="mt-1.5 flex justify-between gap-3 text-[0.87rem]">
          <span><span className="font-semibold text-paid">{fmt(bill.native.paid)}</span> <span className="text-mute">received</span></span>
          <span>{bill.native.remaining > 0
            ? <><span className={`font-semibold ${bill.overdue ? 'text-late' : ''}`}>{fmt(bill.native.remaining)}</span> <span className="text-mute">remaining</span></>
            : <span className="text-mute">of {fmt(bill.native.amount)}</span>}</span>
        </p>
        {foreign && <p className="mt-0.5 text-right text-[0.78rem] text-mute">{bill.currency} invoice · about {money(bill.remaining > 0 ? bill.remaining : bill.amount)}</p>}
      </div>
      <div className="justify-self-end md:justify-self-start"><PayTag bill={bill} /></div>
      <div className="order-4 col-span-2 md:order-none md:col-span-1 md:justify-self-end">
        {bill.remaining > 0 && (
          <button className="btn btn-sm w-full md:w-auto" onClick={(e) => { e.stopPropagation(); open({ kind: 'payment', invoiceId: bill.id }) }}>
            Record payment
          </button>
        )}
      </div>
    </li>
  )
}
