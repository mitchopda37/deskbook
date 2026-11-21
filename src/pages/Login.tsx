import { useState, type FormEvent } from 'react'
import { CheckCircle, Copy, LockKey, TrendUp } from '@phosphor-icons/react'
import { useAuth } from '../lib/store'
import { authLinkError, isDemo } from '../lib/backend'
import { Field } from '../ui/kit'

// The picture on the left is the product's own payment strip, drawn with sample numbers.
const SAMPLE = [
  { name: 'Harbor Dental', amount: 24, paid: 1, late: false },
  { name: 'Northwind', amount: 18, paid: 0.55, late: false },
  { name: 'Kestrel', amount: 34, paid: 0.5, late: false },
  { name: 'Atlas', amount: 10, paid: 0.25, late: true },
]

export default function Login() {
  const { signIn, signUp, sendReset } = useAuth()
  const inviteToken = new URLSearchParams(location.search).get('invite') ?? ''
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(inviteToken ? 'up' : 'in')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(authLinkError ? `${authLinkError}. Ask your workspace admin to send a new invitation, or reset your password if you already have an account.` : '')
  const [confirmSent, setConfirmSent] = useState<false | 'confirm' | 'reset'>(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') await signIn(f.email, f.password)
      else if (mode === 'reset') { await sendReset(f.email); setConfirmSent('reset') }
      else if ((await signUp(f.name, f.email, f.password, inviteToken)) === 'confirm') setConfirmSent('confirm')
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-rail px-10 py-9 text-rail-ink lg:flex xl:px-16 xl:py-12">
        <div className="pointer-events-none absolute -top-40 -right-32 size-[34rem] rounded-full bg-[#284996]/28 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[0.7rem] bg-white font-display text-lg font-bold text-[#0e1736]">D</span>
          <div><p className="font-display text-lg font-semibold leading-tight text-white">Deskbook</p><p className="text-[0.72rem] tracking-[0.12em] uppercase opacity-60">Client operations</p></div>
        </div>
        <div className="relative my-12 max-w-2xl">
          <p className="mb-4 text-[0.78rem] font-semibold tracking-[0.13em] text-[#91a8e8] uppercase">One view for the whole business</p>
          <h1 className="max-w-[15ch] text-[3.3rem] leading-[0.98] font-semibold tracking-[-0.04em] text-white xl:text-[4.35rem]">
            Run client work without losing the details.
          </h1>
          <p className="mt-6 max-w-[48ch] text-[1.02rem] leading-relaxed text-[#b9c4e2]">Track every lead, deliverable, invoice and follow-up from a workspace your team can understand at a glance.</p>
          <div className="mt-9 flex max-w-xl gap-1" aria-hidden="true">
            {SAMPLE.map((s) => (
              <div key={s.name} style={{ flex: s.amount }} className="min-w-0">
                <div className="flex h-11 gap-px overflow-hidden rounded-[5px]">
                  <div className="bg-[#3fca95]" style={{ width: `${s.paid * 100}%` }} />
                  {s.paid < 1 && <div className={`flex-1 ${s.late ? 'hatch-late' : 'hatch-due'}`} />}
                </div>
                <p className="mt-1.5 truncate text-[0.85rem]">{s.name}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <LoginMetric value="24" label="active clients" /><LoginMetric value="$18.4k" label="received" /><LoginMetric value="92%" label="on-time work" />
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[0.82rem] opacity-65"><LockKey size={15} />Secure workspace access · Powered by your Supabase project</div>
      </section>

      <section className="flex items-center justify-center bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--focus)_8%,transparent),transparent_35%)] px-5 py-10 sm:px-8">
        {confirmSent ? (
          <div className="w-full max-w-md rounded-[1.1rem] border border-line bg-surface p-7 shadow-[0_24px_70px_rgb(15_26_58/0.09)]">
            <CheckCircle size={38} weight="fill" className="text-paid" />
            <h2 className="text-2xl font-semibold">Check your email</h2>
            <p className="mt-2 text-mute">
              {confirmSent === 'reset'
                ? `If ${f.email} has an account, a link to set a new password is on its way.`
                : `We sent a confirmation link to ${f.email}. Open it, then come back and sign in.`}
            </p>
            <button className="btn mt-5" onClick={() => { setConfirmSent(false); setMode('in') }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-[430px] rounded-[1.15rem] border border-line bg-surface p-6 shadow-[0_24px_70px_rgb(15_26_58/0.09)] sm:p-8">
            <div className="mb-6 lg:hidden"><p className="font-display text-xl font-semibold">Deskbook</p><p className="mt-0.5 text-[0.85rem] text-mute">Client operations workspace</p></div>
            <div className="mb-6">
              <p className="text-[0.78rem] font-semibold tracking-[0.12em] text-mute uppercase">Secure access</p>
              <h2 className="mt-1 text-[1.8rem] font-semibold">{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Accept your invitation' : 'Reset your password'}</h2>
              <p className="mt-1 text-mute">{mode === 'in' ? 'Sign in to manage clients, work and payments.' : mode === 'up' ? 'Create your account to join this private workspace.' : 'We will send a secure reset link to your inbox.'}</p>
            </div>
            <div className="space-y-4">
            {mode === 'up' && (
              <Field label="Your name"><input className="input" required autoComplete="name" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            )}
            <Field label="Email address"><input className="input" type="email" required autoComplete="email" placeholder="you@company.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            {mode !== 'reset' && (
              <Field label="Password" hint={mode === 'up' ? 'At least 6 characters.' : undefined}>
                <input className="input" type="password" required minLength={6} placeholder="Enter your password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              </Field>
            )}
            {error && <p role="alert" className="rounded-md bg-[color-mix(in_srgb,var(--late)_12%,transparent)] px-3 py-2 text-[0.93rem] font-medium text-late">{error}</p>}
            <button className="btn btn-primary h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in to Deskbook' : mode === 'up' ? 'Create account' : 'Email me a reset link'}</button>
            {mode === 'in' && (
              <button type="button" className="text-[0.9rem] font-semibold text-mute underline underline-offset-2 hover:text-ink" onClick={() => { setMode('reset'); setError('') }}>
                Forgot your password?
              </button>
            )}
            {isDemo && mode === 'in' && <DemoAccess onUse={() => setF({ ...f, email: 'demo@deskbook.app', password: 'demo1234' })} />}
            <p className="text-[0.93rem] text-mute">{mode === 'in' ? 'Deskbook is invite-only. Ask your workspace owner for access.' : mode === 'up' ? 'Already have an account?' : 'Remembered it?'}{' '}{mode !== 'in' && <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => { setMode('in'); setError('') }}>Sign in</button>}</p>
            {mode === 'up' && <p className="rounded-[0.6rem] bg-sunk px-3 py-2 text-[0.87rem] text-mute">This invitation is tied to your email address and can only be used once.</p>}
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

function LoginMetric({ value, label }: { value: string; label: string }) {
  return <div className="border-t border-white/15 pt-3"><p className="font-display text-xl font-semibold text-white">{value}</p><p className="mt-0.5 text-[0.77rem] text-[#9ca9ca]">{label}</p></div>
}

function DemoAccess({ onUse }: { onUse(): void }) {
  return (
    <button type="button" onClick={onUse} className="group flex w-full items-center gap-3 rounded-[0.7rem] border border-line bg-sunk px-3.5 py-3 text-left hover:border-mute">
      <span className="grid size-8 place-items-center rounded-[0.5rem] bg-surface text-mute"><TrendUp size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[0.82rem] font-semibold">Use demo account</span><span className="block truncate font-mono text-[0.75rem] text-mute">demo@deskbook.app · demo1234</span></span>
      <Copy size={15} className="text-mute group-hover:text-ink" />
    </button>
  )
}
