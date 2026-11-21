import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CaretLeft, CaretRight, DownloadSimple, Printer } from '@phosphor-icons/react'
import { useData, useSheet } from '../lib/store'
import {
  addDays, addMonths, daysBetween, fullDate, monthEnd, monthKey, monthStart, monthYear, monthsBetween, today,
} from '../lib/dates'
import { AnimatedNumber, Empty, PageHead, PayBar, RateNotice, Segmented } from '../ui/kit'

type Preset = 'month' | 'last' | 'quarter' | 'year' | 'custom'
type View = 'months' | 'days' | 'clients' | 'methods'

const presetRange = (p: Exclude<Preset, 'custom'>): [string, string] => {
  const m = monthKey(today())
  if (p === 'month') return [monthStart(m), monthEnd(m)]
  if (p === 'last') return [monthStart(addMonths(m, -1)), monthEnd(addMonths(m, -1))]
  if (p === 'quarter') return [monthStart(addMonths(m, -2)), monthEnd(m)]
  return [`${m.slice(0, 4)}-01-01`, `${m.slice(0, 4)}-12-31`]
}

export default function Reports() {
  const { bills, payments, clientName, money, moneyIn, currency, currenciesInUse, missingRates, workspaceName } = useData()
  const { open } = useSheet()
  const [preset, setPreset] = useState<Preset>('month')
  const [[from, to], setRange] = useState<[string, string]>(presetRange('month'))
  const [view, setView] = useState<View>('months')

  const choose = (p: Preset) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)) }
  const setDates = (f: string, t: string) => { if (!f || !t) return; setPreset('custom'); setRange(f <= t ? [f, t] : [t, f]) }
  // Step back or forward by the length of the current range. Whole months stay whole months.
  const wholeMonths = from === monthStart(monthKey(from)) && to === monthEnd(monthKey(to))
  const step = (dir: 1 | -1) => {
    setPreset('custom')
    if (wholeMonths) {
      const n = monthsBetween(from, to).length * dir
      setRange([monthStart(addMonths(monthKey(from), n)), monthEnd(addMonths(monthKey(to), n))])
    } else {
      const n = (daysBetween(from, to) + 1) * dir
      setRange([addDays(from, n), addDays(to, n)])
    }
  }

  const r = useMemo(() => {
    const billById = new Map(bills.map((b) => [b.id, b]))
    const inRange = (d: string) => d >= from && d <= to
    const paid = payments.filter((p) => inRange(p.paid_on)).map((p) => {
      const bill = billById.get(p.invoice_id)
      return { ...p, clientId: bill?.client_id ?? '', client: bill ? clientName(bill.client_id) : 'Unknown client', invoice: bill?.title ?? '' }
    }).sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at))
    const issued = bills.filter((b) => inRange(b.issued_on))
    const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)

    const months = monthsBetween(from, to).map((m) => {
      const inv = issued.filter((b) => monthKey(b.issued_on) === m)
      return { key: m, billed: sum(inv, (b) => b.amount), received: sum(paid.filter((p) => monthKey(p.paid_on) === m), (p) => p.amount), unpaid: sum(inv, (b) => b.remaining) }
    }).reverse()

    const dayKeys = [...new Set(paid.map((p) => p.paid_on))]
    const days = dayKeys.map((d) => { const list = paid.filter((p) => p.paid_on === d); return { key: d, total: sum(list, (p) => p.amount), list } })

    const clientIds = [...new Set([...paid.map((p) => p.clientId), ...issued.map((b) => b.client_id)])]
    const clients = clientIds.map((id) => {
      const inv = issued.filter((b) => b.client_id === id)
      return { key: id, name: clientName(id), billed: sum(inv, (b) => b.amount), received: sum(paid.filter((p) => p.clientId === id), (p) => p.amount), unpaid: sum(inv, (b) => b.remaining) }
    }).sort((a, b) => b.received - a.received || b.billed - a.billed)

    const methodNames = [...new Set(paid.map((p) => p.method || 'Not recorded'))]
    const methods = methodNames.map((m) => { const list = paid.filter((p) => (p.method || 'Not recorded') === m); return { key: m, count: list.length, received: sum(list, (p) => p.amount) } })
      .sort((a, b) => b.received - a.received)

    const billed = sum(issued, (b) => b.amount)
    return { paid, issued, months, days, clients, methods, billed, received: sum(paid, (p) => p.amount), unpaid: sum(issued, (b) => b.remaining), collectedOnIssued: sum(issued, (b) => b.paid) }
  }, [bills, payments, from, to, clientName])

  const rangeLabel = wholeMonths && monthKey(from) === monthKey(to) ? monthYear(monthKey(from)) : `${fullDate(from)} to ${fullDate(to)}`

  const exportCsv = () => {
    const table: (string | number)[][] = {
      months: [['Month', 'Billed', 'Received', 'Still unpaid from that month'], ...r.months.map((m) => [monthYear(m.key), m.billed, m.received, m.unpaid])],
      days: [['Date', 'Client', 'Invoice', 'Method', 'Note', 'Currency', 'Amount', `Amount (${currency})`], ...r.paid.map((p) => [p.paid_on, p.client, p.invoice, p.method, p.note, p.currency, p.native_amount, p.amount])],
      clients: [['Client', 'Billed', 'Received', 'Still unpaid'], ...r.clients.map((c) => [c.name, c.billed, c.received, c.unpaid])],
      methods: [['Method', 'Payments', 'Received'], ...r.methods.map((m) => [m.key, m.count, m.received])],
    }[view]
    const csv = table.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `payments-${view}-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const top = (list: { received: number }[]) => Math.max(1, ...list.map((x) => x.received))
  const Bar = ({ value, max }: { value: number; max: number }) => (
    <div className="h-2.5 rounded-[3px] bg-sunk" aria-hidden="true">
      {value > 0 && <motion.div className="h-full rounded-[3px] bg-paid" initial={{ width: 0 }} animate={{ width: `${Math.max(2, (value / max) * 100)}%` }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }} />}
    </div>
  )
  const head = 'hidden border-b border-line px-4 py-2.5 text-[0.87rem] font-medium text-mute md:grid'
  const row = 'grid items-center gap-x-5 gap-y-1.5 px-4 py-3'

  return (
    <>
      <PageHead title="Reports" sub={`What came in, when, from whom. Pick any month or any two dates.${currenciesInUse.length > 1 ? ` Totals are in ${currency}, converted at the rates in Settings.` : ''}`}>
        <button className="btn print:hidden" onClick={() => window.print()}><Printer size={16} />Print or save PDF</button>
        <button className="btn print:hidden" onClick={exportCsv} disabled={r.paid.length + r.issued.length === 0}><DownloadSimple size={16} />Export CSV</button>
      </PageHead>

      <RateNotice missing={missingRates} base={currency} canEdit />

      {/* period */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2.5 print:hidden">
        <Segmented<Preset> label="Period" value={preset} onChange={choose} options={[
          { id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'quarter', label: 'Last 3 months' },
          { id: 'year', label: 'This year' }, { id: 'custom', label: 'Custom' },
        ]} />
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
          <button className="btn shrink-0 max-sm:order-2 max-sm:flex-1 sm:w-[2.4rem] sm:px-0" onClick={() => step(-1)} aria-label="Earlier period">
            <CaretLeft size={16} weight="bold" /><span className="sm:hidden">Earlier</span>
          </button>
          <div className="flex w-full items-center gap-1.5 max-sm:order-1 sm:w-auto">
            <input className="input min-w-0 flex-1 sm:w-[9.8rem] sm:flex-none" type="date" aria-label="From date" value={from} max={to} onChange={(e) => setDates(e.target.value, to)} />
            <span className="text-mute">to</span>
            <input className="input min-w-0 flex-1 sm:w-[9.8rem] sm:flex-none" type="date" aria-label="To date" value={to} min={from} onChange={(e) => setDates(from, e.target.value)} />
          </div>
          <button className="btn shrink-0 max-sm:order-3 max-sm:flex-1 sm:w-[2.4rem] sm:px-0" onClick={() => step(1)} aria-label="Later period">
            <span className="sm:hidden">Later</span><CaretRight size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* summary */}
      <section className="panel mb-6 overflow-hidden">
        <div className="px-5 pt-5 md:px-7 md:pt-6">
          <p className="hidden text-[0.9rem] text-mute print:block">{workspaceName}, payment report</p>
          <p className="text-mute">{rangeLabel}</p>
          <p className="mt-0.5 font-display text-[1.6rem] leading-tight font-semibold md:text-[2rem]">
            <span className="text-paid">{money(r.received)}</span> received in {r.paid.length} {r.paid.length === 1 ? 'payment' : 'payments'}
          </p>
          {r.billed > 0 && (
            <div className="mt-4 max-w-2xl">
              <PayBar bill={{ amount: r.billed, paid: r.collectedOnIssued, remaining: r.unpaid, overdue: r.issued.some((b) => b.overdue) }} />
              <p className="mt-1.5 text-[0.93rem] text-mute">
                Of the {money(r.billed)} billed in this period, {money(r.collectedOnIssued)} has been collected so far ({Math.round((r.collectedOnIssued / r.billed) * 100)}%).
              </p>
            </div>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
          {[
            ['Received', r.received, 'text-paid'],
            ['Billed', r.billed, ''],
            ['Still unpaid from this period', r.unpaid, r.unpaid > 0 ? 'text-due' : ''],
            ['Invoices sent', r.issued.length, ''],
          ].map(([label, value, tone]) => (
            <div key={label} className="bg-surface px-5 py-4 md:px-7">
              <p className="text-[0.87rem] text-mute">{label}</p>
              <p className={`font-display text-[1.4rem] font-semibold ${tone}`}><AnimatedNumber value={value as number} format={label === 'Invoices sent' ? (n) => String(Math.round(n)) : money} /></p>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-4 print:hidden">
        <Segmented<View> label="Break down by" value={view} onChange={setView} options={[
          { id: 'months', label: 'By month' }, { id: 'days', label: 'By date', count: r.days.length },
          { id: 'clients', label: 'By client', count: r.clients.length }, { id: 'methods', label: 'By method' },
        ]} />
      </div>

      {view === 'months' && (
        <div className="panel">
          <div className={`${head} grid-cols-[11rem_1fr_8rem_8rem_8rem]`}>
            <span>Month</span><span /><span className="text-right">Received</span><span className="text-right">Billed</span><span className="text-right">Still unpaid</span>
          </div>
          <ul className="divide-y divide-line">
            {r.months.map((m) => (
              <li key={m.key} className={`${row} grid-cols-[1fr_auto] md:grid-cols-[11rem_1fr_8rem_8rem_8rem]`}>
                <button className="text-left font-semibold underline-offset-2 hover:underline print:no-underline"
                  onClick={() => { setPreset('custom'); setRange([monthStart(m.key), monthEnd(m.key)]); setView('days') }}>
                  {monthYear(m.key)}
                </button>
                <div className="order-3 col-span-2 md:order-none md:col-span-1"><Bar value={m.received} max={top(r.months)} /></div>
                <span className="text-right font-semibold text-paid">{money(m.received)}</span>
                <span className="order-4 text-[0.9rem] text-mute md:order-none md:text-right md:text-[1rem] md:text-ink"><span className="md:hidden">Billed </span>{money(m.billed)}</span>
                <span className={`order-5 text-right text-[0.9rem] md:order-none md:text-[1rem] ${m.unpaid > 0 ? 'font-semibold text-due' : 'text-mute'}`}>
                  <span className="md:hidden">{m.unpaid > 0 ? 'Unpaid ' : ''}</span>{m.unpaid > 0 ? money(m.unpaid) : 'All paid'}
                </span>
              </li>
            ))}
          </ul>
          <div className={`${row} grid-cols-[1fr_auto] border-t-2 border-line font-semibold md:grid-cols-[11rem_1fr_8rem_8rem_8rem]`}>
            <span>Total</span><span className="hidden md:block" />
            <span className="text-right text-paid">{money(r.received)}</span>
            <span className="hidden text-right md:block">{money(r.billed)}</span>
            <span className="hidden text-right md:block">{money(r.unpaid)}</span>
          </div>
        </div>
      )}

      {view === 'days' && (r.days.length === 0
        ? <Empty title="No payments in this period">Try a wider range, or record a payment from Invoices.</Empty>
        : (
          <div className="space-y-4">
            {r.days.map((d) => (
              <section key={d.key} className="panel">
                <div className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2.5">
                  <h2 className="text-[1.05rem] font-semibold">{fullDate(d.key)}</h2>
                  <p className="font-semibold text-paid">{money(d.total)}</p>
                </div>
                <ul className="divide-y divide-line">
                  {d.list.map((p) => (
                    <li key={p.id}>
                      <button className="row-link grid w-full grid-cols-[1fr_auto] items-center gap-x-5 px-4 py-2.5 text-left md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_7rem]"
                        onClick={() => open({ kind: 'invoice', id: p.invoice_id })}>
                        <span className="min-w-0 truncate font-medium">{p.client}</span>
                        <span className="order-3 col-span-2 min-w-0 truncate text-[0.9rem] text-mute md:order-none md:col-span-1">{p.invoice}{p.note && `, ${p.note}`}<span className="md:hidden">{p.method && `, ${p.method}`}</span></span>
                        <span className="hidden text-[0.9rem] text-mute md:block">{p.method || 'Not recorded'}</span>
                        <span className="text-right font-semibold">{p.currency === currency ? money(p.amount) : <>{moneyIn(p.native_amount, p.currency)}<span className="block text-[0.78rem] font-normal text-mute">≈ {money(p.amount)}</span></>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="px-4 text-right font-semibold">Total received <span className="ml-3 text-paid">{money(r.received)}</span></p>
          </div>
        ))}

      {view === 'clients' && (r.clients.length === 0
        ? <Empty title="No client activity in this period" />
        : (
          <div className="panel">
            <div className={`${head} grid-cols-[14rem_1fr_8rem_8rem_8rem]`}>
              <span>Client</span><span /><span className="text-right">Received</span><span className="text-right">Billed</span><span className="text-right">Still unpaid</span>
            </div>
            <ul className="divide-y divide-line">
              {r.clients.map((c) => (
                <li key={c.key} className={`${row} grid-cols-[1fr_auto] md:grid-cols-[14rem_1fr_8rem_8rem_8rem]`}>
                  <span className="min-w-0 truncate font-semibold">{c.name}</span>
                  <div className="order-3 col-span-2 md:order-none md:col-span-1"><Bar value={c.received} max={top(r.clients)} /></div>
                  <span className="text-right font-semibold text-paid">{money(c.received)}</span>
                  <span className="order-4 text-[0.9rem] text-mute md:order-none md:text-right md:text-[1rem] md:text-ink"><span className="md:hidden">Billed </span>{money(c.billed)}</span>
                  <span className={`order-5 text-right text-[0.9rem] md:order-none md:text-[1rem] ${c.unpaid > 0 ? 'font-semibold text-due' : 'text-mute'}`}>
                    <span className="md:hidden">{c.unpaid > 0 ? 'Unpaid ' : ''}</span>{c.unpaid > 0 ? money(c.unpaid) : 'All paid'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {view === 'methods' && (r.methods.length === 0
        ? <Empty title="No payments in this period" />
        : (
          <div className="panel max-w-3xl">
            <ul className="divide-y divide-line">
              {r.methods.map((m) => (
                <li key={m.key} className={`${row} grid-cols-[1fr_auto] md:grid-cols-[11rem_1fr_8rem]`}>
                  <span><span className="font-semibold">{m.key}</span> <span className="text-[0.9rem] text-mute">{m.count} {m.count === 1 ? 'payment' : 'payments'}</span></span>
                  <div className="order-3 col-span-2 md:order-none md:col-span-1"><Bar value={m.received} max={top(r.methods)} /></div>
                  <span className="text-right font-semibold text-paid">{money(m.received)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </>
  )
}
