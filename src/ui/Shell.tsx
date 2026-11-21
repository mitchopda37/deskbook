import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  AddressBook, BellSimpleRinging, Buildings, CaretUpDown, ChartBar, DotsThreeOutline, GearSix, Kanban, Lightning, MagnifyingGlass, Moon, Plus,
  SidebarSimple, SignOut, Sun, SunHorizon, UsersThree, Wallet, X, type Icon,
} from '@phosphor-icons/react'
import { useAuth, useData, useSheet, type Sheet } from '../lib/store'
import { isDemo } from '../lib/backend'
import { today } from '../lib/dates'
import { readableInk } from '../lib/color'
import { Avatar } from './kit'
import { Sheets } from './Sheets'
import { Search } from './Search'

export function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // Cross-fade colours for a moment so the switch does not flash.
    const html = document.documentElement
    html.classList.add('theme-fade')
    window.setTimeout(() => html.classList.remove('theme-fade'), 320)
    html.dataset.theme = next
    try { localStorage.setItem('deskbook-theme', next) } catch { /* storage blocked: applies for this visit only */ }
    setTheme(next)
  }
  return { theme, toggle }
}

function useDismiss(ref: RefObject<HTMLElement | null>, shown: boolean, hide: () => void) {
  useEffect(() => {
    if (!shown) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && hide()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [ref, shown, hide])
}

interface NavItem { to: string; label: string; icon: Icon; count?: number; alert?: boolean }

export function Shell({ children }: { children: ReactNode }) {
  const { me, isOwner, isPlatformOwner, tasks, followups, bills, workspaceName, activeWorkspace, workspaces, switchWorkspace } = useData()
  const { userId, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const [slim, setSlim] = useState(localStorage.getItem('rail') === 'slim')
  const [searching, setSearching] = useState(false)
  const [more, setMore] = useState(false)
  const t = today()
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

  useEffect(() => { setMore(false); window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((s) => !s) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const setRail = (next: boolean) => { setSlim(next); localStorage.setItem('rail', next ? 'slim' : 'wide') }

  const myDue = tasks.filter((x) => x.status !== 'done' && x.assignee_id === userId && x.due_on && x.due_on <= t).length
  const followDue = followups.filter((x) => !x.done && x.due_on <= t).length
  const late = bills.filter((b) => b.overdue).length

  const groups: { label?: string; items: NavItem[] }[] = [
    { items: [
      { to: '/', label: 'Today', icon: SunHorizon },
      { to: '/work', label: 'Work', icon: Kanban, count: myDue },
      { to: '/clients', label: 'Clients', icon: AddressBook },
      { to: '/follow-ups', label: 'Follow-ups', icon: BellSimpleRinging, count: followDue },
    ] },
    ...(isOwner ? [{ label: 'Money', items: [
      { to: '/money', label: 'Invoices', icon: Wallet, count: late, alert: true },
      { to: '/reports', label: 'Reports', icon: ChartBar },
    ] }] : []),
    ...(isPlatformOwner ? [{ label: 'Agency', items: [{ to: '/workspaces', label: 'Workspaces', icon: Buildings }] }] : []),
    { label: isOwner ? 'Business' : undefined, items: [
      ...(isOwner ? [{ to: '/team', label: 'Team', icon: UsersThree }] : []),
      ...(isOwner ? [{ to: '/automations', label: 'Automations', icon: Lightning }] : []),
      { to: '/settings', label: 'Settings', icon: GearSix },
    ] },
  ]
  const all = groups.flatMap((g) => g.items)
  const tabPaths = isOwner ? ['/', '/work', '/clients', '/money'] : ['/', '/work', '/clients', '/follow-ups']
  const tabs = tabPaths.map((p) => all.find((n) => n.to === p)!)
  const rest = all.filter((n) => !tabPaths.includes(n.to))
  const restActive = rest.some((n) => pathname.startsWith(n.to))
  const myName = me?.full_name || me?.email || 'You'
  const roleLabel = isPlatformOwner ? 'Admin' : isOwner ? 'Sub admin' : 'Team member'

  return (
    <div className="min-h-dvh transition-[padding] duration-200 md:pl-(--rail) print:pl-0!" style={{ '--rail': slim ? '72px' : '252px', '--workspace-accent': activeWorkspace?.accent_color ?? '#3159c9', '--workspace-accent-ink': readableInk(activeWorkspace?.accent_color ?? '#3159c9') } as React.CSSProperties}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* ---------- desktop rail ---------- */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-(--rail) flex-col bg-rail text-rail-ink transition-[width] duration-200 md:flex print:hidden">
        <div className={`flex items-center gap-2.5 pt-4 pb-3 ${slim ? 'flex-col px-0' : 'px-3'}`}>
          <Mark name={workspaceName} logo={activeWorkspace?.logo_url} accent={activeWorkspace?.accent_color} />
          {!slim && (
            <div className="min-w-0 flex-1">
              {workspaces.length > 1 ? <select aria-label="Active workspace" value={activeWorkspace?.id ?? ''} onChange={(e) => switchWorkspace(e.target.value)} className="-ml-1 w-full truncate rounded border-0 bg-transparent px-1 font-display text-[1.02rem] leading-tight font-semibold text-white outline-none [&>option]:text-ink">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select> : <p className="truncate font-display text-[1.05rem] leading-tight font-semibold text-white">{workspaceName}</p>}
              <p className="px-1 text-[0.68rem] leading-tight tracking-[0.11em] text-rail-mute uppercase">Client workspace</p>
            </div>
          )}
          <button onClick={() => setRail(!slim)} className="rounded-md p-1.5 hover:bg-white/10 hover:text-white"
            aria-label={slim ? 'Widen the menu' : 'Shrink the menu'} title={slim ? 'Widen the menu' : 'Shrink the menu'}>
            <SidebarSimple size={18} />
          </button>
        </div>

        <div className={`space-y-2 pb-3 ${slim ? 'px-3' : 'px-3'}`}>
          <button onClick={() => setSearching(true)} title="Search"
            className={`flex h-10 w-full items-center gap-2.5 rounded-[0.65rem] border border-white/10 bg-white/7 text-[0.93rem] shadow-[inset_0_1px_rgb(255_255_255/0.04)] hover:bg-white/12 hover:text-white ${slim ? 'justify-center' : 'px-3'}`}>
            <MagnifyingGlass size={17} />
            {!slim && <><span className="flex-1 text-left">Search</span><kbd className="rounded border border-rail-line px-1.5 font-sans text-[0.75rem] opacity-80">{isMac ? '\u2318K' : 'Ctrl K'}</kbd></>}
          </button>
          <NewMenu isOwner={isOwner} variant={slim ? 'rail-slim' : 'rail'} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
          {groups.map((g, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {g.label && (slim
                ? <div className="mx-2 mb-2 border-t border-rail-line" />
                : <p className="mb-1 px-3 text-[0.8rem] font-medium text-rail-mute">{g.label}</p>)}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'} title={slim ? n.label : undefined}
                    className={({ isActive }) =>
                      `relative flex h-9.5 items-center rounded-[0.55rem] font-medium transition-colors duration-150 ${slim ? 'justify-center' : 'gap-3 px-3'} ${
                        isActive ? 'bg-white/12 text-white' : 'hover:bg-white/6 hover:text-white'
                      }`}>
                    {({ isActive }) => (
                      <>
                        <n.icon size={20} weight={isActive ? 'fill' : 'regular'} />
                        {!slim && <span className="flex-1">{n.label}</span>}
                        {!!n.count && (slim
                          ? <span className={`absolute top-1.5 right-2.5 size-2 rounded-full ${n.alert ? 'bg-late' : 'bg-gold'}`} />
                          : <span className={`min-w-5 rounded-full px-1.5 text-center text-[0.78rem] leading-5 font-semibold ${n.alert ? 'bg-late text-late-ink' : 'bg-gold text-gold-ink'}`}>{n.count}</span>)}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <UserMenu name={myName} role={roleLabel} slim={slim} theme={theme} toggle={toggle} signOut={signOut} />
      </aside>

      {/* ---------- phone top bar ---------- */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden print:hidden">
        <Mark name={workspaceName} logo={activeWorkspace?.logo_url} accent={activeWorkspace?.accent_color} onLight />
        {workspaces.length > 1 ? <select aria-label="Active workspace" value={activeWorkspace?.id ?? ''} onChange={(e) => switchWorkspace(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent font-display text-[1rem] font-semibold outline-none">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select> : <p className="min-w-0 flex-1 truncate font-display text-[1.05rem] font-semibold">{workspaceName}</p>}
        <button className="btn btn-quiet btn-icon" aria-label="Search" onClick={() => setSearching(true)}><MagnifyingGlass size={20} /></button>
        <NewMenu isOwner={isOwner} variant="bar" />
      </header>

      {isDemo && (
        <p className="border-b border-line bg-sunk px-4 py-2 text-center text-[0.87rem] font-medium text-mute print:hidden">
          You are looking at sample data. Nothing is saved until you connect Supabase.
        </p>
      )}

      <main id="main-content" className="mx-auto max-w-[1380px] px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16 xl:px-11 print:max-w-none print:p-0">
        {/* Keyed by path so each view eases in instead of popping. */}
        <div key={pathname} className="page-enter">{children}</div>
      </main>

      {/* ---------- phone tab bar ---------- */}
      <nav aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) => `relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.72rem] font-semibold transition-colors duration-150 ${isActive ? 'text-ink' : 'text-mute'}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-ink" />}
                <span className="relative">
                  <n.icon size={23} weight={isActive ? 'fill' : 'regular'} />
                  {!!n.count && <span className={`absolute -top-0.5 -right-1.5 size-2.5 rounded-full border-2 border-surface ${n.alert ? 'bg-late' : 'bg-gold'}`} />}
                </span>
                {n.label}
              </>
            )}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} aria-haspopup="dialog"
          className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.72rem] font-semibold ${restActive ? 'text-ink' : 'text-mute'}`}>
          {restActive && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-ink" />}
          <span className="relative">
            <DotsThreeOutline size={23} weight={restActive ? 'fill' : 'regular'} />
            {rest.some((n) => n.count) && <span className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full border-2 border-surface bg-gold" />}
          </span>
          More
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-40 flex items-end md:hidden">
          <div className="scrim absolute inset-0 bg-[rgb(8_13_30/0.45)]" onClick={() => setMore(false)} />
          <div role="dialog" aria-modal="true" aria-label="More"
            className="sheet-up relative w-full rounded-t-[1.1rem] bg-surface px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="flex items-center gap-3 px-2 py-3">
              <Avatar name={myName} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{myName}</p>
                <p className="text-[0.87rem] text-mute">{roleLabel}</p>
              </div>
              <button className="btn btn-quiet btn-icon" aria-label="Close" onClick={() => setMore(false)}><X size={20} /></button>
            </div>
            <div className="border-t border-line pt-1.5">
              {rest.map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex h-12 items-center gap-3.5 rounded-[0.6rem] px-3 font-semibold transition-colors duration-150 ${isActive ? 'bg-sunk' : ''}`}>
                  <n.icon size={22} /><span className="flex-1">{n.label}</span>
                  {!!n.count && <span className="min-w-5 rounded-full bg-gold px-1.5 text-center text-[0.8rem] leading-5 text-gold-ink">{n.count}</span>}
                </NavLink>
              ))}
              <button onClick={toggle} className="flex h-12 w-full items-center gap-3.5 rounded-[0.6rem] px-3 font-semibold">
                {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}Switch to {theme === 'dark' ? 'light' : 'dark'} theme
              </button>
              <button onClick={signOut} className="flex h-12 w-full items-center gap-3.5 rounded-[0.6rem] px-3 font-semibold text-late">
                <SignOut size={22} />Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {searching && <Search onClose={() => setSearching(false)} />}
      <Sheets />
    </div>
  )
}

function Mark({ name, logo, accent, onLight = false }: { name: string; logo?: string; accent?: string; onLight?: boolean }) {
  if (logo) return <img src={logo} alt={`${name} logo`} className="size-9 shrink-0 rounded-[0.6rem] object-cover" />
  return (
    <span aria-hidden="true"
      className={`grid size-9 shrink-0 place-items-center rounded-[0.6rem] font-display text-[1.05rem] font-semibold ${
        accent ? '' : onLight ? 'bg-primary text-primary-ink' : 'bg-white text-[#0e1736]'
      }`} style={accent ? { background: accent, color: readableInk(accent) } : undefined}>
      {(name.trim()[0] ?? 'D').toUpperCase()}
    </span>
  )
}

function UserMenu({ name, role, slim, theme, toggle, signOut }: {
  name: string; role: string; slim: boolean; theme: string; toggle(): void; signOut(): void
}) {
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, shown, () => setShown(false))
  return (
    <div ref={ref} className={`relative flex gap-1 border-t border-rail-line p-2 ${slim ? 'flex-col items-center' : 'items-center'}`}>
      <button onClick={() => setShown(!shown)} aria-expanded={shown} aria-haspopup="menu" title={slim ? name : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[0.55rem] p-1.5 text-left hover:bg-white/8 ${slim ? 'justify-center' : ''}`}>
        <Avatar name={name} size={32} />
        {!slim && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.93rem] font-semibold text-white">{name}</span>
              <span className="block text-[0.8rem] leading-tight text-rail-mute">{role}</span>
            </span>
            <CaretUpDown size={16} />
          </>
        )}
      </button>
      <button onClick={signOut} aria-label="Sign out" title="Sign out"
        className="grid size-9 shrink-0 place-items-center rounded-[0.55rem] text-rail-ink hover:bg-white/10 hover:text-white">
        <SignOut size={18} />
      </button>
      {shown && (
        <div role="menu" className="pop absolute bottom-full left-2 z-40 mb-1.5 w-56 rounded-[0.75rem] border border-line bg-surface p-1.5 text-ink shadow-[0_14px_40px_rgb(8_13_30/0.25)]">
          <button role="menuitem" onClick={() => { toggle(); setShown(false) }} className="flex h-9.5 w-full items-center gap-2.5 rounded-[0.5rem] px-2.5 font-medium hover:bg-sunk">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </button>
          <NavLink role="menuitem" to="/settings" onClick={() => setShown(false)} className="flex h-9.5 items-center gap-2.5 rounded-[0.5rem] px-2.5 font-medium hover:bg-sunk">
            <GearSix size={18} />Settings
          </NavLink>
          <button role="menuitem" onClick={signOut} className="flex h-9.5 w-full items-center gap-2.5 rounded-[0.5rem] px-2.5 font-medium text-late hover:bg-sunk">
            <SignOut size={18} />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function NewMenu({ isOwner, variant }: { isOwner: boolean; variant: 'rail' | 'rail-slim' | 'bar' }) {
  const { open } = useSheet()
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, shown, () => setShown(false))

  const options: { label: string; hint: string; sheet: Sheet; owner?: boolean }[] = [
    { label: 'Work', hint: 'Something to do for a client', sheet: { kind: 'task' } },
    { label: 'Follow-up', hint: 'A reminder to call or write', sheet: { kind: 'followup' } },
    { label: 'Invoice', hint: 'Money a client owes you', sheet: { kind: 'invoice' }, owner: true },
    { label: 'Client', hint: 'A new company or person', sheet: { kind: 'client' }, owner: true },
  ]
  const trigger = {
    rail: 'flex h-9 w-full items-center gap-2.5 rounded-[0.55rem] bg-white px-2.5 text-[0.93rem] font-semibold text-[#0e1736] hover:bg-white/90',
    'rail-slim': 'flex h-9 w-full items-center justify-center rounded-[0.55rem] bg-white text-[#0e1736] hover:bg-white/90',
    bar: 'btn btn-primary btn-icon',
  }[variant]
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setShown(!shown)} aria-expanded={shown} aria-haspopup="menu" aria-label="New" title="New" className={trigger}>
        <Plus size={variant === 'bar' ? 20 : 17} weight="bold" />{variant === 'rail' && 'New'}
      </button>
      {shown && (
        <div role="menu"
          className={`pop absolute top-full z-40 mt-1.5 w-60 rounded-[0.75rem] border border-line bg-surface p-1.5 text-ink shadow-[0_14px_40px_rgb(8_13_30/0.22)] ${
            variant === 'bar' ? 'right-0' : 'left-0'
          }`}>
          {options.filter((o) => !o.owner || isOwner).map((o) => (
            <button key={o.label} role="menuitem" onClick={() => { setShown(false); open(o.sheet) }}
              className="block w-full rounded-[0.5rem] px-3 py-2 text-left hover:bg-sunk">
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-[0.85rem] text-mute">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
