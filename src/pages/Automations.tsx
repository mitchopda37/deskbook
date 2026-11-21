import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle, Lightning, Pause, Play, Plus, Trash, X } from '@phosphor-icons/react'
import { useActions, useData } from '../lib/store'
import { CLIENT_SOURCES, PIPELINE_STAGES, TASK_STATUSES, type Automation } from '../lib/types'
import { AnimatedNumber, Empty, Field, PageHead } from '../ui/kit'

type Entity = Automation['trigger_table']
type RuleDraft = Omit<Automation, 'id' | 'workspace_id' | 'created_at' | 'runs'>

const taskFields = {
  status: { label: 'Work status', values: TASK_STATUSES },
  priority: { label: 'Priority', values: [{ id: 'low', label: 'Low' }, { id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }] },
}
const clientFields = {
  pipeline_stage: { label: 'Pipeline stage', values: PIPELINE_STAGES },
  status: { label: 'Client status', values: [{ id: 'active', label: 'Active' }, { id: 'paused', label: 'Paused' }, { id: 'ended', label: 'Ended' }] },
  source: { label: 'Lead source', values: CLIENT_SOURCES },
}

const fieldsFor = (entity: Entity) => entity === 'tasks' ? taskFields : clientFields
const field = (entity: Entity, key: string) => (fieldsFor(entity) as Record<string, { label: string; values: { id: string; label: string }[] }>)[key]
const valueLabel = (entity: Entity, key: string, value: string) => field(entity, key)?.values.find((x) => x.id === value)?.label ?? value

const blank = (): RuleDraft => ({
  name: '', trigger_table: 'tasks', trigger_field: 'status', trigger_value: 'review',
  action_field: 'priority', action_value: 'high', enabled: true,
})

export default function Automations() {
  const { automations } = useData()
  const { add, patch, remove } = useActions()
  const [editing, setEditing] = useState<Automation | null | 'new'>(null)
  const active = automations.filter((a) => a.enabled).length

  return (
    <>
      <PageHead title="Automations" sub={`${active} active ${active === 1 ? 'rule' : 'rules'}. Keep routine status changes moving without manual follow-up.`}>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} weight="bold" />New automation</button>
      </PageHead>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Active rules" value={active} icon={<Lightning size={18} weight="fill" />} />
        <Metric label="Total runs" value={automations.reduce((n, a) => n + a.runs, 0)} icon={<CheckCircle size={18} weight="fill" />} />
        <Metric label="Time saved" value={`${automations.reduce((n, a) => n + a.runs, 0) * 2} min`} icon={<Play size={18} weight="fill" />} />
      </div>

      {automations.length === 0 ? (
        <Empty title="No automations yet">Create a rule to update a client or work item whenever its status changes.</Empty>
      ) : (
        <div className="space-y-3">
          {automations.map((rule) => (
            <article key={rule.id} className={`panel group overflow-hidden transition ${rule.enabled ? '' : 'opacity-65'}`}>
              <div className="flex flex-wrap items-center gap-4 px-4 py-4 md:px-5">
                <button aria-label={rule.enabled ? 'Pause automation' : 'Enable automation'}
                  onClick={() => patch('automations', rule.id, { enabled: !rule.enabled }, rule.enabled ? 'Automation paused' : 'Automation enabled')}
                  className={`grid size-10 shrink-0 place-items-center rounded-[0.65rem] ${rule.enabled ? 'bg-primary text-primary-ink' : 'bg-sunk text-mute'}`}>
                  {rule.enabled ? <Lightning size={19} weight="fill" /> : <Pause size={19} weight="fill" />}
                </button>
                <button onClick={() => setEditing(rule)} className="min-w-[14rem] flex-1 text-left">
                  <span className="block font-display text-[1.05rem] font-semibold">{rule.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.88rem] text-mute">
                    <span className="tag">When {field(rule.trigger_table, rule.trigger_field)?.label} is {valueLabel(rule.trigger_table, rule.trigger_field, rule.trigger_value)}</span>
                    <ArrowRight size={15} />
                    <span className="tag tag-paid">Set {field(rule.trigger_table, rule.action_field)?.label} to {valueLabel(rule.trigger_table, rule.action_field, rule.action_value)}</span>
                  </span>
                </button>
                <div className="text-right">
                  <p className="font-display text-lg font-semibold">{rule.runs}</p>
                  <p className="text-[0.8rem] text-mute">runs</p>
                </div>
                <button className="btn btn-quiet btn-sm" onClick={() => setEditing(rule)}>Edit</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-8 rounded-[1rem] bg-[color-mix(in_srgb,var(--primary)_5%,var(--surface))] p-5 md:p-6">
        <p className="text-[0.8rem] font-semibold tracking-[0.12em] text-mute uppercase">How rules work</p>
        <h2 className="mt-2 text-xl font-semibold">A small trigger, then one exact action.</h2>
        <p className="mt-1 max-w-[65ch] text-mute">Rules run when a client or work item is changed in Deskbook. They update that same record instantly and keep a run count here for visibility.</p>
      </section>

      {editing && <RuleEditor existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSave={async (draft) => {
          if (editing === 'new') await add('automations', { ...draft, runs: 0 }, 'Automation created')
          else await patch('automations', editing.id, draft, 'Automation saved')
          setEditing(null)
        }}
        onDelete={editing !== 'new' ? async () => { await remove('automations', editing.id, 'Automation deleted'); setEditing(null) } : undefined} />}
    </>
  )
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="panel flex items-center gap-3 px-4 py-3.5"><span className="grid size-9 place-items-center rounded-[0.6rem] bg-sunk text-mute">{icon}</span><div><p className="font-display text-xl font-semibold leading-none">{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}</p><p className="mt-1 text-[0.83rem] text-mute">{label}</p></div></div>
}

function RuleEditor({ existing, onClose, onSave, onDelete }: { existing: Automation | null; onClose(): void; onSave(draft: RuleDraft): Promise<void>; onDelete?: () => Promise<void> }) {
  const [f, setF] = useState<RuleDraft>(existing ? {
    name: existing.name, trigger_table: existing.trigger_table, trigger_field: existing.trigger_field,
    trigger_value: existing.trigger_value, action_field: existing.action_field, action_value: existing.action_value, enabled: existing.enabled,
  } : blank())
  const [busy, setBusy] = useState(false)
  const fields = useMemo(() => fieldsFor(f.trigger_table) as Record<string, { label: string; values: { id: string; label: string }[] }>, [f.trigger_table])
  const changeEntity = (entity: Entity) => {
    const next = fieldsFor(entity) as Record<string, { label: string; values: { id: string; label: string }[] }>
    const keys = Object.keys(next)
    setF({ ...f, trigger_table: entity, trigger_field: keys[0], trigger_value: next[keys[0]].values[0].id, action_field: keys[1] ?? keys[0], action_value: next[keys[1] ?? keys[0]].values[0].id })
  }
  const setField = (kind: 'trigger' | 'action', key: string) => {
    const first = fields[key].values[0].id
    setF({ ...f, [`${kind}_field`]: key, [`${kind}_value`]: first })
  }
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); await onSave({ ...f, name: f.name.trim() }); setBusy(false) }

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden">
      <div className="scrim absolute inset-0 bg-[rgb(8_13_30/0.52)]" onClick={onClose} />
      <form onSubmit={submit} className="sheet relative flex h-full w-full max-w-[520px] flex-col bg-surface shadow-[-24px_0_70px_rgb(8_13_30/0.22)]">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="grid size-10 place-items-center rounded-[0.7rem] bg-primary text-primary-ink"><Lightning size={20} weight="fill" /></div>
          <div className="flex-1"><h2 className="text-xl font-semibold">{existing ? 'Edit automation' : 'New automation'}</h2><p className="text-[0.85rem] text-mute">Build a trigger and its result</p></div>
          <button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <Field label="Automation name"><input className="input" required autoFocus placeholder="e.g. Flag work sent to review" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Applies to">
            <div className="grid grid-cols-2 gap-2">
              {(['tasks', 'clients'] as Entity[]).map((entity) => <button type="button" key={entity} onClick={() => changeEntity(entity)} className={`btn ${f.trigger_table === entity ? 'btn-primary' : ''}`}>{entity === 'tasks' ? 'Work items' : 'Clients'}</button>)}
            </div>
          </Field>
          <RuleStep number="01" title="When this happens">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Field"><select className="input" value={f.trigger_field} onChange={(e) => setField('trigger', e.target.value)}>{Object.entries(fields).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
              <Field label="Changes to"><select className="input" value={f.trigger_value} onChange={(e) => setF({ ...f, trigger_value: e.target.value })}>{fields[f.trigger_field].values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
            </div>
          </RuleStep>
          <RuleStep number="02" title="Then do this">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Set field"><select className="input" value={f.action_field} onChange={(e) => setField('action', e.target.value)}>{Object.entries(fields).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
              <Field label="To"><select className="input" value={f.action_value} onChange={(e) => setF({ ...f, action_value: e.target.value })}>{fields[f.action_field].values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
            </div>
          </RuleStep>
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-5 py-4">
          <button className="btn btn-primary" disabled={busy}>{existing ? 'Save automation' : 'Create automation'}</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          {onDelete && <button type="button" className="btn btn-danger ml-auto" onClick={() => confirm('Delete this automation?') && onDelete()}><Trash size={16} />Delete</button>}
        </footer>
      </form>
    </div>
  )
}

function RuleStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <section className="rounded-[0.85rem] bg-sunk p-4"><div className="mb-3 flex items-center gap-2"><span className="font-mono text-[0.75rem] font-bold text-mute">{number}</span><h3 className="font-semibold">{title}</h3></div>{children}</section>
}
