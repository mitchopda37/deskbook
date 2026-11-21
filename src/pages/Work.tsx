import { useState } from 'react'
import { ArrowRight, Flag, Plus } from '@phosphor-icons/react'
import { useActions, useAuth, useData, useSheet } from '../lib/store'
import { TASK_STATUSES, type Task, type TaskStatus } from '../lib/types'
import { Avatar, Due, PageHead, Segmented } from '../ui/kit'

const NEXT: Partial<Record<TaskStatus, { to: TaskStatus; label: string }>> = {
  todo: { to: 'doing', label: 'Start' },
  doing: { to: 'review', label: 'Send to review' },
  review: { to: 'done', label: 'Mark done' },
}

export default function Work() {
  const { tasks, team, clients, isOwner, clientName, personName } = useData()
  const { userId } = useAuth()
  const { patch } = useActions()
  const { open } = useSheet()
  const [who, setWho] = useState('all')
  const [client, setClient] = useState('all')
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [stage, setStage] = useState<TaskStatus>('todo') // which column a phone shows

  const shown = tasks.filter(
    (t) => (who === 'all' || (who === 'none' ? !t.assignee_id : t.assignee_id === who)) && (client === 'all' || t.client_id === client),
  )
  const openCount = shown.filter((t) => t.status !== 'done').length
  const total = (s: TaskStatus) => shown.filter((t) => t.status === s).length

  const column = (status: TaskStatus) => {
    const list = shown.filter((t) => t.status === status)
    if (status === 'done')
      return list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 12)
    return list.sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))
  }
  const move = (id: string, status: TaskStatus) => {
    const task = tasks.find((t) => t.id === id)
    if (task && task.status !== status) patch('tasks', id, { status }, status === 'done' ? 'Marked done' : undefined)
  }

  return (
    <>
      <PageHead title="Work" sub={`${openCount} open. Move a card along with its arrow, or drag it on a computer.`}>
        {isOwner && (
          <select className="input w-auto min-w-[8.5rem] flex-1 sm:flex-none" aria-label="Filter by person" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.id === userId ? 'Me' : p.full_name || p.email}</option>)}
            <option value="none">Not assigned</option>
          </select>
        )}
        <select className="input w-auto min-w-[8.5rem] flex-1 sm:flex-none" aria-label="Filter by client" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-primary max-sm:w-full" onClick={() => open({ kind: 'task', clientId: client === 'all' ? undefined : client })}>
          <Plus size={16} weight="bold" />Add work
        </button>
      </PageHead>

      <div className="mb-3 md:hidden">
        <Segmented<TaskStatus> label="Stage" value={stage} onChange={setStage}
          options={TASK_STATUSES.map((s) => ({ id: s.id, label: s.label, count: total(s.id) }))} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {TASK_STATUSES.map((s) => {
          const list = column(s.id)
          return (
            <section key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id) }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => { setOver(null); move(e.dataTransfer.getData('text/plain'), s.id) }}
              className={`min-w-0 flex-col rounded-[0.9rem] p-2 md:flex ${stage === s.id ? 'flex' : 'hidden'} ${
                over === s.id ? 'bg-[color-mix(in_srgb,var(--focus)_16%,var(--sunk))]' : 'bg-sunk'
              }`}>
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <h2 className="text-[1.05rem] font-semibold">{s.label} <span className="font-sans text-[0.9rem] font-medium text-mute">{total(s.id)}</span></h2>
                {s.id !== 'done' && (
                  <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Add work to ${s.label}`}
                    onClick={() => open({ kind: 'task', status: s.id, clientId: client === 'all' ? undefined : client })}>
                    <Plus size={16} weight="bold" />
                  </button>
                )}
              </div>
              <div className="flex min-h-24 flex-col gap-2">
                {list.map((t) => (
                  <Card key={t.id} task={t} client={clientName(t.client_id)} person={t.assignee_id ? personName(t.assignee_id) : null}
                    onOpen={() => open({ kind: 'task', id: t.id })} onMove={(to) => move(t.id, to)} />
                ))}
                {list.length === 0 && <p className="px-2 py-4 text-[0.9rem] text-mute">{s.id === 'done' ? 'Finished work lands here.' : 'Nothing here.'}</p>}
                {s.id === 'done' && total('done') > list.length && <p className="px-2 pb-1 text-[0.85rem] text-mute">Showing the latest {list.length} of {total('done')}.</p>}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function Card({ task, client, person, onOpen, onMove }: {
  task: Task; client: string; person: string | null; onOpen(): void; onMove(to: TaskStatus): void
}) {
  const done = task.status === 'done'
  const next = NEXT[task.status]
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move' }}
      className="rounded-[0.6rem] border border-line bg-surface hover:border-mute md:cursor-grab md:active:cursor-grabbing">
      <button className="block w-full px-3 pt-3 pb-2 text-left" onClick={onOpen}>
        <span className={`block leading-snug font-medium ${done ? 'text-mute' : ''}`}>
          {task.priority === 'high' && !done && <Flag size={14} weight="fill" className="mr-1.5 inline -translate-y-px text-late" aria-label="High priority" />}
          {task.title}
        </span>
        <span className="mt-0.5 block truncate text-[0.87rem] text-mute">{client}</span>
      </button>
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <Due date={task.due_on} done={done} />
        <span className="flex-1" />
        {person ? <Avatar name={person} size={24} /> : <span className="text-[0.82rem] text-mute">Not assigned</span>}
        {next && (
          <button className="btn btn-sm h-7 gap-1 px-2 text-[0.82rem] max-md:h-8" title={next.label} onClick={() => onMove(next.to)}>
            {next.label}<ArrowRight size={13} weight="bold" />
          </button>
        )}
      </div>
    </article>
  )
}
