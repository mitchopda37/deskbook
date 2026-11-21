import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clock, Copy, EnvelopeSimple, PaperPlaneTilt, Trash } from '@phosphor-icons/react'
import { emailInvitation } from '../lib/backend'
import { useActions, useAuth, useData, useToast } from '../lib/store'
import { today } from '../lib/dates'
import { Avatar, PageHead } from '../ui/kit'

export default function Team() {
  const { team, workspaceMembers, tasks, invitations } = useData()
  const { userId } = useAuth()
  const { add, patch, remove } = useActions()
  const toast = useToast()
  const t = today()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'member'>('member')
  const [latestLink, setLatestLink] = useState('')
  const [sending, setSending] = useState('')
  const qc = useQueryClient()

  const sortedTeam = [...team].sort((a, b) => Number(workspaceMembers.find((m) => m.user_id === b.id)?.role === 'owner') - Number(workspaceMembers.find((m) => m.user_id === a.id)?.role === 'owner') || a.full_name.localeCompare(b.full_name))
  const busiest = Math.max(1, ...team.map((p) => tasks.filter((x) => x.assignee_id === p.id && x.status !== 'done').length))
  const unassigned = tasks.filter((x) => !x.assignee_id && x.status !== 'done').length
  const openInvites = invitations.filter((i) => i.status === 'pending')
  const linkFor = (token: string) => `${location.origin}/?invite=${encodeURIComponent(token)}`
  const deliver = async (invitationId: string, email: string, token: string) => {
    setSending(invitationId)
    const result = await emailInvitation(invitationId)
    setSending('')
    await qc.invalidateQueries({ queryKey: ['data'] })
    if (result.ok) {
      setLatestLink('')
      toast(result.kind === 'invite' ? `Invitation emailed to ${email}` : `${email} already had an account. Access granted and a sign-in link was emailed.`)
      return
    }
    const link = linkFor(token)
    setLatestLink(link)
    await navigator.clipboard.writeText(link).catch(() => {})
    toast(result.reason, 'error')
  }
  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    const token = crypto.randomUUID()
    const saved = await add('invitations', {
      email, token, status: 'pending', role: inviteRole, invited_by: userId,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    if (!saved) return
    setInviteEmail('')
    await deliver(saved.id, email, token)
  }

  return (
    <>
      <PageHead title="Team" sub="Invite-only access. Team members see their assigned work and follow-ups, never invoices or payments." />

      <section className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={invite} className="panel p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[0.65rem] bg-primary text-primary-ink"><PaperPlaneTilt size={19} weight="fill" /></span>
            <div><h2 className="text-xl font-semibold">Invite a team member</h2><p className="mt-0.5 text-[0.9rem] text-mute">We email them a secure, single-use link. Invitations expire after 7 days.</p></div>
          </div>
          <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-[1fr_11rem_auto]">
            <label className="relative flex-1"><span className="sr-only">Email address</span><EnvelopeSimple size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-mute" /><input className="input pl-9" type="email" required placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label>
            <select className="input" aria-label="Workspace access level" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'owner' | 'member')}><option value="member">Team member</option><option value="owner">Workspace admin</option></select>
            <button className="btn btn-primary" disabled={!!sending}><PaperPlaneTilt size={16} />{sending ? 'Sending…' : 'Send invite'}</button>
          </div>
          {latestLink && <div className="mt-3 flex items-center gap-2 rounded-[0.65rem] bg-sunk p-2"><input className="min-w-0 flex-1 bg-transparent px-2 text-[0.82rem] text-mute outline-none" readOnly value={latestLink} onFocus={(e) => e.target.select()} /><button type="button" className="btn btn-sm" onClick={() => navigator.clipboard.writeText(latestLink).then(() => toast('Invite link copied'))}><Copy size={14} />Copy</button></div>}
        </form>
        <div className="panel p-5 md:p-6">
          <p className="text-[0.78rem] font-semibold tracking-[0.11em] text-mute uppercase">Access policy</p>
          <p className="mt-2 font-display text-xl font-semibold">Private by default</p>
          <p className="mt-1 text-[0.9rem] text-mute">Public sign-up is disabled. Every new member must use an email-matched invitation created by an owner.</p>
        </div>
      </section>

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
                  <p className="truncate text-[0.87rem] text-mute">{membership?.role === 'owner' ? 'Workspace owner' : p.email}</p>
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
                {p.id !== userId && membership ? <div className="order-5 col-span-3 flex items-center justify-end gap-1 md:order-none md:col-span-1"><select className="input h-8 w-auto text-[0.82rem]" aria-label={`Role for ${p.full_name || p.email}`} value={membership.role} onChange={(e) => patch('workspace_members', membership.id, { role: e.target.value }, 'Access level updated')}><option value="member">Team member</option><option value="owner">Workspace admin</option></select><button className="btn btn-quiet btn-sm" onClick={() => confirm(`Remove ${p.full_name || p.email} from this workspace?`) && remove('workspace_members', membership.id, 'Workspace access removed')}>Remove</button></div> : <span />}
              </li>
            )
          })}
        </ul>
        {unassigned > 0 && <p className="mt-3 text-mute">{unassigned} open {unassigned === 1 ? 'piece of work has' : 'pieces of work have'} nobody assigned.</p>}
      </section>

      {openInvites.length > 0 && <section className="mt-8 max-w-3xl"><h2 className="mb-3 text-xl font-semibold">Pending invitations</h2><ul className="panel divide-y divide-line">{openInvites.map((item) => <li key={item.id} className="flex items-center gap-3 px-4 py-3"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute"><EnvelopeSimple size={17} /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.email} <span className="tag ml-1">{item.role === 'owner' ? 'Workspace admin' : 'Team member'}</span></p><p className="flex items-center gap-1 text-[0.82rem] text-mute"><Clock size={13} />Expires {new Date(item.expires_at).toLocaleDateString()}</p></div><button className="btn btn-quiet btn-sm" disabled={sending === item.id} onClick={() => deliver(item.id, item.email, item.token)}><PaperPlaneTilt size={14} />{sending === item.id ? 'Sending…' : 'Email again'}</button><button className="btn btn-quiet btn-icon btn-sm" aria-label="Copy invite link" title="Copy invite link" onClick={() => navigator.clipboard.writeText(linkFor(item.token)).then(() => toast('Invite link copied'))}><Copy size={14} /></button><button className="btn btn-danger btn-icon btn-sm" aria-label="Revoke invitation" onClick={() => confirm(`Revoke the invitation for ${item.email}?`) && remove('invitations', item.id, 'Invitation revoked')}><Trash size={15} /></button></li>)}</ul></section>}
    </>
  )
}
