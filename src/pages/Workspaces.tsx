import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Buildings, Check, Palette, Plus, UsersThree, X } from '@phosphor-icons/react'
import { useActions, useAuth, useData } from '../lib/store'
import { AnimatedNumber, Field, PageHead } from '../ui/kit'
import { CURRENCIES } from '../lib/types'

const COLORS = ['#3159c9', '#0f7a5a', '#8b593d', '#7a4aa8', '#a44656', '#2c7185']

export default function Workspaces() {
  const d = useData()
  const [creating, setCreating] = useState(false)
  const go = useNavigate()
  const totalOpen = d.allTasks.filter((t) => t.status !== 'done').length

  return (
    <>
      <PageHead title="Agency console" sub="Create and oversee a separate, white-label client workspace from one control panel.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} weight="bold" />New workspace</button>
      </PageHead>

      <section className="mb-7 grid gap-px overflow-hidden rounded-[1rem] border border-line bg-line sm:grid-cols-3">
        <ConsoleMetric label="Client workspaces" value={d.workspaces.length} icon={<Buildings size={18} />} />
        <ConsoleMetric label="Managed clients" value={d.allClients.length} icon={<UsersThree size={18} />} />
        <ConsoleMetric label="Open work across accounts" value={totalOpen} icon={<Check size={18} />} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.workspaces.map((workspace, index) => {
          const clients = d.allClients.filter((c) => c.workspace_id === workspace.id)
          const tasks = d.allTasks.filter((t) => t.workspace_id === workspace.id)
          const open = tasks.filter((t) => t.status !== 'done').length
          const members = d.workspace_members.filter((m) => m.workspace_id === workspace.id).length
          const active = workspace.id === d.workspaceId
          return (
            <motion.article key={workspace.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.045 }}
              className={`panel overflow-hidden ${active ? 'ring-2 ring-[var(--workspace-accent,var(--focus))] ring-offset-2 ring-offset-paper' : ''}`}>
              <div className="flex items-start gap-4 p-5 md:p-6">
                <BrandMark workspace={workspace} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h2 className="truncate text-xl font-semibold">{workspace.name}</h2>{active && <span className="tag tag-paid">Open</span>}</div>
                  <p className="mt-0.5 truncate text-[0.86rem] text-mute">{workspace.brand_name} · /{workspace.slug}</p>
                </div>
                <span className="size-3 rounded-full" style={{ background: workspace.accent_color }} title="Brand accent" />
              </div>
              <div className="grid grid-cols-3 gap-px border-y border-line bg-line">
                <WorkspaceStat label="Clients" value={clients.length} />
                <WorkspaceStat label="Open work" value={open} />
                <WorkspaceStat label="Members" value={members} />
              </div>
              <div className="flex items-center gap-2 p-4">
                <button className="btn btn-primary" onClick={() => { d.switchWorkspace(workspace.id); go('/') }}>{active ? 'Open dashboard' : 'Switch workspace'}<ArrowRight size={15} /></button>
                <button className="btn btn-quiet" onClick={() => { d.switchWorkspace(workspace.id); go('/settings') }}><Palette size={16} />Brand settings</button>
              </div>
            </motion.article>
          )
        })}
        <button onClick={() => setCreating(true)} className="group grid min-h-56 place-items-center rounded-[1rem] border border-dashed border-line bg-surface/45 p-8 text-center hover:border-mute hover:bg-surface">
          <span><span className="mx-auto grid size-11 place-items-center rounded-[0.7rem] bg-sunk text-mute group-hover:bg-primary group-hover:text-primary-ink"><Plus size={20} weight="bold" /></span><span className="mt-3 block font-display text-lg font-semibold">Create another client workspace</span><span className="mt-1 block text-[0.9rem] text-mute">Separate data, team access and branding from day one.</span></span>
        </button>
      </div>

      {creating && <WorkspaceCreator onClose={() => setCreating(false)} />}
    </>
  )
}

function ConsoleMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center gap-3 bg-surface px-5 py-4"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute">{icon}</span><div><p className="font-display text-2xl font-semibold leading-none"><AnimatedNumber value={value} /></p><p className="mt-1 text-[0.83rem] text-mute">{label}</p></div></div>
}

function WorkspaceStat({ label, value }: { label: string; value: number }) {
  return <div className="bg-surface px-4 py-3"><p className="font-display text-lg font-semibold"><AnimatedNumber value={value} /></p><p className="text-[0.78rem] text-mute">{label}</p></div>
}

function BrandMark({ workspace }: { workspace: { name: string; logo_url: string; accent_color: string } }) {
  if (workspace.logo_url) return <img src={workspace.logo_url} alt={`${workspace.name} logo`} className="size-12 shrink-0 rounded-[0.75rem] object-cover" />
  return <span className="grid size-12 shrink-0 place-items-center rounded-[0.75rem] font-display text-lg font-bold text-white" style={{ background: workspace.accent_color }}>{workspace.name[0]?.toUpperCase()}</span>
}

function WorkspaceCreator({ onClose }: { onClose(): void }) {
  const { userId } = useAuth()
  const { add } = useActions()
  const d = useData()
  const go = useNavigate()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ name: '', brand_name: '', slug: '', currency: 'USD', accent_color: COLORS[0], logo_url: '' })
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value })
  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    const workspace = await add('workspaces', { ...f, name: f.name.trim(), brand_name: (f.brand_name || f.name).trim(), slug: f.slug || slugify(f.name), owner_id: userId }, 'Workspace created')
    if (workspace?.id) {
      await add('workspace_members', { workspace_id: workspace.id, user_id: userId, role: 'owner' })
      d.switchWorkspace(workspace.id)
      onClose(); go('/')
    }
    setBusy(false)
  }
  return <div className="fixed inset-0 z-50 flex justify-end"><div className="scrim absolute inset-0 bg-[rgb(8_13_30/0.52)]" onClick={onClose} /><form onSubmit={submit} className="sheet relative flex h-full w-full max-w-[520px] flex-col bg-surface shadow-[-24px_0_70px_rgb(8_13_30/0.22)]"><header className="flex items-center gap-3 border-b border-line px-5 py-4"><span className="grid size-10 place-items-center rounded-[0.7rem] bg-primary text-primary-ink"><Buildings size={20} weight="fill" /></span><div className="flex-1"><h2 className="text-xl font-semibold">New client workspace</h2><p className="text-[0.85rem] text-mute">Data and branding stay isolated</p></div><button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button></header><div className="flex-1 space-y-4 overflow-y-auto p-5"><Field label="Workspace name"><input className="input" required autoFocus placeholder="e.g. Northwind client portal" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugify(e.target.value) })} /></Field><Field label="White-label brand name" hint="What this client's team sees in the sidebar."><input className="input" placeholder="Defaults to workspace name" value={f.brand_name} onChange={set('brand_name')} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Workspace URL"><div className="flex"><span className="grid place-items-center rounded-l-[0.5rem] border border-r-0 border-line bg-sunk px-2.5 text-mute">/</span><input className="input rounded-l-none" required pattern="[a-z0-9\-]+" value={f.slug} onChange={set('slug')} /></div></Field><Field label="Main currency"><select className="input" value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field></div><Field label="Brand accent"><div className="flex flex-wrap gap-2">{COLORS.map((color) => <button type="button" key={color} onClick={() => setF({ ...f, accent_color: color })} className={`grid size-9 place-items-center rounded-[0.55rem] ${f.accent_color === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: color }}>{f.accent_color === color && <Check size={16} className="text-white" weight="bold" />}</button>)}<input type="color" className="h-9 w-12 rounded border border-line bg-surface p-1" value={f.accent_color} onChange={set('accent_color')} aria-label="Custom brand color" /></div></Field><Field label="Logo URL" hint="Optional. Use a square image for the best result."><input className="input" type="url" placeholder="https://…" value={f.logo_url} onChange={set('logo_url')} /></Field></div><footer className="flex gap-2 border-t border-line px-5 py-4"><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button><button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button></footer></form></div>
}
