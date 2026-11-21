// Vercel serverless function: turns a one-time invite link into an account, without any email.
//
// The invitee sends the token from their link, their name and the password they chose.
// The account is created already confirmed, so nothing has to be emailed. The database
// trigger (handle_new_user) checks the token again and marks the invitation used, which is
// what makes the link work only once. The service-role key never leaves this function.
//
// Required environment variables (Vercel > Project > Settings > Environment Variables):
//   VITE_SUPABASE_URL          same value the frontend uses
//   SUPABASE_SERVICE_ROLE_KEY  Supabase > Project Settings > API > service_role (secret)

import { createClient } from '@supabase/supabase-js'

declare const process: { env: Record<string, string | undefined> }

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const GONE = 'This invite link has expired or was already used. Ask your workspace admin for a new one.'

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return json(501, { code: 'not_configured', error: 'Invite links are not set up on the server yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.' })
  }

  let body: { token?: unknown; name?: unknown; password?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* handled below */
  }
  const token = String(body.token ?? '').trim()
  const name = String(body.name ?? '').trim().slice(0, 120)
  const password = String(body.password ?? '')
  if (!token) return json(400, { error: 'This link is missing its invite code.' })
  if (!name) return json(400, { error: 'Enter your name.' })
  if (password.length < 8) return json(400, { error: 'Use a password of at least 8 characters.' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: invite } = await admin
    .from('invitations')
    .select('id, email, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at).getTime() <= Date.now()) {
    return json(410, { error: GONE })
  }

  const email = String(invite.email).trim().toLowerCase()
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) {
    return json(409, { code: 'has_account', error: 'You already have an account. Sign in with your password to join this workspace.' })
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, invite_token: token },
  })
  if (error) {
    // Two tabs racing on the same link: the trigger rejects the second one.
    const { data: again } = await admin.from('invitations').select('status').eq('id', invite.id).maybeSingle()
    if (again?.status !== 'pending') return json(410, { error: GONE })
    return json(400, { error: error.message })
  }
  return json(200, { email })
}
