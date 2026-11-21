import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { arrivedFromInvite, backend, createInvitedAccount, isDemo, supabase } from './backend'
import { DEMO_USER } from './demo'
import { daysBetween, monthKey, today } from './dates'
import type { Bill, Client, Data, Invoice, Payment, Profile, Received, Table } from './types'

// ------------------------------------------------------------------ auth

interface AuthState {
  loading: boolean
  userId: string | null
  email: string | null
  signIn(email: string, password: string): Promise<void>
  signUp(name: string, email: string, password: string, inviteToken?: string): Promise<'in' | 'confirm'>
  signOut(): Promise<void>
  /** True after the person opens a password-reset link from their email. */
  recovering: boolean
  sendReset(email: string): Promise<void>
  setPassword(password: string): Promise<void>
  /** True after the person opens an emailed invitation and has not chosen a name and password yet. */
  welcoming: boolean
  finishWelcome(name: string, password: string): Promise<void>
  /** Uses a one-time invite link: creates the account (or signs in an existing one) and joins the workspace. */
  acceptInvite(input: { token: string; email: string; name: string; password: string; hasAccount: boolean }): Promise<void>
  /** True while a sign-in from an invite link is still adding the new workspace. */
  joining: boolean
}
const AuthCtx = createContext<AuthState>(null!)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(!isDemo)
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(
    isDemo && sessionStorage.getItem('deskbook-demo-session') ? { id: DEMO_USER, email: 'demo@deskbook.app' } : null,
  )

  const [recovering, setRecovering] = useState(false)
  const [welcoming, setWelcoming] = useState(!isDemo && arrivedFromInvite)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email ?? null } : null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      const u = session?.user
      setUser((prev) => (prev?.id === u?.id ? prev : u ? { id: u.id, email: u.email ?? null } : null))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      async signIn(email, password) {
        if (isDemo) {
          if (email.toLowerCase() !== 'demo@deskbook.app' || password !== 'demo1234') throw new Error('Use the demo email and password shown below.')
          sessionStorage.setItem('deskbook-demo-session', 'active')
          setUser({ id: DEMO_USER, email: 'demo@deskbook.app' })
          return
        }
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
      },
      async signUp(name, email, password, inviteToken) {
        if (isDemo) {
          sessionStorage.setItem('deskbook-demo-session', 'active')
          setUser({ id: DEMO_USER, email })
          return 'in'
        }
        const { data, error } = await supabase!.auth.signUp({
          email, password, options: { data: { full_name: name, invite_token: inviteToken ?? '' } },
        })
        if (error) throw new Error(error.message)
        return data.session ? 'in' : 'confirm'
      },
      async signOut() {
        await supabase?.auth.signOut()
        sessionStorage.removeItem('deskbook-demo-session')
        if (isDemo) setUser(null)
        setRecovering(false)
        qc.clear()
      },
      recovering,
      async sendReset(email) {
        if (isDemo) return
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw new Error(error.message)
      },
      async setPassword(password) {
        const { error } = await supabase!.auth.updateUser({ password })
        if (error) throw new Error(error.message)
        setRecovering(false)
      },
      welcoming,
      async finishWelcome(name, password) {
        const { error } = await supabase!.auth.updateUser({ password, data: { full_name: name } })
        if (error) throw new Error(error.message)
        if (user) {
          const { error: profileError } = await supabase!.from('profiles').update({ full_name: name }).eq('id', user.id)
          if (profileError) throw new Error(profileError.message)
        }
        window.history.replaceState(null, '', window.location.pathname)
        setWelcoming(false)
        await qc.invalidateQueries({ queryKey: ['data'] })
      },
      joining,
      async acceptInvite({ token, email, name, password, hasAccount }) {
        const clearLink = () => window.history.replaceState(null, '', window.location.pathname)
        if (isDemo) {
          sessionStorage.setItem('deskbook-demo-session', 'active')
          clearLink()
          setUser({ id: DEMO_USER, email: 'demo@deskbook.app' })
          return
        }
        const sb = supabase!
        if (!hasAccount) {
          const created = await createInvitedAccount(token, name, password)
          if (!created.ok && !created.unavailable) throw new Error(created.reason)
          if (!created.ok) {
            // No server function (local dev): plain sign-up. Works when "Confirm email" is off in Supabase.
            const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name, invite_token: token } } })
            if (error) throw new Error(error.message)
            if (!data.session) throw new Error('Your account was created but Supabase wants an email confirmation. Ask the admin to turn off "Confirm email" in Supabase, or to add SUPABASE_SERVICE_ROLE_KEY on Vercel.')
            clearLink()
            return
          }
          clearLink()
          const { error } = await sb.auth.signInWithPassword({ email, password })
          if (error) throw new Error(error.message)
          return
        }
        // Existing account: hold the app on the splash until the new workspace is added.
        setJoining(true)
        try {
          const { error } = await sb.auth.signInWithPassword({ email, password })
          if (error) throw new Error(error.message)
          const { data: workspaceId, error: acceptError } = await sb.rpc('accept_invitation', { p_token: token })
          if (acceptError) {
            await sb.auth.signOut()
            throw new Error(acceptError.message)
          }
          if (workspaceId) switchWorkspace(String(workspaceId))
          clearLink()
          await qc.invalidateQueries({ queryKey: ['data'] })
        } finally {
          setJoining(false)
        }
      },
    }),
    [loading, user, qc, recovering, welcoming, joining],
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

// ------------------------------------------------------------------ data

const TABLES: Table[] = ['profiles', 'workspaces', 'workspace_members', 'clients', 'retainers', 'tasks', 'invoices', 'payments', 'followups', 'automations', 'invitations']
const EMPTY: Data = { profiles: [], workspaces: [], workspace_members: [], clients: [], retainers: [], tasks: [], invoices: [], payments: [], followups: [], automations: [], invitations: [] }
const SCOPED_TABLES = new Set<Table>(['clients', 'retainers', 'tasks', 'invoices', 'payments', 'followups', 'automations', 'invitations'])

let activeWorkspaceId = localStorage.getItem('deskbook-workspace') ?? ''
const workspaceListeners = new Set<() => void>()
const subscribeWorkspace = (listener: () => void) => { workspaceListeners.add(listener); return () => workspaceListeners.delete(listener) }
const readWorkspace = () => activeWorkspaceId
const useActiveWorkspaceId = () => useSyncExternalStore(subscribeWorkspace, readWorkspace, readWorkspace)
export const switchWorkspace = (id: string) => {
  activeWorkspaceId = id
  localStorage.setItem('deskbook-workspace', id)
  workspaceListeners.forEach((listener) => listener())
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Works out paid, remaining and overdue for every invoice. Payment maths happens in the invoice's own
 * currency; `toBase` then converts the results so totals across currencies can be added up.
 */
export function toBills(
  invoices: Invoice[], payments: Payment[],
  baseCurrency = 'USD', toBase: (n: number, currency: string) => number = (n) => n,
): { bills: Bill[]; received: Received[] } {
  const t = today()
  const currencyOf = new Map(invoices.map((inv) => [inv.id, inv.currency || baseCurrency]))
  const received: Received[] = payments.map((p) => {
    const currency = currencyOf.get(p.invoice_id) ?? baseCurrency
    return { ...p, currency, native_amount: p.amount, amount: round2(toBase(p.amount, currency)) }
  })
  const byInvoice = new Map<string, Received[]>()
  for (const p of received) byInvoice.set(p.invoice_id, [...(byInvoice.get(p.invoice_id) ?? []), p])
  const bills = invoices.map((inv): Bill => {
    const currency = inv.currency || baseCurrency
    const list = (byInvoice.get(inv.id) ?? []).sort((a, b) => a.paid_on.localeCompare(b.paid_on))
    const paid = Math.min(inv.amount, round2(list.reduce((s, p) => s + p.native_amount, 0)))
    const remaining = Math.max(0, round2(inv.amount - paid))
    const overdue = remaining > 0 && inv.due_on < t
    return {
      ...inv, currency,
      amount: round2(toBase(inv.amount, currency)), paid: round2(toBase(paid, currency)), remaining: round2(toBase(remaining, currency)),
      native: { amount: inv.amount, paid, remaining },
      payments: list, overdue,
      daysLate: overdue ? daysBetween(inv.due_on, t) : 0,
      state: remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    }
  })
  return { bills, received }
}

const formatters = new Map<string, Intl.NumberFormat>()
/** Formats an amount in any currency, with cents only when the amount has them. */
export function formatMoney(n: number, currency: string) {
  const cents = Math.round(n * 100) % 100 !== 0
  const key = `${currency}:${cents}`
  let f = formatters.get(key)
  if (!f) {
    try { f = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) }
    catch { f = new Intl.NumberFormat(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) }
    formatters.set(key, f)
  }
  return f.format(n)
}

/** Everything the signed-in person is allowed to see. Row-level security does the filtering. */
export function useData() {
  const { userId } = useAuth()
  const selectedWorkspaceId = useActiveWorkspaceId()
  const q = useQuery({
    queryKey: ['data', userId],
    enabled: !!userId,
    queryFn: async () => {
      const lists = await Promise.all(TABLES.map((t) => backend.list(t)))
      return Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as unknown as Data
    },
  })
  const data = q.data ?? EMPTY

  useEffect(() => {
    if (!userId || data.workspaces.length === 0) return
    const me = data.profiles.find((p) => p.id === userId)
    const allowed = data.workspaces.filter((w) => me?.role === 'owner' || data.workspace_members.some((m) => m.user_id === userId && m.workspace_id === w.id))
    if (allowed.length > 0 && !allowed.some((w) => w.id === selectedWorkspaceId)) switchWorkspace(allowed[0].id)
  }, [data.workspaces, data.workspace_members, data.profiles, userId, selectedWorkspaceId])

  return useMemo(() => {
    const me = data.profiles.find((p) => p.id === userId) ?? null
    const memberships = data.workspace_members.filter((m) => m.user_id === userId)
    const availableWorkspaces = data.workspaces.filter((w) => me?.role === 'owner' || memberships.some((m) => m.workspace_id === w.id))
    const activeWorkspace = availableWorkspaces.find((w) => w.id === selectedWorkspaceId) ?? availableWorkspaces[0] ?? null
    const workspaceId = activeWorkspace?.id ?? ''
    const inWorkspace = <T extends { workspace_id: string }>(rows: T[]) => rows.filter((row) => row.workspace_id === workspaceId)
    const clients = inWorkspace(data.clients)
    const retainers = inWorkspace(data.retainers)
    const tasks = inWorkspace(data.tasks)
    const invoices = inWorkspace(data.invoices)
    const payments = inWorkspace(data.payments)
    const followups = inWorkspace(data.followups)
    const automations = inWorkspace(data.automations)
    const invitations = inWorkspace(data.invitations)
    const currency = activeWorkspace?.currency ?? 'USD'
    const clientById = new Map<string, Client>(clients.map((c) => [c.id, c]))

    // Multi-currency: each client and invoice has its own currency; totals are shown in the workspace
    // currency using the exchange rates kept in workspace settings.
    const fxRates = activeWorkspace?.fx_rates ?? {}
    const rateFor = (cur: string): number | null => (cur === currency ? 1 : Number(fxRates[cur]) > 0 ? Number(fxRates[cur]) : null)
    const toBase = (n: number, cur: string) => n * (rateFor(cur || currency) ?? 1)
    const currencyOfClient = (id: string) => clientById.get(id)?.currency || currency
    const { bills, received } = toBills(invoices, payments, currency, toBase)
    const currenciesInUse = [...new Set([currency, ...clients.map((c) => c.currency || currency), ...bills.map((b) => b.currency)])]
    const missingRates = currenciesInUse.filter((cur) => rateFor(cur) === null)
    /** Monthly retainer amounts converted to the workspace currency. */
    const retainerBase = (r: { client_id: string; amount: number }) => round2(toBase(r.amount, currencyOfClient(r.client_id)))
    const profileById = new Map<string, Profile>(data.profiles.map((p) => [p.id, p]))
    const workspaceMembers = data.workspace_members.filter((m) => m.workspace_id === workspaceId)
    const teamIds = new Set(workspaceMembers.map((m) => m.user_id))
    const team = data.profiles.filter((p) => teamIds.has(p.id))
    const myMembership = workspaceMembers.find((m) => m.user_id === userId)
    /** Formats an amount that is already in the workspace currency. */
    const money = (n: number) => formatMoney(n, currency)
    /** Formats an amount in its own currency. */
    const moneyIn = (n: number, cur: string) => formatMoney(n, cur || currency)
    return {
      ...data, workspaces: availableWorkspaces, workspaceMembers, activeWorkspace, workspaceId,
      allClients: data.clients, allTasks: data.tasks, allInvoices: data.invoices, allPayments: data.payments,
      clients, retainers, tasks, invoices, followups, automations, invitations,
      /** Payments with `amount` in the workspace currency (`native_amount` + `currency` keep the original). */
      payments: received,
      bills, me, team, clientById, profileById, money, moneyIn, switchWorkspace,
      fxRates, rateFor, toBase, currencyOfClient, currenciesInUse, missingRates, retainerBase,
      workspaceName: activeWorkspace?.brand_name || activeWorkspace?.name || 'Deskbook',
      currency,
      isOwner: me?.role === 'owner' || myMembership?.role === 'owner',
      isPlatformOwner: me?.role === 'owner',
      loading: q.isLoading,
      error: q.error as Error | null,
      clientName: (id: string) => clientById.get(id)?.name ?? 'Unknown client',
      personName: (id: string | null) => (id ? profileById.get(id)?.full_name || profileById.get(id)?.email || 'Someone' : 'Nobody yet'),
    }
  }, [data, userId, selectedWorkspaceId, q.isLoading, q.error])
}

export const thisMonth = () => monthKey(today())

// ------------------------------------------------------------------ writes

export function useActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const workspaceId = useActiveWorkspaceId()
  const toast = useToast()
  const key = ['data', userId]

  const run = useCallback(
    async <T,>(work: () => Promise<T>, done?: string): Promise<T | undefined> => {
      try {
        const result = await work()
        if (done) toast(done)
        return result
      } catch (e) {
        toast((e as Error).message || 'That did not save. Check your connection and try again.', 'error')
        return undefined
      } finally {
        await qc.invalidateQueries({ queryKey: ['data'] })
      }
    },
    [qc, toast],
  )

  return useMemo(
    () => ({
      add: (table: Table, row: Record<string, unknown>, done?: string) => run(() => backend.insert(table, SCOPED_TABLES.has(table) ? { workspace_id: workspaceId, ...row } : row), done),
      upsert: (table: Table, row: Record<string, unknown>, conflict: string) => run(() => backend.upsert(table, SCOPED_TABLES.has(table) ? { workspace_id: workspaceId, ...row } : row, conflict)),
      patch: (table: Table, id: string | number, patch: Record<string, unknown>, done?: string, pk = 'id') => {
        // show the change straight away, then confirm with the server
        qc.setQueryData<Data>(key, (old) =>
          old ? { ...old, [table]: (old[table] as any[]).map((r) => (r[pk] === id ? { ...r, ...patch } : r)) } : old,
        )
        return run(async () => {
          await backend.update(table, pk, id, patch)
          const current = qc.getQueryData<Data>(key)
          const rules = current?.automations.filter((a) =>
            a.workspace_id === workspaceId && a.enabled && a.trigger_table === table && Object.prototype.hasOwnProperty.call(patch, a.trigger_field)
            && String(patch[a.trigger_field]) === a.trigger_value,
          ) ?? []
          for (const rule of rules) {
            await backend.update(table, pk, id, { [rule.action_field]: rule.action_value })
            await backend.update('automations', 'id', rule.id, { runs: rule.runs + 1 })
          }
        }, done)
      },
      remove: (table: Table, id: string | number, done?: string, pk = 'id') => {
        qc.setQueryData<Data>(key, (old) =>
          old ? { ...old, [table]: (old[table] as any[]).filter((r) => r[pk] !== id) } : old,
        )
        return run(() => backend.remove(table, pk, id), done)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, qc, userId, workspaceId],
  )
}

// ------------------------------------------------------------------ toasts

type Toast = { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((list) => [...list, { id, text, kind }])
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ------------------------------------------------------------------ drawer (create / edit forms)

export type Sheet =
  | { kind: 'client'; id?: string }
  | { kind: 'task'; id?: string; clientId?: string; status?: string }
  | { kind: 'invoice'; id?: string; clientId?: string }
  | { kind: 'payment'; invoiceId: string }
  | { kind: 'followup'; id?: string; clientId?: string; invoiceId?: string; about?: string }

const SheetCtx = createContext<{ sheet: Sheet | null; leaving: boolean; open(s: Sheet): void; close(): void }>(null!)
export const useSheet = () => useContext(SheetCtx)

/** How long a closing drawer animates out before it unmounts. Matches .sheet-out in index.css. */
const SHEET_EXIT_MS = 180

export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef(0)
  const value = useMemo(() => ({
    sheet,
    leaving,
    open(s: Sheet) {
      window.clearTimeout(timer.current)
      setLeaving(false)
      setSheet(s)
    },
    close() {
      if (!sheet || leaving) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSheet(null); return }
      setLeaving(true)
      timer.current = window.setTimeout(() => { setSheet(null); setLeaving(false) }, SHEET_EXIT_MS)
    },
  }), [sheet, leaving])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return <SheetCtx.Provider value={value}>{children}</SheetCtx.Provider>
}
