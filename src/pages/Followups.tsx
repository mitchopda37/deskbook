import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { useActions, useData, useSheet } from '../lib/store'
import { addDays, today } from '../lib/dates'
import type { Followup } from '../lib/types'
import { Empty, PageHead } from '../ui/kit'
import { FollowRow } from './Today'

export default function Followups() {
  const { followups } = useData()
  const { open } = useSheet()
  const [showDone, setShowDone] = useState(false)
  const t = today()
  const todo = followups.filter((f) => !f.done).sort((a, b) => a.due_on.localeCompare(b.due_on))
  const groups: { title: string; tone?: string; items: Followup[]; snooze: boolean }[] = [
    { title: 'Overdue', tone: 'text-late', items: todo.filter((f) => f.due_on < t), snooze: true },
    { title: 'Today', items: todo.filter((f) => f.due_on === t), snooze: true },
    { title: 'Coming up', items: todo.filter((f) => f.due_on > t), snooze: false },
  ]
  const done = followups.filter((f) => f.done).sort((a, b) => b.due_on.localeCompare(a.due_on)).slice(0, 20)

  return (
    <>
      <PageHead title="Follow-ups" sub="Calls to make and messages to send, so no client or payment goes quiet.">
        <button className="btn btn-primary" onClick={() => open({ kind: 'followup' })}><Plus size={16} weight="bold" />Add follow-up</button>
      </PageHead>

      {todo.length === 0 && <Empty title="Nothing to follow up">Add one when you are waiting on a client for a reply, a file or a payment.</Empty>}

      <div className="max-w-3xl space-y-7">
        {groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.title}>
            <h2 className={`mb-2.5 text-xl font-semibold ${g.tone ?? ''}`}>{g.title} <span className="font-sans text-[0.95rem] font-medium text-mute">{g.items.length}</span></h2>
            <ul className="panel divide-y divide-line">
              {g.items.map((f) => (
                <FollowRow key={f.id} item={f} extra={g.snooze ? <Snooze id={f.id} /> : undefined} />
              ))}
            </ul>
          </section>
        ))}

        {done.length > 0 && (
          <section>
            <button className="btn btn-quiet -ml-2.5" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
              {showDone ? 'Hide' : 'Show'} done ({done.length})
            </button>
            {showDone && <ul className="panel mt-2 divide-y divide-line">{done.map((f) => <FollowRow key={f.id} item={f} />)}</ul>}
          </section>
        )}
      </div>
    </>
  )
}

function Snooze({ id }: { id: string }) {
  const { patch } = useActions()
  const move = (days: number, label: string) => patch('followups', id, { due_on: addDays(today(), days) }, `Moved to ${label}`)
  return (
    <div className="mt-1 flex items-center gap-1 pl-[2.2rem] text-[0.85rem] text-mute">
      Not now?
      <button className="btn btn-quiet btn-sm h-7 px-2" onClick={() => move(1, 'tomorrow')}>Tomorrow</button>
      <button className="btn btn-quiet btn-sm h-7 px-2" onClick={() => move(7, 'next week')}>Next week</button>
    </div>
  )
}
