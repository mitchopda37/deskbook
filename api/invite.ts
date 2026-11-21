// Vercel serverless function: emails a workspace invitation through Supabase Auth.
//
// The browser only sends the invitation id and the signed-in person's access token.
// Row-level security decides whether that person may read the invitation, so only the
// platform owner or an admin of that workspace can trigger an email. The service-role
// key never leaves this function.
//
// Required environment variables (Vercel > Project > Settings > Environment Variables):
//   VITE_SUPABASE_URL          same value the frontend uses
//   VITE_SUPABASE_ANON_KEY     same value the frontend uses
//   SUPABASE_SERVICE_ROLE_KEY  Supabase > Project Settings > API > service_role (secret)
// Optional:
//   SITE_URL                   e.g. https://app.yourdomain.com, if links should not use the request host

import { createClient } from '@supabase/supabase-js'

declare const process: { env: Record<string, string | undefined> }

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export async function POST(request: Request): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return json(500, {
      error: 'Invite emails are not configured yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables and redeploy. The link was copied instead.',
    })
  }

  const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json(401, { error: 'Your session expired. Sign in again, then resend the invitation.' })

  let invitationId = ''
  try {
    invitationId = String((await request.json())?.invitationId ?? '')
  } catch {
    /* handled below */
  }
  if (!invitationId) return json(400, { error: 'Missing invitation id.' })

  const options = { auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' as const } }

  // Read the invitation as the caller. RLS hides it unless they own that workspace.
  const asCaller = createClient(url, anonKey, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: invite, error: readError } = await asCaller
    .from('invitations')
    .select('id, workspace_id, email, token, role, status, expires_at')
    .eq('id', invitationId)
    .maybeSingle()
  if (readError || !invite) return json(403, { error: 'You can only send invitations for workspaces you manage.' })
  if (invite.status !== 'pending' || new Date(invite.expires_at).getTime() < Date.now()) {
    return json(409, { error: 'This invitation is no longer pending. Create a new one.' })
  }

  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '')
  const admin = createClient(url, serviceKey, options)
  const email = String(invite.email).trim().toLowerCase()

  const { data: workspace } = await admin.from('workspaces').select('name, brand_name').eq('id', invite.workspace_id).maybeSingle()
  const workspaceName = workspace?.brand_name || workspace?.name || 'Deskbook'

  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()

  if (!existing) {
    // New person: Supabase creates the account and sends its "Invite user" email.
    // The database trigger checks invite_token against the invitation before letting them in.
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invite_token: invite.token, workspace_name: workspaceName },
      redirectTo: `${site}/?welcome=1`,
    })
    if (error) return json(502, { error: `Supabase could not send the email: ${error.message}. The link was copied instead.` })
    return json(200, { sent: 'invite' })
  }

  // Already has an account (for example in another workspace): grant access, then email a sign-in link.
  const { error: memberError } = await admin
    .from('workspace_members')
    .upsert({ workspace_id: invite.workspace_id, user_id: existing.id, role: invite.role }, { onConflict: 'workspace_id,user_id', ignoreDuplicates: true })
  if (memberError) return json(500, { error: `Could not add them to the workspace: ${memberError.message}` })
  await admin.from('invitations').update({ status: 'accepted' }).eq('id', invite.id)

  // Someone who never finished signing up still needs to choose a name and password.
  const { data: authUser } = await admin.auth.admin.getUserById(existing.id)
  const onboarded = Boolean(authUser?.user?.last_sign_in_at)
  const mailer = createClient(url, anonKey, options)
  const { error: otpError } = await mailer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: onboarded ? site : `${site}/?welcome=1` },
  })
  if (otpError) return json(502, { error: `Access was granted, but the sign-in email failed: ${otpError.message}` })
  return json(200, { sent: 'magiclink' })
}
