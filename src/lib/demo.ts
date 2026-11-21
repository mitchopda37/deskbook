// Sample data used only when Supabase is not connected yet.
// Nothing here is saved; a page reload resets it.
import type { Backend } from './backend'
import type { Data, Table } from './types'
import { addDays, iso, today } from './dates'

export const DEMO_USER = 'u-owner'
const W1 = 'ws-tidewater'
const W2 = 'ws-alder'
const t = today()
const now = new Date()
const monthDay = (offset: number, day: number) => iso(new Date(now.getFullYear(), now.getMonth() + offset, day))
const period = (offset: number) => monthDay(offset, 1).slice(0, 7)
const stamp = new Date().toISOString()
const longMonth = (offset: number) =>
  new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString(undefined, { month: 'long' })

let n = 0
const id = (p: string) => `${p}-${++n}`

const store = {
  workspaces: [
    { id: W1, name: 'Tidewater Studio', slug: 'tidewater', currency: 'USD', brand_name: 'Tidewater Studio', accent_color: '#3159c9', logo_url: '', owner_id: DEMO_USER, created_at: stamp, fx_rates: { EUR: 1.08, GBP: 1.27 } },
    { id: W2, name: 'Alder & Finch', slug: 'alder-finch', currency: 'GBP', brand_name: 'Alder & Finch', accent_color: '#8b593d', logo_url: '', owner_id: DEMO_USER, created_at: stamp, fx_rates: {} },
  ],
  workspace_members: [
    { id: 'wm-1', workspace_id: W1, user_id: DEMO_USER, role: 'owner', created_at: stamp },
    { id: 'wm-2', workspace_id: W1, user_id: 'u-maya', role: 'member', created_at: stamp },
    { id: 'wm-3', workspace_id: W1, user_id: 'u-dev', role: 'member', created_at: stamp },
    { id: 'wm-4', workspace_id: W1, user_id: 'u-sara', role: 'member', created_at: stamp },
    { id: 'wm-5', workspace_id: W2, user_id: DEMO_USER, role: 'owner', created_at: stamp },
  ],
  profiles: [
    { id: DEMO_USER, full_name: 'Alex Morgan', email: 'alex@tidewater.studio', role: 'owner', created_at: stamp },
    { id: 'u-maya', full_name: 'Maya Chen', email: 'maya@tidewater.studio', role: 'member', created_at: stamp },
    { id: 'u-dev', full_name: 'Dev Patel', email: 'dev@tidewater.studio', role: 'member', created_at: stamp },
    { id: 'u-sara', full_name: 'Sara Lind', email: 'sara@tidewater.studio', role: 'member', created_at: stamp },
    { id: 'u-new', full_name: 'Jonas Weber', email: 'jonas@gmail.com', role: 'pending', created_at: stamp },
  ],
  clients: [
    { id: 'c-harbor', name: 'Harbor Dental', contact_name: 'Dr. Priya Nair', email: 'priya@harbordental.com', phone: '+1 415 555 0142', billing_type: 'retainer', status: 'active', source: 'referral', pipeline_stage: 'active', notes: 'Posts go out Tuesday and Friday. Priya approves everything herself.', created_at: stamp },
    { id: 'c-north', name: 'Northwind Roasters', contact_name: 'Tom Becker', email: 'tom@northwind.coffee', phone: '+1 503 555 0188', billing_type: 'retainer', status: 'active', source: 'website', pipeline_stage: 'active', notes: '', created_at: stamp },
    { id: 'c-kestrel', name: 'Kestrel Architects', contact_name: 'Ines Duarte', email: 'ines@kestrel.archi', phone: '+1 212 555 0117', billing_type: 'project', status: 'active', source: 'partner', pipeline_stage: 'won', notes: 'Website rebuild. 50% upfront, 50% on launch. Billed in euros.', created_at: stamp, currency: 'EUR' },
    { id: 'c-lumen', name: 'Lumen Yoga', contact_name: 'Hana Sato', email: 'hana@lumenyoga.co', phone: '+1 310 555 0163', billing_type: 'retainer', status: 'active', source: 'social', pipeline_stage: 'active', notes: '', created_at: stamp },
    { id: 'c-atlas', name: 'Atlas Movers', contact_name: 'Marcus Reed', email: 'marcus@atlasmovers.com', phone: '+1 646 555 0109', billing_type: 'adhoc', status: 'active', source: 'outbound', pipeline_stage: 'qualified', notes: 'Slow to pay. Call, do not email.', created_at: stamp },
    { id: 'c-pine', name: 'Pine & Pixel', contact_name: 'Olu Adeyemi', email: 'olu@pinepixel.io', phone: '', billing_type: 'project', status: 'paused', source: 'marketplace', pipeline_stage: 'on_hold', notes: '', created_at: stamp },
  ],
  retainers: [
    { client_id: 'c-harbor', amount: 2400, billing_day: 5 },
    { client_id: 'c-north', amount: 1800, billing_day: 1 },
    { client_id: 'c-lumen', amount: 950, billing_day: 10 },
  ],
  tasks: [
    ['c-harbor', 'Write four posts for next week', 'doing', 'normal', 'u-maya', 0],
    ['c-harbor', 'Reply to Google reviews', 'todo', 'low', 'u-maya', 0],
    ['c-harbor', 'Monthly report for Priya', 'todo', 'high', DEMO_USER, 2],
    ['c-north', 'Holiday blend landing page', 'doing', 'high', 'u-dev', 1],
    ['c-north', 'Fix checkout shipping bug', 'review', 'high', 'u-dev', -1],
    ['c-north', 'Newsletter: roast of the month', 'todo', 'normal', 'u-sara', 3],
    ['c-kestrel', 'Homepage design, round two', 'review', 'normal', 'u-sara', 0],
    ['c-kestrel', 'Move 40 project pages to new CMS', 'todo', 'normal', 'u-dev', 6],
    ['c-kestrel', 'Send launch checklist', 'todo', 'normal', DEMO_USER, -2],
    ['c-lumen', 'Class schedule graphics for December', 'doing', 'normal', 'u-sara', 1],
    ['c-lumen', 'Set up gift card page', 'todo', 'low', null, 8],
    ['c-atlas', 'Update price list PDF', 'done', 'normal', 'u-maya', -3],
    ['c-harbor', 'Schedule last week\u2019s posts', 'done', 'normal', 'u-maya', -4],
    ['c-north', 'Photo edits for new bags', 'done', 'normal', 'u-sara', -2],
  ].map(([client_id, title, status, priority, assignee_id, due]) => ({
    id: id('t'), client_id, title, details: '', status, priority, assignee_id,
    due_on: addDays(t, due as number), completed_at: status === 'done' ? stamp : null,
    created_by: DEMO_USER, created_at: stamp,
  })) as Data['tasks'],
  invoices: [
    { id: 'i-1', client_id: 'c-harbor', title: `${longMonth(0)} retainer`, amount: 2400, issued_on: monthDay(0, 1), due_on: monthDay(0, 5), period: period(0), notes: '', created_at: stamp },
    { id: 'i-2', client_id: 'c-north', title: `${longMonth(0)} retainer`, amount: 1800, issued_on: monthDay(0, 1), due_on: addDays(t, 4), period: period(0), notes: '', created_at: stamp },
    { id: 'i-3', client_id: 'c-lumen', title: `${longMonth(0)} retainer`, amount: 950, issued_on: monthDay(0, 1), due_on: addDays(t, -6), period: period(0), notes: '', created_at: stamp },
    { id: 'i-4', client_id: 'c-kestrel', title: 'Website rebuild', amount: 6800, issued_on: monthDay(0, 3), due_on: addDays(t, 12), period: null, notes: '50% upfront, 50% on launch', created_at: stamp, currency: 'EUR' },
    { id: 'i-5', client_id: 'c-atlas', title: 'Price list and flyers', amount: 720, issued_on: monthDay(-1, 14), due_on: addDays(t, -19), period: null, notes: '', created_at: stamp },
    { id: 'i-6', client_id: 'c-harbor', title: `${longMonth(-1)} retainer`, amount: 2400, issued_on: monthDay(-1, 1), due_on: monthDay(-1, 5), period: period(-1), notes: '', created_at: stamp },
    { id: 'i-7', client_id: 'c-north', title: `${longMonth(-1)} retainer`, amount: 1800, issued_on: monthDay(-1, 1), due_on: monthDay(-1, 1), period: period(-1), notes: '', created_at: stamp },
    { id: 'i-8', client_id: 'c-lumen', title: `${longMonth(-1)} retainer`, amount: 950, issued_on: monthDay(-1, 1), due_on: monthDay(-1, 10), period: period(-1), notes: '', created_at: stamp },
  ],
  payments: [
    { id: 'p-1', invoice_id: 'i-1', amount: 2400, paid_on: monthDay(0, 4), method: 'Bank transfer', note: '', created_at: stamp },
    { id: 'p-2', invoice_id: 'i-2', amount: 1000, paid_on: monthDay(0, 6), method: 'Bank transfer', note: 'Rest after the 25th', created_at: stamp },
    { id: 'p-3', invoice_id: 'i-4', amount: 3400, paid_on: monthDay(0, 4), method: 'Bank transfer', note: 'Upfront half', created_at: stamp },
    { id: 'p-4', invoice_id: 'i-6', amount: 2400, paid_on: monthDay(-1, 6), method: 'Bank transfer', note: '', created_at: stamp },
    { id: 'p-5', invoice_id: 'i-7', amount: 1800, paid_on: monthDay(-1, 3), method: 'Card', note: '', created_at: stamp },
    { id: 'p-6', invoice_id: 'i-8', amount: 950, paid_on: monthDay(-1, 12), method: 'Cash', note: '', created_at: stamp },
    { id: 'p-7', invoice_id: 'i-5', amount: 200, paid_on: monthDay(-1, 28), method: 'Cash', note: '', created_at: stamp },
  ],
  followups: [
    { id: 'f-1', client_id: 'c-atlas', invoice_id: 'i-5', about: 'Call Marcus about the unpaid price list invoice', due_on: t, done: false, owner_id: DEMO_USER, created_at: stamp },
    { id: 'f-2', client_id: 'c-lumen', invoice_id: 'i-3', about: 'Remind Hana: this month\u2019s retainer is late', due_on: addDays(t, -1), done: false, owner_id: DEMO_USER, created_at: stamp },
    { id: 'f-3', client_id: 'c-kestrel', invoice_id: null, about: 'Ask Ines for the team photos', due_on: addDays(t, 1), done: false, owner_id: 'u-sara', created_at: stamp },
    { id: 'f-4', client_id: 'c-pine', invoice_id: null, about: 'Check if Olu wants to restart in January', due_on: addDays(t, 9), done: false, owner_id: DEMO_USER, created_at: stamp },
    { id: 'f-5', client_id: 'c-north', invoice_id: null, about: 'Send Tom the holiday campaign plan', due_on: addDays(t, -3), done: true, owner_id: DEMO_USER, created_at: stamp },
  ],
  automations: [
    { id: 'a-1', name: 'Flag work sent to review', trigger_table: 'tasks', trigger_field: 'status', trigger_value: 'review', action_field: 'priority', action_value: 'high', enabled: true, runs: 8, created_at: stamp },
    { id: 'a-2', name: 'Activate won clients', trigger_table: 'clients', trigger_field: 'pipeline_stage', trigger_value: 'won', action_field: 'status', action_value: 'active', enabled: true, runs: 3, created_at: stamp },
  ],
  invitations: [],
} as unknown as Data

// Every business record belongs to one isolated workspace.
for (const table of ['clients', 'retainers', 'tasks', 'invoices', 'payments', 'followups', 'automations', 'invitations'] as const) {
  for (const row of store[table] as any[]) row.workspace_id = W1
}

// Earlier months, fully paid, so the six-month chart has something to show.
;[-5, -4, -3, -2].forEach((m, k) => {
  const rows: [string, number][] = [['c-harbor', 2400], ['c-north', 1800], ['c-lumen', k > 1 ? 950 : 0], ['c-atlas', [900, 0, 1500, 400][k]]]
  rows.filter(([, amount]) => amount > 0).forEach(([client_id, amount]) => {
    const inv = id('i')
    store.invoices.push({ id: inv, workspace_id: W1, client_id, title: `${longMonth(m)} work`, amount, issued_on: monthDay(m, 1), due_on: monthDay(m, 10), period: null, notes: '', created_at: stamp, currency: 'USD' })
    store.payments.push({ id: id('p'), workspace_id: W1, invoice_id: inv, amount, paid_on: monthDay(m, 8), method: 'Bank transfer', note: '', created_at: stamp })
  })
})

const wait = () => new Promise((r) => setTimeout(r, 60))
const rows = (table: Table) => store[table] as any[]

export const demoBackend: Backend = {
  async list(table) {
    await wait()
    return structuredClone(store[table])
  },
  async insert(table, row) {
    await wait()
    const full = { id: id('n'), created_at: new Date().toISOString(), ...row }
    rows(table).push(full)
    return structuredClone(full)
  },
  async upsert(table, row, conflict) {
    await wait()
    const existing = rows(table).find((r) => r[conflict] === row[conflict])
    if (existing) Object.assign(existing, row)
    else rows(table).push({ ...row })
  },
  async update(table, pk, key, patch) {
    await wait()
    const row = rows(table).find((r) => r[pk] === key)
    if (row) Object.assign(row, patch)
  },
  async remove(table, pk, key) {
    await wait()
    const list = rows(table)
    const i = list.findIndex((r) => r[pk] === key)
    if (i >= 0) list.splice(i, 1)
    if (table === 'invoices') store.payments = store.payments.filter((p) => p.invoice_id !== key)
  },
}
