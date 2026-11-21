import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MagnifyingGlass, Plus, Repeat, X } from '@phosphor-icons/react'
import { useData, useSheet } from '../lib/store'
import { BILLING_LABEL, CLIENT_SOURCES, PIPELINE_STAGES, type ClientStatus } from '../lib/types'
import { Due, Empty, PageHead, Segmented } from '../ui/kit'

export default function Clients() {
  const { clients, retainers, tasks, bills, followups, isOwner, money, moneyIn, currency } = useData()
  const { open } = useSheet()
  const go = useNavigate()
  const [status, setStatus] = useState<ClientStatus>('active')
  const [query, setQuery] = useState('')
  const [pipeline, setPipeline] = useState('all')
  const [source, setSource] = useState('all')

  const count = (s: ClientStatus) => clients.filter((c) => c.status === s).length
  const term = query.trim().toLowerCase()
  const rows = clients.filter((c) => c.status === status
    && (pipeline === 'all' || c.pipeline_stage === pipeline)
    && (source === 'all' || c.source === source)
    && (!term || [c.name, c.contact_name, c.email, c.phone].some((v) => v.toLowerCase().includes(term))))
    .sort((a, b) => a.name.localeCompare(b.name))

  const view = rows.map((c) => {
    const mine = bills.filter((b) => b.client_id === c.id)
    return {
      c,
      retainer: retainers.find((r) => r.client_id === c.id),
      openWork: tasks.filter((t) => t.client_id === c.id && t.status !== 'done').length,
      owes: mine.reduce((sum, b) => sum + b.remaining, 0),
      late: mine.some((b) => b.overdue),
      next: followups.filter((f) => f.client_id === c.id && !f.done).sort((a, b) => a.due_on.localeCompare(b.due_on))[0],
    }
  })

  return (
    <>
      <PageHead title="Clients" sub={`${count('active')} active. Open one to see its work, invoices and follow-ups in one place.`}>
        <Segmented<ClientStatus> label="Client status" value={status} onChange={setStatus} options={[
          { id: 'active', label: 'Active', count: count('active') },
          { id: 'paused', label: 'Paused', count: count('paused') },
          { id: 'ended', label: 'Ended', count: count('ended') },
        ]} />
        {isOwner && <button className="btn btn-primary" onClick={() => open({ kind: 'client' })}><Plus size={16} weight="bold" />Add client</button>}
      </PageHead>

      <div className="mb-4 flex flex-col gap-2 rounded-[0.85rem] border border-line bg-surface p-2 sm:flex-row">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search clients</span><MagnifyingGlass size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-mute" /><input className="input border-transparent bg-transparent pr-9 pl-9 shadow-none! focus:bg-sunk" placeholder="Search clients, contacts, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-mute hover:bg-sunk hover:text-ink"><X size={15} /></button>}</label>
        <select className="input w-full border-transparent bg-sunk sm:w-auto" aria-label="Filter by pipeline" value={pipeline} onChange={(e) => setPipeline(e.target.value)}><option value="all">All pipeline stages</option>{PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select className="input w-full border-transparent bg-sunk sm:w-auto" aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">All lead sources</option>{CLIENT_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>

      {rows.length === 0 ? (
        <Empty title={clients.length === 0 ? 'No clients yet' : `No ${status} clients`}>
          {clients.length === 0 && isOwner && 'Add your first client. If they pay monthly, choose "Monthly retainer" and the app bills them each month in one click.'}
        </Empty>
      ) : (
        <>
          {/* phones: one card per client */}
          <ul className="panel divide-y divide-line md:hidden">
            {view.map(({ c, retainer, openWork, owes, late, next }) => (
              <li key={c.id}>
                <Link to={`/clients/${c.id}`} className="row-link block px-4 py-3.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">{c.name}</span>
                    {isOwner && owes > 0 && <span className={`shrink-0 font-semibold ${late ? 'text-late' : ''}`}>{money(owes)} {late ? 'overdue' : 'owed'}</span>}
                  </span>
                  <span className="mt-0.5 block text-[0.9rem] text-mute">
                    {BILLING_LABEL[c.billing_type]}{retainer && `, ${moneyIn(retainer.amount, c.currency || currency)} a month`}
                  </span>
                  <span className="mt-2 flex gap-1.5"><span className="tag">{PIPELINE_STAGES.find((s) => s.id === c.pipeline_stage)?.label}</span><span className="tag">{CLIENT_SOURCES.find((s) => s.id === c.source)?.label}</span></span>
                  <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.9rem]">
                    <span>{openWork} open work</span>
                    {next && <span className="text-mute">Follow-up <Due date={next.due_on} /></span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line text-[0.87rem] text-mute [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
                  <th>Client</th><th>Pipeline</th><th>Source</th><th>Billing</th><th className="text-right">Open work</th>
                  {isOwner && <th className="text-right">Owes you</th>}
                  <th>Next follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.map(({ c, retainer, openWork, owes, late, next }) => (
                  <tr key={c.id} tabIndex={0} role="link" onClick={() => go(`/clients/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/clients/${c.id}`)}
                    className="row-link cursor-pointer [&>td]:px-4 [&>td]:py-3">
                    <td>
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block text-[0.87rem] text-mute">{c.contact_name || c.email || 'No contact yet'}</span>
                    </td>
                    <td><span className={`tag ${c.pipeline_stage === 'active' || c.pipeline_stage === 'won' ? 'tag-paid' : ''}`}>{PIPELINE_STAGES.find((s) => s.id === c.pipeline_stage)?.label}</span></td>
                    <td className="text-mute">{CLIENT_SOURCES.find((s) => s.id === c.source)?.label}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        {c.billing_type === 'retainer' && <Repeat size={15} className="text-mute" />}
                        {BILLING_LABEL[c.billing_type]}
                      </span>
                      {retainer && <span className="block text-[0.87rem] text-mute">{moneyIn(retainer.amount, c.currency || currency)} a month, due on day {retainer.billing_day}</span>}
                    </td>
                    <td className="text-right">{openWork || <span className="text-mute">None</span>}</td>
                    {isOwner && (
                      <td className="text-right">
                        {owes > 0
                          ? <span className={`font-semibold ${late ? 'text-late' : ''}`}>{money(owes)}{late && <span className="block text-[0.82rem]">overdue</span>}</span>
                          : <span className="text-mute">Nothing</span>}
                      </td>
                    )}
                    <td>{next ? <><Due date={next.due_on} /><span className="block max-w-[22ch] truncate text-[0.87rem] text-mute">{next.about}</span></> : <span className="text-mute">None planned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
