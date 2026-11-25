export type Role = 'owner' | 'member' | 'pending'
export type BillingType = 'retainer' | 'project' | 'adhoc'
export type ClientStatus = 'active' | 'paused' | 'ended'
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export type ClientSource = 'referral' | 'website' | 'social' | 'outbound' | 'marketplace' | 'partner' | 'event' | 'other'
export type PipelineStage = 'lead' | 'qualified' | 'proposal' | 'won' | 'active' | 'on_hold' | 'lost'

export interface Profile { id: string; full_name: string; email: string; role: Role; created_at: string }
export interface Workspace {
  id: string; name: string; slug: string; currency: string; brand_name: string
  accent_color: string; logo_url: string; owner_id: string | null; created_at: string
  /** How much one unit of each foreign currency is worth in `currency`, e.g. { EUR: 1.08 } for a USD workspace. */
  fx_rates: Record<string, number>
}
export interface WorkspaceMember { id: string; workspace_id: string; user_id: string; role: 'owner' | 'member'; created_at: string }
export interface Client {
  id: string; workspace_id: string; name: string; contact_name: string; email: string; phone: string
  billing_type: BillingType; status: ClientStatus; source: ClientSource; pipeline_stage: PipelineStage
  notes: string; created_at: string
  /** Billing currency. Null means the workspace currency. */
  currency: string | null
}
export interface Retainer { workspace_id: string; client_id: string; amount: number; billing_day: number }
export interface Task {
  id: string; workspace_id: string; client_id: string; title: string; details: string; status: TaskStatus; priority: Priority
  assignee_id: string | null; due_on: string | null; completed_at: string | null
  created_by: string | null; created_at: string
}
export interface Invoice {
  id: string; workspace_id: string; client_id: string; title: string; amount: number; issued_on: string; due_on: string
  period: string | null; notes: string; created_at: string
  /** Currency the invoice is billed and paid in. Payments always follow their invoice. */
  currency: string
}
export interface Payment {
  id: string; workspace_id: string; invoice_id: string; amount: number; paid_on: string; method: string; note: string; created_at: string
}
export interface Followup {
  id: string; workspace_id: string; client_id: string; invoice_id: string | null; about: string; due_on: string
  done: boolean; owner_id: string | null; created_at: string
}
export interface Automation {
  id: string; workspace_id: string; name: string; trigger_table: 'tasks' | 'clients'; trigger_field: string; trigger_value: string
  action_field: string; action_value: string; enabled: boolean; runs: number; created_at: string
}
export interface Invitation {
  id: string; workspace_id: string; email: string; token: string; status: 'pending' | 'accepted' | 'revoked'
  role: 'owner' | 'member'; invited_by: string | null; expires_at: string; created_at: string
}

export type AssignmentStatus = 'new' | 'in_progress' | 'review' | 'delivered' | 'cancelled'
export interface Assignment {
  id: string; workspace_id: string; title: string; student_name: string; student_contact: string; institution: string
  subject: string; word_count: number | null; details: string; status: AssignmentStatus; assignee_id: string | null
  /** ISO timestamp: assignments are due at a time of day, not just a date. */
  deadline: string; delivered_at: string | null; created_by: string | null; created_at: string
}
/** The agreed price. Only admins and sub admins can read it. */
export interface AssignmentFee { assignment_id: string; workspace_id: string; amount: number; currency: string; advance_due: number }
export type AssignmentPaymentKind = 'advance' | 'balance'
export interface AssignmentPayment {
  id: string; workspace_id: string; assignment_id: string; amount: number; kind: AssignmentPaymentKind
  paid_on: string; method: string; note: string; created_at: string
}

export interface Data {
  profiles: Profile[]; workspaces: Workspace[]; workspace_members: WorkspaceMember[]; clients: Client[]; retainers: Retainer[]
  tasks: Task[]; invoices: Invoice[]; payments: Payment[]; followups: Followup[]; automations: Automation[]; invitations: Invitation[]
  assignments: Assignment[]; assignment_fees: AssignmentFee[]; assignment_payments: AssignmentPayment[]
}
export type Table = keyof Data

export type PayState = 'paid' | 'partial' | 'unpaid'
/** A payment with `amount` converted to the workspace currency; `native_amount` is in the invoice currency. */
export interface Received extends Payment { native_amount: number; currency: string }

/**
 * An invoice with its payments worked out. `amount`, `paid` and `remaining` are converted to the
 * workspace currency so they can be added up safely; `native` holds the same figures in `currency`.
 */
export interface Bill extends Invoice {
  paid: number; remaining: number; state: PayState; overdue: boolean; daysLate: number
  payments: Received[]
  native: { amount: number; paid: number; remaining: number }
}

/**
 * An assignment with its money and timing worked out. Money in `native` is in the fee's currency;
 * `base` is the same converted to the workspace currency so it can be added up.
 */
export interface AssignmentView extends Assignment {
  priced: boolean
  currency: string
  native: { amount: number; paid: number; remaining: number; advanceDue: number; advancePaid: number; balancePaid: number }
  base: { amount: number; paid: number; remaining: number }
  payState: PayState
  /** Asked-for advance not fully received yet. */
  advanceShort: boolean
  payments: (AssignmentPayment & { currency: string; base_amount: number })[]
  /** Still being worked on: not delivered or cancelled. */
  open: boolean
  /** Open and past its deadline. */
  late: boolean
  /** Hours until the deadline; negative when past. */
  hoursLeft: number
  /** Delivered by the deadline (null when not delivered). */
  onTime: boolean | null
}

export const ASSIGNMENT_STATUSES: { id: AssignmentStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'review', label: 'In review' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
]

/** Most-used first, so the common ones (including AUD) are at the top of every list. */
export const CURRENCIES = [
  'USD', 'AUD', 'GBP', 'EUR', 'INR', 'CAD', 'NZD', 'AED', 'SAR', 'QAR', 'KWD', 'ILS', 'SGD', 'HKD', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'TRY', 'JPY', 'CNY', 'KRW', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'PKR', 'BDT', 'LKR', 'NPR', 'NGN', 'KES', 'EGP', 'ZAR',
  'BRL', 'MXN', 'ARS', 'COP', 'CLP',
]

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'review', label: 'In review' },
  { id: 'done', label: 'Done' },
]
export const BILLING_LABEL: Record<BillingType, string> = {
  retainer: 'Monthly retainer', project: 'Project', adhoc: 'As needed',
}

export const CLIENT_SOURCES: { id: ClientSource; label: string }[] = [
  { id: 'referral', label: 'Referral' }, { id: 'website', label: 'Website' },
  { id: 'social', label: 'Social media' }, { id: 'outbound', label: 'Outbound' },
  { id: 'marketplace', label: 'Marketplace' }, { id: 'partner', label: 'Partner' },
  { id: 'event', label: 'Event' }, { id: 'other', label: 'Other' },
]

export const PIPELINE_STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'lead', label: 'New lead' }, { id: 'qualified', label: 'Qualified' },
  { id: 'proposal', label: 'Proposal sent' }, { id: 'won', label: 'Won' },
  { id: 'active', label: 'Active delivery' }, { id: 'on_hold', label: 'On hold' },
  { id: 'lost', label: 'Lost' },
]

const currencyNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'currency' }) } catch { return null }
})()
/** "AUD · Australian Dollar", so currencies can be found by country, not just by code. */
export const currencyLabel = (code: string) => {
  const name = currencyNames?.of(code)
  return name && name !== code ? `${code} · ${name}` : code
}
