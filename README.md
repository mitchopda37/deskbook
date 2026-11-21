# Deskbook

Clients, daily work, team, follow-ups and payments in one place.
Built with React + Vite, Supabase (database, login, security) and deployed on Vercel. Nothing else.

Deskbook supports multiple isolated, white-label client workspaces from one agency account.

## Try it first (no setup)

```bash
npm install
npm run dev
```

Without Supabase keys the app shows its secure login and uses sample data after you choose **Use demo account**. Nothing is saved in this mode.

## Go live

### 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor > New query**, paste all of `supabase/schema.sql`, press **Run**.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key.
4. Optional, for a faster first login: **Authentication > Sign In / Providers > Email**, turn off "Confirm email". Leave it on if you want every team member to verify their address.

### 2. Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New > Project**, import the repository. Vercel detects Vite by itself.
3. Add three environment variables (**Settings > Environment Variables**, tick Production and Preview):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** key from the same Supabase page. It is used only by `api/invite.ts` on the server to send invitation emails. Never give it a `VITE_` prefix and never put it in the frontend; anything with `VITE_` is visible to every visitor.
   - Optional: `SITE_URL` = your custom domain (for example `https://app.yourstudio.com`) if invitation links should always point there.
4. Deploy. `vercel.json` already sets the build, the page routing, the `/api` function and security headers.
5. Back in Supabase: **Authentication > URL Configuration**, set **Site URL** to your Vercel address and add `https://your-app.vercel.app/**` under **Redirect URLs** (and your custom domain the same way). Invitation and password-reset links only return to addresses on this list.

### 4. Email (invitations and password resets)

Deskbook sends emails through Supabase Auth, so there is no extra email service in the code.

1. Supabase's built-in mailer is for testing only: it is heavily rate-limited and may only deliver to your own team's addresses. For real use open **Project Settings > Authentication > SMTP Settings**, turn on **Custom SMTP** and enter the details from any email provider (Resend, Postmark, SendGrid, Amazon SES, Google Workspace SMTP and so on).
2. Optional: **Authentication > Emails > Invite user** lets you change the invitation email. `{{ .Data.workspace_name }}` inserts the client workspace's brand name and `{{ .ConfirmationURL }}` is the link.

To check it works, invite your own second email address from **Team**.

For local work with real data, copy `.env.example` to `.env` and fill in the same two values.

### 3. Create the owner account

Deskbook is invite-only and does not expose public registration. In Supabase, open **Authentication > Users > Add user** and create the first account. The database automatically makes the first account the owner. Sign in with that account, then open Settings and set your business name and currency.

## Adding employees

Open **Team**, enter the person's email, pick **Team member** or **Workspace admin**, and press **Send invite**.

- **New person**: Supabase emails them an invitation link. Opening it signs them in and asks for their name and a password, then drops them into that workspace.
- **Already has an account** (for example in another client workspace): they get access straight away and receive a sign-in link by email.
- If the email cannot be sent (no service key, SMTP not set up, or running locally with `npm run dev`), Deskbook says why and copies a single-use link instead, which you can send yourself. **Email again** and the copy button stay available under Pending invitations.

Invitations expire after seven days and are tied to that email address. The database rejects every sign-up that does not have a valid invitation, and only the platform owner or that workspace's admin can send one.

| | Owner | Team member |
|---|---|---|
| Clients | add, edit, delete | read only |
| Work | everything | only work assigned to them |
| Follow-ups | everything | only their own |
| Invoices, payments, retainer amounts | everything | no access at all |
| Team, business settings | yes | no |
| Automations and invitations | yes | no |

These rules are enforced in the database (row-level security in `schema.sql`), not just hidden in the screen.

## Agency console and white-label workspaces

The platform owner sees **Agency > Workspaces** in the sidebar. From there you can:

- Create a separate workspace for each client.
- Switch between every client account without signing out.
- Give each workspace its own name, URL slug, currency, accent colour and logo.
- Open workspace-specific dashboards, teams, pipelines, invoices, reports and automations.
- See client, member and open-work counts across the portfolio.

Every operational table carries a `workspace_id`. Supabase row-level security checks workspace membership on every request, so a client's team cannot read another workspace even if they call the API directly. Existing single-workspace records are moved into the initial workspace when the updated schema is run.

## How the money side works

- An **invoice** is an amount a client owes. A **payment** is money received against it.
- Record as many payments as you like on one invoice. Paid, part paid, remaining and overdue are worked out from them, so they can never disagree with each other.
- A **retainer client** has a monthly amount and a due day. Each month the Invoices page shows one button that creates all missing retainer invoices. A month can never be billed twice for the same client.
- Solid green always means received. Hatched gold means not received yet. Hatched red means overdue. No other colour is used for money.

## Multiple currencies

- Each workspace has a **main currency** (Settings). Totals, the Today board and Reports are shown in it.
- Each **client** can be billed in its own currency (client form > Billing currency). Retainers and new invoices for that client use it.
- Each **invoice** keeps its own currency, chosen when it is created. Payments are always recorded in the invoice's currency, and the currency cannot change once a payment exists.
- **Exchange rates** live in Settings: "1 EUR = 1.08 USD". They are used only to add things up. Every invoice and payment keeps its original amount, and invoice rows show both, for example "€3,400 remaining · about $3,672".
- If an invoice uses a currency with no rate, Invoices, Today and Reports show a warning until you add one.
- CSV exports include the currency, the original amount and the converted amount.

## Reports

Reports (owner only) answers "what came in, and when".

- Pick **This month, Last month, Last 3 months, This year**, or any two dates. The arrows step to the earlier or later period of the same length.
- **By month**: received, billed and still unpaid for each month. Click a month to see its payments day by day.
- **By date**: every payment under the day it arrived, with a total per day.
- **By client** and **By method** (bank transfer, UPI, cash and so on).
- **Export CSV** saves the view you are looking at. **Print or save PDF** gives a clean page without the menu.

"Received" counts payments by the date the money arrived. "Billed" and "Still unpaid" count invoices by the date they were issued.

## Other things worth knowing

- **Search**: press Ctrl+K (Cmd+K on Mac) or the search button to find any client, work item or invoice, or to start a new one.
- **Pipeline**: every client has a lead source and a pipeline stage, both searchable and filterable from Clients.
- **Automations**: owners can create rules such as “when work moves to review, set priority to high.” Rules run on the changed record and keep a visible run count.
- **Motion**: number counters, payment progress and charts animate with Motion while respecting the device's reduced-motion setting.
- **Phones**: bottom tab bar, a More sheet for the rest, and the work board shows one stage at a time with a button on each card to move it along.
- **Menu**: the button at the top of the side menu shrinks it to icons.
- The database refuses a payment larger than what is still owed on an invoice.

## What was tested

- The production TypeScript and Vite build passes.
- The app was visually checked in a real browser on sample data, including secure login, the work board, navigation and automations.
- Every page was checked at 320, 360 and 390 px wide for sideways scrolling.

- Agency console, switching between workspaces, and that no data from one workspace shows in another.
- Multi-currency on sample data: a EUR client inside a USD workspace, converted totals, recording a EUR payment, removing and restoring a rate.
- The invite function type-checks.

Not tested here: a live Supabase project (invitation, sign-in and password reset emails) and a real Vercel deploy. After you set up, invite your own second address once to confirm emails arrive.

**Updating an existing install:** run the whole `supabase/schema.sql` again in the SQL editor. It only adds what is missing and keeps your data. Existing invoices get the workspace currency.

## Where things are

```
supabase/schema.sql   tables, triggers, security rules (safe to re-run after updates)
api/invite.ts         Vercel function that emails invitations through Supabase Auth
vercel.json           build, page routing, security headers
src/lib/backend.ts    Supabase client (falls back to sample data when keys are missing)
src/lib/store.tsx     login, data loading, saving, toasts
src/lib/demo.ts       sample data
src/ui/               shell, drawers/forms, shared pieces
src/ui/Search.tsx      Ctrl+K search
src/pages/            Today, Work, Clients, Invoices, Reports, Follow-ups, Team, Automations, Workspaces, Settings
src/index.css         colours and component styles (light and dark)
```

Icons: Phosphor Icons. Motion: Motion for React. Type: Bricolage Grotesque and Instrument Sans, bundled with the app.
