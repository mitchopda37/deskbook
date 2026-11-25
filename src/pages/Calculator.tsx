import { useMemo, useState } from 'react'
import { Copy, Plus } from '@phosphor-icons/react'
import { useData, useSheet, useToast } from '../lib/store'
import { splitAdvance } from '../lib/assignments'
import { CURRENCIES, currencyLabel } from '../lib/types'
import { Field, PageHead } from '../ui/kit'

type Pricing = 'fixed' | 'words' | 'pages'
const round2 = (n: number) => Math.round(n * 100) / 100
const WORDS_PER_PAGE = 250

/**
 * A standalone calculator for quoting a student: price from words or pages if needed, rush fee,
 * discount, then how much to ask up front and what is left for delivery, in instalments if wanted.
 */
export default function Calculator() {
  const { currency: base, moneyIn, money, rateFor, assignments } = useData()
  const { open } = useSheet()
  const toast = useToast()
  const lastCurrency = [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((a) => a.priced)?.currency

  const [cur, setCur] = useState(lastCurrency ?? base)
  const [pricing, setPricing] = useState<Pricing>('fixed')
  const [price, setPrice] = useState('400')
  const [words, setWords] = useState('2000')
  const [rate, setRate] = useState('150')
  const [rush, setRush] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [advMode, setAdvMode] = useState<'percent' | 'amount'>('percent')
  const [advPercent, setAdvPercent] = useState('50')
  const [advAmount, setAdvAmount] = useState('')
  const [received, setReceived] = useState('')
  const [parts, setParts] = useState(1)

  const fmt = (n: number) => moneyIn(n, cur)
  const r = useMemo(() => {
    const w = Math.max(0, Number(words) || 0)
    const unitRate = Math.max(0, Number(rate) || 0)
    const baseFee = pricing === 'fixed' ? Math.max(0, Number(price) || 0)
      : pricing === 'words' ? (w / 1000) * unitRate
      : Math.ceil(w / WORDS_PER_PAGE) * unitRate
    const rushFee = baseFee * (Math.max(0, Number(rush) || 0) / 100)
    const discountFee = (baseFee + rushFee) * (Math.min(100, Math.max(0, Number(discount) || 0)) / 100)
    const total = round2(baseFee + rushFee - discountFee)
    const split = splitAdvance(total, advMode === 'percent' ? { percent: Number(advPercent) || 0 } : { amount: Number(advAmount) || 0 })
    const got = Math.min(total, Math.max(0, Number(received) || 0))
    const stillDue = round2(total - got)
    const advanceLeft = round2(Math.max(0, split.advance - got))
    // Instalments for what is left after the advance; the last one absorbs rounding.
    const n = Math.max(1, parts)
    const each = Math.floor((split.remaining / n) * 100) / 100
    const instalments = Array.from({ length: n }, (_, i) => (i === n - 1 ? round2(split.remaining - each * (n - 1)) : each))
    return { baseFee: round2(baseFee), rushFee: round2(rushFee), discountFee: round2(discountFee), total, ...split, got, stillDue, advanceLeft, instalments, pages: Math.ceil(w / WORDS_PER_PAGE), words: w }
  }, [pricing, price, words, rate, rush, discount, advMode, advPercent, advAmount, received, parts])

  const fx = rateFor(cur)
  const summary = [
    `Total: ${fmt(r.total)}`,
    `Advance to start${r.percent ? ` (${r.percent}%)` : ''}: ${fmt(r.advance)}`,
    r.instalments.length > 1
      ? `Remaining ${fmt(r.remaining)} in ${r.instalments.length} payments: ${r.instalments.map(fmt).join(' + ')}`
      : `Remaining on delivery: ${fmt(r.remaining)}`,
    ...(r.got > 0 ? [`Received so far: ${fmt(r.got)}. Still due: ${fmt(r.stillDue)}`] : []),
  ].join('\n')
  const copy = () => navigator.clipboard.writeText(summary).then(() => toast('Quote copied. Paste it to the student.'), () => toast('Copy blocked by the browser', 'error'))

  const chip = (active: boolean) => `btn btn-sm ${active ? 'border-ink bg-sunk' : ''}`

  return (
    <>
      <PageHead title="Payment calculator" sub="Work out a quote, the advance to ask for and what is left on delivery. Nothing is saved until you create the assignment." />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <section className="panel space-y-4 p-5">
            <h2 className="text-lg font-semibold">1. Price</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
              <div>
                <span className="field-label">Priced by</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priced by">
                  {([['fixed', 'Fixed price'], ['words', 'Per 1,000 words'], ['pages', 'Per page']] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={pricing === id} className={chip(pricing === id)} onClick={() => setPricing(id)}>{label}</button>
                  ))}
                </div>
              </div>
              <Field label="Currency">
                <select className="input" value={cur} onChange={(e) => setCur(e.target.value)}>
                  {[...new Set([cur, base, ...CURRENCIES])].map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
                </select>
              </Field>
            </div>
            {pricing === 'fixed' ? (
              <Field label={`Price (${cur})`}><input className="input" type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Words" hint={pricing === 'pages' ? `${r.pages} ${r.pages === 1 ? 'page' : 'pages'} at ${WORDS_PER_PAGE} words each` : undefined}>
                  <input className="input" type="number" min="0" step="1" inputMode="numeric" value={words} onChange={(e) => setWords(e.target.value)} />
                </Field>
                <Field label={pricing === 'words' ? `Rate per 1,000 words (${cur})` : `Rate per page (${cur})`}>
                  <input className="input" type="number" min="0" step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rush fee %" hint="For short deadlines."><input className="input" type="number" min="0" step="any" value={rush} onChange={(e) => setRush(e.target.value)} /></Field>
              <Field label="Discount %" hint="Returning student, bulk order."><input className="input" type="number" min="0" max="100" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">2. Advance</h2>
              <div className="inline-flex rounded-[0.5rem] bg-sunk p-0.5 text-[0.85rem] font-semibold" role="tablist" aria-label="Advance as">
                {(['percent', 'amount'] as const).map((mode) => (
                  <button key={mode} type="button" role="tab" aria-selected={advMode === mode}
                    onClick={() => { if (mode === 'amount') setAdvAmount(String(r.advance)); else if (r.total > 0) setAdvPercent(String(r.percent)); setAdvMode(mode) }}
                    className={`rounded-[0.4rem] px-3 py-1 ${advMode === mode ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_27_59/0.12)]' : 'text-mute'}`}>
                    {mode === 'percent' ? 'Percent' : 'Amount'}
                  </button>
                ))}
              </div>
            </div>
            {advMode === 'percent' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 25, 30, 40, 50, 60, 75, 100].map((p) => <button key={p} type="button" className={chip(Number(advPercent) === p)} aria-pressed={Number(advPercent) === p} onClick={() => setAdvPercent(String(p))}>{p}%</button>)}
                <input className="input h-8 w-24" type="number" min="0" max="100" step="any" aria-label="Advance percent" value={advPercent} onChange={(e) => setAdvPercent(e.target.value)} />
              </div>
            ) : (
              <Field label={`Advance (${cur})`}><input className="input" type="number" min="0" max={r.total} step="any" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} /></Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Split the rest into">
                <select className="input" value={parts} onChange={(e) => setParts(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? 'One payment on delivery' : `${n} payments`}</option>)}
                </select>
              </Field>
              <Field label={`Already received (${cur})`} hint="Optional. Shows what is still due."><input className="input" type="number" min="0" step="any" placeholder="0" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <aside className="panel overflow-hidden lg:sticky lg:top-6" aria-live="polite">
          <div className="p-5">
            <p className="text-[0.87rem] text-mute">Total to charge</p>
            <p className="font-display text-[2.2rem] leading-tight font-semibold">{fmt(r.total)}</p>
            {cur !== base && r.total > 0 && <p className="text-[0.85rem] text-mute">{fx ? `About ${money(r.total * fx)}` : `Add a ${cur} rate in Settings to see this in ${base}`}</p>}
            <dl className="mt-4 space-y-1.5 text-[0.92rem]">
              <Line label={pricing === 'fixed' ? 'Price' : pricing === 'words' ? `${r.words.toLocaleString()} words` : `${r.pages} pages`} value={fmt(r.baseFee)} />
              {r.rushFee > 0 && <Line label={`Rush fee (${rush}%)`} value={`+ ${fmt(r.rushFee)}`} />}
              {r.discountFee > 0 && <Line label={`Discount (${discount}%)`} value={`− ${fmt(r.discountFee)}`} />}
            </dl>
          </div>

          <div className="border-t border-line p-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
              <div className="bg-paid transition-[width] duration-300" style={{ width: `${r.total > 0 ? (r.advance / r.total) * 100 : 0}%` }} />
              <div className="hatch-due flex-1" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><p className="text-[0.85rem] text-mute">Advance{r.percent ? ` · ${r.percent}%` : ''}</p><p className="text-xl font-semibold text-paid">{fmt(r.advance)}</p></div>
              <div className="text-right"><p className="text-[0.85rem] text-mute">Remaining</p><p className="text-xl font-semibold text-due">{fmt(r.remaining)}</p></div>
            </div>
            {r.instalments.length > 1 && (
              <ol className="mt-3 space-y-1 rounded-[0.6rem] bg-sunk p-3 text-[0.9rem]">
                {r.instalments.map((v, i) => <li key={i} className="flex justify-between"><span className="text-mute">Payment {i + 1}</span><span className="font-semibold">{fmt(v)}</span></li>)}
              </ol>
            )}
            {r.got > 0 && (
              <div className="mt-3 rounded-[0.6rem] border border-line p-3 text-[0.9rem]">
                <Line label="Received so far" value={fmt(r.got)} />
                <Line label="Still due" value={fmt(r.stillDue)} strong />
                {r.advanceLeft > 0 && <p className="mt-1 font-semibold text-due">{fmt(r.advanceLeft)} of the advance is still missing.</p>}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-line p-5">
            <button className="btn btn-primary" disabled={r.total <= 0} onClick={() => open({ kind: 'assignment', prefill: { amount: r.total, currency: cur, advance: r.advance, words: pricing === 'fixed' ? undefined : r.words } })}>
              <Plus size={16} weight="bold" />Create assignment with these numbers
            </button>
            <button className="btn" disabled={r.total <= 0} onClick={copy}><Copy size={16} />Copy quote for the student</button>
          </div>
        </aside>
      </div>
    </>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between gap-3"><dt className="text-mute">{label}</dt><dd className={strong ? 'font-semibold' : ''}>{value}</dd></div>
}
