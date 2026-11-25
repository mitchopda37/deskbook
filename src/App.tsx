import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HourglassMedium } from '@phosphor-icons/react'
import { useAuth, useData } from './lib/store'
import { Shell } from './ui/Shell'
import { AppSkeleton, PageSkeleton, Splash } from './ui/kit'
import Login from './pages/Login'

// Each page is its own download. The same loaders are reused to fetch them all in the
// background right after sign-in, so moving between views never waits on the network.
const pages = {
  Today: () => import('./pages/Today'),
  Work: () => import('./pages/Work'),
  Clients: () => import('./pages/Clients'),
  ClientDetail: () => import('./pages/ClientDetail'),
  Money: () => import('./pages/Money'),
  Followups: () => import('./pages/Followups'),
  Reports: () => import('./pages/Reports'),
  Team: () => import('./pages/Team'),
  Settings: () => import('./pages/Settings'),
  Automations: () => import('./pages/Automations'),
  Workspaces: () => import('./pages/Workspaces'),
  Assignments: () => import('./pages/Assignments'),
  AssignmentReport: () => import('./pages/AssignmentReport'),
  Calculator: () => import('./pages/Calculator'),
}
const Today = lazy(pages.Today)
const Work = lazy(pages.Work)
const Clients = lazy(pages.Clients)
const ClientDetail = lazy(pages.ClientDetail)
const Money = lazy(pages.Money)
const Followups = lazy(pages.Followups)
const Reports = lazy(pages.Reports)
const Team = lazy(pages.Team)
const Settings = lazy(pages.Settings)
const Automations = lazy(pages.Automations)
const Workspaces = lazy(pages.Workspaces)
const Assignments = lazy(pages.Assignments)
const AssignmentReport = lazy(pages.AssignmentReport)
const Calculator = lazy(pages.Calculator)

function usePreloadPages() {
  useEffect(() => {
    const load = () => Object.values(pages).forEach((get) => get().catch(() => { /* retried on visit */ }))
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(load, 800)
    return () => clearTimeout(id)
  }, [])
}

/** Starts the data request and page downloads together, as soon as we know who is signed in. */
function Preload() {
  usePreloadPages()
  return null
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6 text-center">{children}</div>
}

export default function App() {
  const { loading, userId, signOut, recovering, welcoming, joining } = useAuth()
  const data = useData()

  if (loading) return <Splash />
  // While an invite link signs someone in, keep its form on screen until the new workspace is added.
  if (!userId || joining) return <Login />
  if (recovering) return <NewPassword />
  if (data.loading) return <><Preload /><AppSkeleton /></>
  if (data.error)
    return (
      <Centered>
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">The database did not answer</h1>
          <p className="mt-2 text-mute">{data.error.message}</p>
          <p className="mt-2 text-mute">If this is a new project, run supabase/schema.sql in the Supabase SQL editor first.</p>
          <button className="btn mt-5" onClick={() => location.reload()}>Try again</button>
        </div>
      </Centered>
    )
  if (!data.me || data.me.role === 'pending')
    return (
      <Centered>
        <div className="max-w-md">
          <HourglassMedium size={40} className="mx-auto text-gold" weight="fill" />
          <h1 className="mt-3 text-2xl font-semibold">Waiting for approval</h1>
          <p className="mt-2 text-mute">
            Your account exists, but the owner has not let you in yet. Ask them to open Team and approve you, then reload this page.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
            <button className="btn" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </Centered>
    )
  if (welcoming) return <Welcome workspaceName={data.workspaceName} initialName={data.me.full_name} />
  if (!data.activeWorkspace)
    return <Centered><div className="max-w-md"><HourglassMedium size={40} className="mx-auto text-gold" weight="fill" /><h1 className="mt-3 text-2xl font-semibold">No workspace access</h1><p className="mt-2 text-mute">Your account is active, but it is not assigned to a client workspace. Ask the agency owner for a new invitation.</p><button className="btn mt-5" onClick={signOut}>Sign out</button></div></Centered>

  return (
    <Shell>
      <Preload />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/work" element={<Work />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/follow-ups" element={<Followups />} />
          <Route path="/assignments" element={<Assignments />} />
          {data.isOwner && <Route path="/assignments/report" element={<AssignmentReport />} />}
          {data.isOwner && <Route path="/calculator" element={<Calculator />} />}
          <Route path="/settings" element={<Settings />} />
          {data.isOwner && <Route path="/money" element={<Money />} />}
          {data.isOwner && <Route path="/reports" element={<Reports />} />}
          {data.isOwner && <Route path="/team" element={<Team />} />}
          {data.isOwner && <Route path="/automations" element={<Automations />} />}
          {data.isPlatformOwner && <Route path="/workspaces" element={<Workspaces />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}

function Welcome({ workspaceName, initialName }: { workspaceName: string; initialName: string }) {
  const { finishWelcome, email } = useAuth()
  const [name, setName] = useState(initialName)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Centered>
      <form className="w-full max-w-sm space-y-4 text-left"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError('')
          try { await finishWelcome(name.trim(), pw) } catch (err) { setError((err as Error).message) }
          setBusy(false)
        }}>
        <div>
          <p className="text-[0.78rem] font-semibold tracking-[0.12em] text-mute uppercase">Invitation accepted</p>
          <h1 className="mt-1 text-2xl font-semibold">Welcome to {workspaceName}</h1>
          <p className="mt-1 text-mute">Set your name and a password for {email ?? 'your account'}. You will use them to sign in next time.</p>
        </div>
        <label className="block">
          <span className="field-label">Your name</span>
          <input className="input" required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Password</span>
          <input className="input" type="password" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {error && <p role="alert" className="font-medium text-late">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Open my workspace'}</button>
      </form>
    </Centered>
  )
}

function NewPassword() {
  const { setPassword } = useAuth()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  return (
    <Centered>
      <form className="w-full max-w-sm space-y-4 text-left"
        onSubmit={async (e) => { e.preventDefault(); try { await setPassword(pw) } catch (err) { setError((err as Error).message) } }}>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <label className="block">
          <span className="field-label">New password</span>
          <input className="input" type="password" required minLength={6} autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {error && <p role="alert" className="font-medium text-late">{error}</p>}
        <button className="btn btn-primary w-full">Save password</button>
      </form>
    </Centered>
  )
}
