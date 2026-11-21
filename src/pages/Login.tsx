import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle, Copy, LinkBreak, LockKey, TrendUp } from '@phosphor-icons/react'
import { useAuth } from '../lib/store'
import { authLinkError, isDemo, lookupInvite, type InviteInfo } from '../lib/backend'
import { Field } from '../ui/kit'

const CARD = 'fade-in w-full max-w-[430px] rounded-[1.15rem] border border-line bg-surface p-6 shadow-[0_24px_70px_rgb(15_26_58/0.09)] sm:p-8'

// The picture on the left is the product's own payment strip, drawn with sample numbers.
const SAMPLE = [
  { name: 'Harbor Dental', amount: 24, paid: 1, late: false },
  { name: 'Northwind', amount: 18, paid: 0.55, late: false },
  { name: 'Kestrel', amount: 34, paid: 0.5, late: false },
  { name: 'Atlas', amount: 10, paid: 0.25, late: true },
]

export default function Login() {
  const { signIn, sendReset } = useAuth()
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(location.search).get('invite') ?? '')
  const [mode, setMode] = useState<'in' | 'reset'>('in')
  const [f, setF] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(authLinkError ? `${authLinkError}. Ask your workspace admin for a new invite link, or reset your password if you already have an account.` : '')
  const [resetSent, setResetSent] = useState(false)

  const leaveInvite = (next: { email?: string; reset?: boolean } = {}) => {
    window.history.replaceState(null, '', window.location.pathname)
    setInviteToken('')
    setError('')
    setF({ email: next.email ?? '', password: '' })
    setMode(next.reset ? 'reset' : 'in')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') await signIn(f.email, f.password)
      else { await sendReset(f.email); setResetSent(true) }
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
          <div><p className="font-display text-lg font-semibold leading-tight text-white">Deskbook</p><p className="text-[0.72rem] tracking-[0.12em] text-rail-mute uppercase">Client operations</p></div>
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
        <div className="relative flex items-center gap-2 text-[0.82rem] text-rail-mute"><LockKey size={15} />Secure workspace access · Powered by your Supabase project</div>
      </section>

      <section className="flex items-center justify-center bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--focus)_8%,transparent),transparent_35%)] px-5 py-10 sm:px-8">
        {inviteToken ? (
          <InviteCard key={inviteToken} token={inviteToken} onLeave={leaveInvite} />
        ) : resetSent ? (
          <div className="fade-in w-full max-w-md rounded-[1.1rem] border border-line bg-surface p-7 shadow-[0_24px_70px_rgb(15_26_58/0.09)]">
            <CheckCircle size={38} weight="fill" className="text-paid" />
            <h2 className="mt-2 text-2xl font-semibold">Check your email</h2>
            <p className="mt-2 text-mute">If {f.email} has an account, a link to set a new password is on its way.</p>
            <button className="btn mt-5" onClick={() => { setResetSent(false); setMode('in') }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className={CARD}>
            <div className="mb-6 lg:hidden"><p className="font-display text-xl font-semibold">Deskbook</p><p className="mt-0.5 text-[0.85rem] text-mute">Client operations workspace</p></div>
            <div className="mb-6">
              <p className="text-[0.78rem] font-semibold tracking-[0.12em] text-mute uppercase">Secure access</p>
              <h2 className="mt-1 text-[1.8rem] font-semibold">{mode === 'in' ? 'Welcome back' : 'Reset your password'}</h2>
              <p className="mt-1 text-mute">{mode === 'in' ? 'Sign in to manage clients, work and payments.' : 'We will send a secure reset link to your inbox.'}</p>
            </div>
            <div className="space-y-4">
            <Field label="Email address"><input className="input" type="email" required autoComplete="email" placeholder="you@company.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            {mode === 'in' && (
              <Field label="Password">
                <input className="input" type="password" required placeholder="Enter your password" autoComplete="current-password"
                  value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              </Field>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <button className="btn btn-primary h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in to Deskbook' : 'Email me a reset link'}</button>
            {mode === 'in' && (
              <button type="button" className="text-[0.9rem] font-semibold text-mute underline underline-offset-2 hover:text-ink" onClick={() => { setMode('reset'); setError('') }}>
                Forgot your password?
              </button>
            )}
            {isDemo && mode === 'in' && <DemoAccess onUse={() => setF({ ...f, email: 'demo@deskbook.app', password: 'demo1234' })} />}
            <p className="text-[0.93rem] text-mute">{mode === 'in' ? 'Deskbook is invite-only. Ask your workspace admin for an invite link.' : 'Remembered it?'}{' '}{mode !== 'in' && <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => { setMode('in'); setError('') }}>Sign in</button>}</p>
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

function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md bg-[color-mix(in_srgb,var(--late)_12%,transparent)] px-3 py-2 text-[0.93rem] font-medium text-late">{children}</p>
}

type InviteState = InviteInfo | { status: 'loading' } | { status: 'error'; message: string }

const DEAD_LINK = {
  used: ['This invite link was already used', 'Invite links work only once. If you set your password with it, sign in with your email and password.'],
  expired: ['This invite link has expired', 'Invite links stop working after 7 days. Ask your workspace admin for a new one.'],
  invalid: ['This invite link is not valid', 'It may have been revoked or copied incompletely. Ask your workspace admin for a new one.'],
} as const

/** Opened from a one-time invite link: shows who it is for, then sets a password (or signs in) and joins. */
function InviteCard({ token, onLeave }: { token: string; onLeave(next?: { email?: string; reset?: boolean }): void }) {
  const { acceptInvite } = useAuth()
  const [info, setInfo] = useState<InviteState>({ status: 'loading' })
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    lookupInvite(token)
      .then((r) => { if (live) setInfo(r) })
      .catch((err) => { if (live) setInfo({ status: 'error', message: (err as Error).message }) })
    return () => { live = false }
  }, [token])

  if (info.status === 'loading') {
    return (
      <div className={CARD} role="status" aria-label="Checking your invite link">
        <span className="skeleton h-3 w-28" />
        <span className="skeleton mt-3 h-8 w-3/4" />
        <span className="skeleton mt-3 h-4 w-full" />
        <span className="skeleton mt-2 h-4 w-2/3" />
        {[0, 1, 2].map((i) => <span key={i} className="skeleton mt-6 h-10 w-full" />)}
        <span className="skeleton mt-6 h-11 w-full" />
      </div>
    )
  }

  if (info.status !== 'ok' && info.status !== 'demo') {
    const [title, text] = info.status === 'error' ? ['We could not check this link', info.message] : DEAD_LINK[info.status]
    return (
      <div className={CARD}>
        <span className="grid size-11 place-items-center rounded-[0.7rem] bg-[color-mix(in_srgb,var(--late)_12%,transparent)] text-late"><LinkBreak size={22} weight="bold" /></span>
        <h2 className="mt-4 text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-mute">{text}</p>
        <button className="btn btn-primary mt-6 h-11 w-full" onClick={() => onLeave()}>Go to sign in</button>
      </div>
    )
  }

  const ok = info.status === 'ok' ? info : null
  const hasAccount = ok?.has_account ?? false
  const email = ok?.email ?? f.email
  const workspace = ok?.workspace ?? 'Deskbook'
  const role = ok?.role === 'owner' ? 'a workspace admin' : 'a team member'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!hasAccount && f.password !== f.confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    try {
      await acceptInvite({ token, email, name: f.name.trim(), password: f.password, hasAccount })
    } catch (err) {
      setError((err as Error).message)
      // The link may have been used meanwhile, or the account may exist after all.
      lookupInvite(token).then(setInfo).catch(() => {})
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={CARD}>
      <p className="mb-5 font-display text-xl font-semibold lg:hidden">Deskbook</p>
      <div className="mb-6">
        <p className="text-[0.78rem] font-semibold tracking-[0.12em] text-mute uppercase">You are invited</p>
        <h2 className="mt-1 text-[1.8rem] leading-tight font-semibold">Join {workspace}</h2>
        <p className="mt-1.5 text-mute">
          {hasAccount
            ? `You already have a Deskbook account. Enter its password to add ${workspace}.`
            : `You were invited as ${role}. Choose a password to finish setting up your account.`}
        </p>
      </div>
      <div className="space-y-4">
        <Field label="Email address" hint={ok ? 'The invitation is tied to this address.' : undefined}>
          <input className="input" type="email" required autoComplete="username" readOnly={!!ok} disabled={!!ok} value={email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        {!hasAccount && (
          <Field label="Your name"><input className="input" required autoFocus autoComplete="name" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        )}
        <Field label={hasAccount ? 'Password' : 'Choose a password'} hint={hasAccount ? undefined : 'At least 8 characters.'}>
          <input className="input" type="password" required minLength={hasAccount ? undefined : 8} autoFocus={hasAccount} autoComplete={hasAccount ? 'current-password' : 'new-password'}
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        {!hasAccount && (
          <Field label="Confirm password">
            <input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <button className="btn btn-primary h-11 w-full" disabled={busy}>{busy ? 'Opening your workspace…' : hasAccount ? 'Sign in and join' : 'Set password and join'}</button>
        {hasAccount && (
          <button type="button" className="text-[0.9rem] font-semibold text-mute underline underline-offset-2 hover:text-ink" onClick={() => onLeave({ email, reset: true })}>
            Forgot your password?
          </button>
        )}
        <p className="flex gap-2 rounded-[0.6rem] bg-sunk px-3 py-2.5 text-[0.87rem] text-mute"><LockKey size={16} className="mt-0.5 shrink-0" />This link works once. After you join it stops working, and you sign in with your email and password.</p>
      </div>
    </form>
  )
}
