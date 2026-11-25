import { useEffect, useState, type FormEvent } from 'react'
import { Buildings, Moon, Palette, SignOut, Sun } from '@phosphor-icons/react'
import { useActions, useAuth, useData } from '../lib/store'
import { isDemo } from '../lib/backend'
import { useTheme } from '../ui/Shell'
import { Field, PageHead } from '../ui/kit'
import { CURRENCIES, currencyLabel } from '../lib/types'

export default function Settings() {
  const { me, activeWorkspace, workspaceName, currency, isOwner, isPlatformOwner, money, currenciesInUse } = useData()
  const { signOut, email } = useAuth()
  const { patch } = useActions()
  const { theme, toggle } = useTheme()
  const [name, setName] = useState(me?.full_name ?? '')
  const [ws, setWs] = useState({ name: activeWorkspace?.name ?? workspaceName, brand_name: activeWorkspace?.brand_name ?? workspaceName, slug: activeWorkspace?.slug ?? '', currency, accent_color: activeWorkspace?.accent_color ?? '#3159c9', logo_url: activeWorkspace?.logo_url ?? '' })

  const ratesToText = (r: Record<string, number> | undefined) => Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, String(v)]))
  const [rates, setRates] = useState<Record<string, string>>(ratesToText(activeWorkspace?.fx_rates))
  const [extra, setExtra] = useState('')

  useEffect(() => {
    if (activeWorkspace) {
      setWs({ name: activeWorkspace.name, brand_name: activeWorkspace.brand_name, slug: activeWorkspace.slug, currency: activeWorkspace.currency, accent_color: activeWorkspace.accent_color, logo_url: activeWorkspace.logo_url })
      setRates(ratesToText(activeWorkspace.fx_rates))
    }
  }, [activeWorkspace])

  // Every foreign currency the workspace uses, plus any the owner added by hand.
  const rateCurrencies = [...new Set([...currenciesInUse, ...Object.keys(rates)])].filter((c) => c !== ws.currency).sort()
  const baseChanged = ws.currency !== currency

  const saveMe = (e: FormEvent) => { e.preventDefault(); if (me) patch('profiles', me.id, { full_name: name.trim() }, 'Name saved') }
  const saveWs = (e: FormEvent) => {
    e.preventDefault()
    if (!activeWorkspace) return
    const fx_rates = Object.fromEntries(
      Object.entries(rates).map(([k, v]) => [k, Number(v)] as const).filter(([k, v]) => k !== ws.currency && Number.isFinite(v) && v > 0),
    )
    const editable = isPlatformOwner
      ? { ...ws, name: ws.name.trim(), brand_name: ws.brand_name.trim() }
      : { name: ws.name.trim(), currency: ws.currency }
    patch('workspaces', activeWorkspace.id, { ...editable, fx_rates }, 'Workspace settings saved')
  }

  return (
    <>
      <PageHead title="Settings" />
      <div className="max-w-3xl space-y-9">
        <form onSubmit={saveMe} className="space-y-4">
          <h2 className="text-xl font-semibold">You</h2>
          <Field label="Your name" hint={email ? `Signed in as ${email}` : undefined}>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn btn-primary">Save name</button>
        </form>

        {isOwner && (
          <form onSubmit={saveWs} className="space-y-4 border-t border-line pt-8">
            <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute"><Buildings size={18} /></span><div><h2 className="text-xl font-semibold">Workspace</h2><p className="text-[0.87rem] text-mute">Internal details and billing defaults.</p></div></div>
            <Field label="Business name" hint="Shown at the top of the menu for everyone on the team.">
              <input className="input" required value={ws.name} onChange={(e) => setWs({ ...ws, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">{isPlatformOwner && <Field label="Workspace URL"><div className="flex"><span className="grid place-items-center rounded-l-[0.5rem] border border-r-0 border-line bg-sunk px-2.5 text-mute">/</span><input className="input rounded-l-none" required pattern="[a-z0-9\-]+" value={ws.slug} onChange={(e) => setWs({ ...ws, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></div></Field>}
            <Field label="Main currency" hint={`Totals and reports are shown in this, e.g. ${new Intl.NumberFormat(undefined, { style: 'currency', currency: ws.currency, maximumFractionDigits: 0 }).format(125000)}. Each client and invoice can use its own currency. Changing this does not convert amounts (currently ${money(125000)}).`}>
              <select className="input" value={ws.currency} onChange={(e) => setWs({ ...ws, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
              </select>
            </Field></div>
            <fieldset className="rounded-[0.8rem] border border-line p-4">
              <legend className="px-1 font-semibold">Exchange rates</legend>
              <p className="mb-3 text-[0.87rem] text-mute">Used to add up invoices in other currencies. Enter what one unit is worth in {ws.currency}. Each invoice and payment keeps its original amount.</p>
              {baseChanged && rateCurrencies.length > 0 && <p className="mb-3 rounded-[0.5rem] bg-[color-mix(in_srgb,var(--gold)_16%,transparent)] px-3 py-2 text-[0.87rem] font-medium">You changed the main currency. Update every rate below so it is in {ws.currency}.</p>}
              {rateCurrencies.length === 0 && <p className="text-[0.9rem] text-mute">Everything is billed in {ws.currency}. Pick another currency for a client or invoice, or add one here.</p>}
              <ul className="space-y-2">
                {rateCurrencies.map((cur) => (
                  <li key={cur} className="flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 font-semibold">1 {cur}</span>
                    <span className="text-mute">=</span>
                    <input className={`input w-32 ${!(Number(rates[cur]) > 0) ? 'border-late' : ''}`} type="number" min="0" step="any" inputMode="decimal" placeholder="Rate" aria-label={`Value of 1 ${cur} in ${ws.currency}`}
                      value={rates[cur] ?? ''} onChange={(e) => setRates({ ...rates, [cur]: e.target.value })} />
                    <span className="text-mute">{ws.currency}</span>
                    {!(Number(rates[cur]) > 0) && <span className="text-[0.82rem] font-semibold text-late">Needed for totals</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <select className="input w-auto" aria-label="Add a currency" value={extra} onChange={(e) => setExtra(e.target.value)}>
                  <option value="">Add a currency…</option>
                  {CURRENCIES.filter((c) => c !== ws.currency && !rateCurrencies.includes(c)).map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
                </select>
                <button type="button" className="btn" disabled={!extra} onClick={() => { setRates({ ...rates, [extra]: '' }); setExtra('') }}>Add</button>
              </div>
            </fieldset>
            {isPlatformOwner && <div className="border-t border-line pt-6"><div className="mb-4 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute"><Palette size={18} /></span><div><h3 className="font-display text-lg font-semibold">White-label identity</h3><p className="text-[0.87rem] text-mute">What this client's users see when they sign in.</p></div></div><div className="space-y-4"><Field label="Brand name"><input className="input" required value={ws.brand_name} onChange={(e) => setWs({ ...ws, brand_name: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-[8rem_1fr]"><Field label="Accent color"><input type="color" className="input h-11 p-1.5" value={ws.accent_color} onChange={(e) => setWs({ ...ws, accent_color: e.target.value })} /></Field><Field label="Logo URL" hint="Optional square logo shown in navigation."><input className="input" type="url" placeholder="https://…" value={ws.logo_url} onChange={(e) => setWs({ ...ws, logo_url: e.target.value })} /></Field></div></div></div>}
            <button className="btn btn-primary">Save settings</button>
          </form>
        )}

        <div className="space-y-4 border-t border-line pt-8">
          <h2 className="text-xl font-semibold">This device</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={toggle}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}Switch to {theme === 'dark' ? 'light' : 'dark'} theme
            </button>
            <button className="btn" onClick={signOut}><SignOut size={16} />Sign out</button>
          </div>
        </div>
      </div>
    </>
  )
}
