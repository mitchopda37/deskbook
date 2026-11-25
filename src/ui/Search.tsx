import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressBook, BellSimpleRinging, GraduationCap, Kanban, MagnifyingGlass, Plus, Receipt, type Icon } from '@phosphor-icons/react'
import { useData, useSheet } from '../lib/store'

interface Hit { key: string; icon: Icon; title: string; sub: string; run(): void }

/** Ctrl/Cmd+K: find a client, a piece of work or an invoice, or start something new. */
export function Search({ onClose }: { onClose(): void }) {
  const { clients, tasks, bills, followups, assignments, isOwner, clientName, moneyIn } = useData()
  const { open } = useSheet()
  const go = useNavigate()
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase()
    const has = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(term))
    if (!term) {
      const starts: Hit[] = [
        { key: 'n-task', icon: Plus, title: 'New work', sub: 'Something to do for a client', run: () => open({ kind: 'task' }) },
        { key: 'n-follow', icon: Plus, title: 'New follow-up', sub: 'A reminder to call or write', run: () => open({ kind: 'followup' }) },
      ]
      if (isOwner) starts.push(
        { key: 'n-inv', icon: Plus, title: 'New invoice', sub: 'Money a client owes you', run: () => open({ kind: 'invoice' }) },
        { key: 'n-client', icon: Plus, title: 'New client', sub: 'A new company or person', run: () => open({ kind: 'client' }) },
        { key: 'n-assign', icon: Plus, title: 'New assignment', sub: 'Student work with a deadline', run: () => open({ kind: 'assignment' }) },
      )
      return starts
    }
    const out: Hit[] = []
    for (const c of clients) if (has(c.name, c.contact_name, c.email, c.phone, c.source, c.pipeline_stage))
      out.push({ key: c.id, icon: AddressBook, title: c.name, sub: c.contact_name || 'Client', run: () => go(`/clients/${c.id}`) })
    for (const t of tasks) if (has(t.title, t.details))
      out.push({ key: t.id, icon: Kanban, title: t.title, sub: `Work for ${clientName(t.client_id)}`, run: () => open({ kind: 'task', id: t.id }) })
    for (const b of bills) if (has(b.title, clientName(b.client_id), String(b.native.amount), b.currency))
      out.push({ key: b.id, icon: Receipt, title: `${clientName(b.client_id)}: ${b.title}`, sub: b.remaining > 0 ? `${moneyIn(b.native.remaining, b.currency)} remaining` : `${moneyIn(b.native.amount, b.currency)}, paid`, run: () => open({ kind: 'invoice', id: b.id }) })
    for (const a of assignments) if (has(a.title, a.student_name, a.student_contact, a.subject, a.institution))
      out.push({ key: a.id, icon: GraduationCap, title: a.title, sub: `${a.student_name}${isOwner && a.priced ? `, ${a.native.remaining > 0 ? `${moneyIn(a.native.remaining, a.currency)} remaining` : 'paid'}` : ''}`, run: () => open({ kind: 'assignment', id: a.id }) })
    for (const f of followups) if (has(f.about, clientName(f.client_id)))
      out.push({ key: f.id, icon: BellSimpleRinging, title: f.about, sub: `Follow-up for ${clientName(f.client_id)}`, run: () => open({ kind: 'followup', id: f.id }) })
    return out.slice(0, 12)
  }, [q, clients, tasks, bills, followups, assignments, isOwner, clientName, moneyIn, open, go])

  useEffect(() => setAt(0), [q])
  useEffect(() => { list.current?.children[at]?.scrollIntoView({ block: 'nearest' }) }, [at])

  const pick = (h: Hit | undefined) => { if (h) { onClose(); h.run() } }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[at]) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[8vh] print:hidden">
      <div className="scrim absolute inset-0 bg-[rgb(8_13_30/0.5)]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search"
        className="pop relative w-full max-w-[560px] overflow-hidden rounded-[0.9rem] border border-line bg-surface shadow-[0_24px_60px_rgb(8_13_30/0.3)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <MagnifyingGlass size={20} className="shrink-0 text-mute" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search clients, work, invoices or follow-ups" aria-label="Search"
            className="h-13 w-full bg-transparent text-[16px] outline-none placeholder:text-mute" />
          <button className="btn btn-quiet btn-sm shrink-0" onClick={onClose}>Close</button>
        </div>
        <ul ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
          {hits.map((h, i) => (
            <li key={h.key}>
              <button onClick={() => pick(h)} onMouseMove={() => setAt(i)}
                className={`flex w-full items-center gap-3 rounded-[0.55rem] px-3 py-2 text-left ${i === at ? 'bg-sunk' : ''}`}>
                <h.icon size={18} className="shrink-0 text-mute" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="block truncate text-[0.87rem] text-mute">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-6 text-center text-mute">Nothing matches "{q}". Try a client name or an amount.</li>}
        </ul>
      </div>
    </div>
  )
}
