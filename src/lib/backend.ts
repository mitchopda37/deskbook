import { createClient } from '@supabase/supabase-js'
import type { Data, Table } from './types'
import { demoBackend } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Read the landing URL before Supabase consumes and clears the auth tokens in it.
const landing = new URLSearchParams(window.location.search)
const landingHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
/** True when the person arrived from an emailed invitation and still has to pick a name and password. */
export const arrivedFromInvite = landing.has('welcome') && !landingHash.has('error')
/** Set when an emailed link was expired or already used. */
export const authLinkError = landingHash.get('error_description')?.replace(/\+/g, ' ') ?? ''

/** Null until the two env vars are set. Without them the app runs on sample data in memory. */
export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } })
  : null
export const isDemo = !supabase

export type InviteEmailResult = { ok: true; kind: 'invite' | 'magiclink' } | { ok: false; reason: string }

/**
 * Emails an invitation through the /api/invite Vercel function, which uses Supabase's
 * own mailer. Falls back with a reason when running locally without that function.
 */
export async function emailInvitation(invitationId: string): Promise<InviteEmailResult> {
  if (!supabase) return { ok: false, reason: 'Demo mode does not send email. The link was copied instead.' }
  const { data } = await supabase.auth.getSession()
  try {
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ invitationId }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, kind: body.sent === 'magiclink' ? 'magiclink' : 'invite' }
    if (res.status === 404) return { ok: false, reason: 'Invite emails are sent by the Vercel deployment. Running locally, so the link was copied instead.' }
    return { ok: false, reason: body.error || 'The invitation email could not be sent. The link was copied instead.' }
  } catch {
    return { ok: false, reason: 'Could not reach the email service. The link was copied instead.' }
  }
}

export interface Backend {
  list<T extends Table>(table: T): Promise<Data[T]>
  insert(table: Table, row: Record<string, unknown>): Promise<any>
  upsert(table: Table, row: Record<string, unknown>, conflict: string): Promise<void>
  update(table: Table, pk: string, id: string | number, patch: Record<string, unknown>): Promise<void>
  remove(table: Table, pk: string, id: string | number): Promise<void>
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

const live: Backend = {
  async list(table) {
    const { data, error } = await supabase!.from(table).select('*')
    fail(error)
    // numeric columns arrive as strings from Postgres
    return (data ?? []).map((r: any) => ('amount' in r ? { ...r, amount: Number(r.amount) } : r)) as any
  },
  async insert(table, row) {
    const { data, error } = await supabase!.from(table).insert(row).select().single()
    fail(error)
    return data
  },
  async upsert(table, row, conflict) {
    const { error } = await supabase!.from(table).upsert(row, { onConflict: conflict })
    fail(error)
  },
  async update(table, pk, id, patch) {
    const { error } = await supabase!.from(table).update(patch).eq(pk, id)
    fail(error)
  },
  async remove(table, pk, id) {
    const { error } = await supabase!.from(table).delete().eq(pk, id)
    fail(error)
  },
}

export const backend: Backend = supabase ? live : demoBackend
