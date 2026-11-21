import { useState, type FormEvent } from 'react'
import { Check, Clock, Copy, EnvelopeSimple, Link as LinkIcon, LockKey, Trash, X } from '@phosphor-icons/react'
import { useActions, useAuth, useData, useToast } from '../lib/store'
import { today } from '../lib/dates'
import { Avatar, PageHead } from '../ui/kit'

export default function Team() {
  const { team, workspaceMembers, tasks, invitations, isPlatformOwner } = useData()
  const { userId } = useAuth()
  const { add, patch, remove } = useActions()
  const toast = useToast()
  const t = today()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'member'>('member')
  const [latest, setLatest] = useState<{ email: string; link: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [creating, setCreating] = useState(false)

  const sortedTeam = [...team].sort((a, b) => Number(workspaceMembers.find((m) => m.user_id === b.id)?.role === 'owner') - Number(workspaceMembers.find((m) => m.user_id === a.id)?.role === 'owner') || a.full_name.localeCompare(b.full_name))
  const busiest = Math.max(1, ...team.map((p) => tasks.filter((x) => x.assignee_id === p.id && x.status !== 'done').length))
  const unassigned = tasks.filter((x) => !x.assignee_id && x.status !== 'done').length
  const openInvites = invitations.filter((i) => i.status === 'pending' && new Date(i.expires_at).getTime() > Date.now())
  const linkFor = (token: string) => `${location.origin}/?invite=${encodeURIComponent(token)}`
  const copy = async (key: string, link: string, message = 'Invite link copied') => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? '' : k)), 1800)
      toast(message)
    } catch {
      toast('Copy blocked by the browser. Select the link and copy it by hand.', 'error')
    }
  }
  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    // 122 bits of randomness: the link itself is the secret.
    const token = crypto.randomUUID()
    setCreating(true)
    const saved = await add('invitations', {
      email, token, status: 'pending', role: inviteRole, invited_by: userId,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    setCreating(false)
    if (!saved) return
    setInviteEmail('')
    const link = linkFor(token)
    setLatest({ email, link })
    await copy('latest', link, `Invite link for ${email} copied`)
  }

  return (
    <>
      <PageHead title="Team" sub={isPlatformOwner ? 'Invite-only access. Sub admins run this workspace. Team members see their assigned work and follow-ups, never invoices or payments.' : 'Who works in this workspace and how much each person has on.'} />

      {isPlatformOwner ? <section className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={invite} className="panel p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[0.65rem] bg-primary text-primary-ink"><LinkIcon size={19} weight="bold" /></span>
            <div><h2 className="text-xl font-semibold">Invite a team member</h2><p className="mt-0.5 text-[0.9rem] text-mute">Create a private link and send it to them yourself. It works once and expires after 7 days.</p></div>
          </div>
          <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-[1fr_11rem_auto]">
            <label className="relative flex-1"><span className="sr-only">Email address</span><EnvelopeSimple size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-mute" /><input className="input pl-9" type="email" required placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label>
            <select className="input" aria-label="Workspace access level" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'owner' | 'member')}><option value="member">Team member</option><option value="owner">Sub admin</option></select>
            <button className="btn btn-primary" disabled={creating}><LinkIcon size={16} weight="bold" />{creating ? 'Creating…' : 'Create invite link'}</button>
          </div>
          {latest && (
            <div className="fade-in mt-4 rounded-[0.75rem] border border-line bg-sunk p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[0.87rem]"><span className="font-semibold">Link for {latest.email}</span><span className="text-mute"> · works once, expires in 7 days</span></p>
                <button type="button" className="btn btn-quiet btn-icon btn-sm -mt-1 -mr-1" aria-label="Hide link" onClick={() => setLatest(null)}><X size={14} /></button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input className="input h-9 min-w-0 flex-1 font-mono text-[0.8rem]" readOnly aria-label="Invite link" value={latest.link} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn btn-sm w-[5.5rem] shrink-0" onClick={() => copy('latest', latest.link)}>{copied === 'latest' ? <><Check size={14} weight="bold" className="text-paid" />Copied</> : <><Copy size={14} />Copy</>}</button>
              </div>
              <p className="mt-2 text-[0.82rem] text-mute">Send it privately, for example on WhatsApp or Slack. They open it, choose a password, and the link stops working.</p>
            </div>
          )}
        </form>
        <div className="panel p-5 md:p-6">
          <p className="text-[0.78rem] font-semibold tracking-[0.11em] text-mute uppercase">Access policy</p>
          <p className="mt-2 font-display text-xl font-semibold">Private by default</p>
          <p className="mt-1 text-[0.9rem] text-mute">Public sign-up is disabled. Every new member needs a one-time invite link created by you, the admin. Revoke a link any time before it is used.</p>
        </div>
      </section> : (
        <p className="mb-6 flex items-center gap-2.5 rounded-[0.8rem] border border-line bg-sunk px-4 py-3 text-[0.93rem] text-mute">
          <LockKey size={18} className="shrink-0" />Only the agency admin can add or remove people and change their access. Ask them if someone needs to join.
        </p>
      )}

      <section>
        <ul className="panel divide-y divide-line">
          {sortedTeam.map((p) => {
            const membership = workspaceMembers.find((m) => m.user_id === p.id)
            const mine = tasks.filter((x) => x.assignee_id === p.id)
            const open = mine.filter((x) => x.status !== 'done')
            const late = open.filter((x) => x.due_on && x.due_on < t).length
            const done = mine.filter((x) => x.status === 'done' && (x.completed_at ?? '') >= weekAgo).length
            return (
              <li key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 md:grid-cols-[auto_minmax(0,15rem)_1fr_auto]">
                <Avatar name={p.full_name || p.email} size={38} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.full_name || p.email}{p.id === userId && <span className="font-normal text-mute"> (you)</span>}</p>
                  <p className="truncate text-[0.87rem] text-mute">{p.role === 'owner' ? 'Admin' : membership?.role === 'owner' ? 'Sub admin' : 'Team member'}{p.email ? ` · ${p.email}` : ''}</p>
                </div>
                <div className="order-4 col-span-3 md:order-none md:col-span-1">
                  <div className="flex h-2.5 gap-px" aria-hidden="true">
                    {late > 0 && <div className="rounded-[3px] bg-late" style={{ width: `${(late / busiest) * 100}%` }} />}
                    {open.length - late > 0 && <div className="rounded-[3px] bg-ink/30" style={{ width: `${((open.length - late) / busiest) * 100}%` }} />}
                  </div>
                  <p className="mt-1.5 text-[0.87rem] text-mute">
                    <span className="font-semibold text-ink">{open.length} open</span>
                    {late > 0 && <span className="font-semibold text-late">, {late} late</span>}, {done} done this week
                  </p>
                </div>
                {isPlatformOwner && p.id !== userId && membership ? <div className="order-5 col-span-3 flex items-center justify-end gap-1 md:order-none md:col-span-1"><select className="input h-8 w-auto text-[0.82rem]" aria-label={`Role for ${p.full_name || p.email}`} value={membership.role} onChange={(e) => patch('workspace_members', membership.id, { role: e.target.value }, 'Access level updated')}><option value="member">Team member</option><option value="owner">Sub admin</option></select><button className="btn btn-quiet btn-sm" onClick={() => confirm(`Remove ${p.full_name || p.email} from this workspace?`) && remove('workspace_members', membership.id, 'Workspace access removed')}>Remove</button></div> : <span />}
              </li>
            )
          })}
        </ul>
        {unassigned > 0 && <p className="mt-3 text-mute">{unassigned} open {unassigned === 1 ? 'piece of work has' : 'pieces of work have'} nobody assigned.</p>}
      </section>

      {isPlatformOwner && openInvites.length > 0 && <section className="mt-8 max-w-3xl"><h2 className="mb-3 text-xl font-semibold">Unused invite links</h2><ul className="panel divide-y divide-line">{openInvites.map((item) => <li key={item.id} className="flex items-center gap-3 px-4 py-3"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute"><EnvelopeSimple size={17} /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.email} <span className="tag ml-1">{item.role === 'owner' ? 'Sub admin' : 'Team member'}</span></p><p className="flex items-center gap-1 text-[0.82rem] text-mute"><Clock size={13} />Expires {new Date(item.expires_at).toLocaleDateString()}</p></div><button className="btn btn-sm" onClick={() => copy(item.id, linkFor(item.token))}>{copied === item.id ? <><Check size={14} weight="bold" className="text-paid" />Copied</> : <><Copy size={14} />Copy link</>}</button><button className="btn btn-danger btn-icon btn-sm" aria-label={`Revoke invite link for ${item.email}`} title="Revoke link" onClick={() => confirm(`Revoke the invite link for ${item.email}? It will stop working.`) && remove('invitations', item.id, 'Invite link revoked')}><Trash size={15} /></button></li>)}</ul></section>}
    </>
  )
}
