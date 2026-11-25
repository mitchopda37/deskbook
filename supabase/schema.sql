-- Deskbook schema
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
--
-- Access model
--   platform owner (profiles.role = 'owner')  "Admin", the agency. Sees every workspace and the
--                   Agency console. The only role that invites or removes people or sets branding.
--   workspace owner (workspace_members.role = 'owner')  "Sub admin". Runs their own workspace
--                   (clients, money, automations, currency), nothing outside it.
--   workspace member  sees that workspace's clients, plus the work and follow-ups assigned to them.
--                   Never sees money.
-- The first account created becomes the platform owner. Everyone after that needs an invitation
-- tied to one workspace; sign-ups without a valid invitation are rejected.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'pending' check (role in ('owner', 'member', 'pending')),
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace (
  id        int primary key default 1 check (id = 1),
  name      text not null default 'My studio',
  currency  text not null default 'USD'
);
insert into public.workspace (id) values (1) on conflict do nothing;

-- Multi-workspace layer. The singular `workspace` table above is retained only
-- as a migration source for older Deskbook installations.
create table if not exists public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  currency      text not null default 'USD',
  brand_name    text not null,
  accent_color  text not null default '#3159c9',
  logo_url      text not null default '',
  owner_id      uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces on delete cascade,
  user_id       uuid not null references public.profiles on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

insert into public.workspaces (name, slug, currency, brand_name)
select w.name, 'main-workspace', w.currency, w.name from public.workspace w
where not exists (select 1 from public.workspaces);

do $$
declare default_workspace uuid; existing_owner uuid;
begin
  select id into default_workspace from public.workspaces order by created_at limit 1;
  select id into existing_owner from public.profiles where role = 'owner' order by created_at limit 1;
  if existing_owner is not null then
    update public.workspaces set owner_id = existing_owner where id = default_workspace and owner_id is null;
    insert into public.workspace_members (workspace_id, user_id, role)
      select default_workspace, p.id, case when p.role = 'owner' then 'owner' else 'member' end
      from public.profiles p where p.role in ('owner', 'member') on conflict do nothing;
  end if;
end $$;

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text not null default '',
  email         text not null default '',
  phone         text not null default '',
  billing_type  text not null default 'project' check (billing_type in ('retainer', 'project', 'adhoc')),
  status        text not null default 'active' check (status in ('active', 'paused', 'ended')),
  source        text not null default 'other' check (source in ('referral', 'website', 'social', 'outbound', 'marketplace', 'partner', 'event', 'other')),
  pipeline_stage text not null default 'lead' check (pipeline_stage in ('lead', 'qualified', 'proposal', 'won', 'active', 'on_hold', 'lost')),
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

-- Keep existing installations forward-compatible when this schema is re-run.
alter table public.clients add column if not exists source text not null default 'other';
alter table public.clients add column if not exists pipeline_stage text not null default 'lead';

-- Retainer amounts live in their own table so team members cannot read them.
create table if not exists public.retainers (
  client_id    uuid primary key references public.clients on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0),
  billing_day  int not null default 1 check (billing_day between 1 and 28)
);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients on delete cascade,
  title         text not null,
  details       text not null default '',
  status        text not null default 'todo' check (status in ('todo', 'doing', 'review', 'done')),
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assignee_id   uuid references public.profiles on delete set null,
  due_on        date,
  completed_at  timestamptz,
  created_by    uuid default auth.uid() references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  title       text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  issued_on   date not null default current_date,
  due_on      date not null default current_date,
  period      text,                       -- 'YYYY-MM' for retainer invoices, so a month is never billed twice
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  unique (client_id, period)
);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  invoice_id  uuid references public.invoices on delete set null,
  about       text not null,
  due_on      date not null default current_date,
  done        boolean not null default false,
  owner_id    uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.automations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  trigger_table  text not null check (trigger_table in ('tasks', 'clients')),
  trigger_field  text not null,
  trigger_value  text not null,
  action_field   text not null,
  action_value   text not null,
  enabled        boolean not null default true,
  runs           int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token       text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  role        text not null default 'member' check (role in ('owner', 'member')),
  invited_by  uuid references public.profiles on delete set null default auth.uid(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);
alter table public.invitations add column if not exists role text not null default 'member';

-- Tenant keys for existing and new installations.
alter table public.clients add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.retainers add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.tasks add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.invoices add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.payments add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.followups add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.automations add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.invitations add column if not exists workspace_id uuid references public.workspaces on delete cascade;

do $$
declare default_workspace uuid;
begin
  select id into default_workspace from public.workspaces order by created_at limit 1;
  update public.clients set workspace_id = default_workspace where workspace_id is null;
  update public.retainers set workspace_id = default_workspace where workspace_id is null;
  update public.tasks set workspace_id = default_workspace where workspace_id is null;
  update public.invoices set workspace_id = default_workspace where workspace_id is null;
  update public.payments set workspace_id = default_workspace where workspace_id is null;
  update public.followups set workspace_id = default_workspace where workspace_id is null;
  update public.automations set workspace_id = default_workspace where workspace_id is null;
  update public.invitations set workspace_id = default_workspace where workspace_id is null;
end $$;

alter table public.clients alter column workspace_id set not null;
alter table public.retainers alter column workspace_id set not null;
alter table public.tasks alter column workspace_id set not null;
alter table public.invoices alter column workspace_id set not null;
alter table public.payments alter column workspace_id set not null;
alter table public.followups alter column workspace_id set not null;
alter table public.automations alter column workspace_id set not null;
alter table public.invitations alter column workspace_id set not null;

create index if not exists clients_workspace_idx on public.clients (workspace_id);
create index if not exists tasks_workspace_idx on public.tasks (workspace_id);
create index if not exists invoices_workspace_idx on public.invoices (workspace_id);
create index if not exists payments_workspace_idx on public.payments (workspace_id);

create index if not exists tasks_assignee_idx    on public.tasks (assignee_id);
create index if not exists tasks_client_idx      on public.tasks (client_id);
create index if not exists invoices_client_idx   on public.invoices (client_id);
create index if not exists payments_invoice_idx  on public.payments (invoice_id);
create index if not exists followups_owner_idx   on public.followups (owner_id);

-- ---------------------------------------------------------------- multi-currency
-- workspaces.currency is the main currency for totals and reports.
-- clients.currency is how that client is billed (null = the workspace currency).
-- invoices.currency is fixed per invoice; payments are always in their invoice's currency.
-- workspaces.fx_rates holds what one unit of each foreign currency is worth in the main currency,
-- e.g. {"EUR": 1.08, "GBP": 1.27} for a USD workspace. The owner keeps these up to date in Settings.

alter table public.workspaces add column if not exists fx_rates jsonb not null default '{}'::jsonb;
alter table public.clients    add column if not exists currency text check (currency ~ '^[A-Z]{3}$');
alter table public.invoices   add column if not exists currency text;

update public.invoices i
   set currency = coalesce(c.currency, w.currency)
  from public.clients c, public.workspaces w
 where i.currency is null and c.id = i.client_id and w.id = i.workspace_id;

alter table public.invoices alter column currency set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_currency_format') then
    alter table public.invoices add constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$');
  end if;
end $$;

-- New invoices without a currency take the client's, then the workspace's.
create or replace function public.fill_invoice_currency()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.currency is null or new.currency = '' then
    select coalesce(c.currency, w.currency) into new.currency
      from public.clients c join public.workspaces w on w.id = c.workspace_id
     where c.id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists fill_invoice_currency on public.invoices;
create trigger fill_invoice_currency
  before insert on public.invoices
  for each row execute function public.fill_invoice_currency();

-- An invoice's currency cannot change once money has been recorded against it.
create or replace function public.guard_invoice_currency()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.payments where invoice_id = old.id) then
    raise exception 'This invoice already has payments, so its currency cannot change';
  end if;
  return new;
end $$;

drop trigger if exists guard_invoice_currency on public.invoices;
create trigger guard_invoice_currency
  before update on public.invoices
  for each row execute function public.guard_invoice_currency();

-- ---------------------------------------------------------------- helpers

-- Role of the person making the request. Security definer so policies can
-- call it without recursing into the profiles policies.
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.workspace_role(wid uuid)
returns text language sql stable security definer set search_path = public
as $$ select role from public.workspace_members where workspace_id = wid and user_id = auth.uid() $$;

create or replace function public.workspace_access(wid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.app_role() = 'owner' or exists (select 1 from public.workspace_members where workspace_id = wid and user_id = auth.uid()) $$;

create or replace function public.shares_workspace(other_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.app_role() = 'owner' or exists (
  select 1 from public.workspace_members mine join public.workspace_members theirs using (workspace_id)
  where mine.user_id = auth.uid() and theirs.user_id = other_user
) $$;

-- Create a profile for every new sign-up. First one in is the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invite public.invitations%rowtype;
  first_owner boolean;
  default_workspace uuid;
begin
  select not exists (select 1 from public.profiles where role = 'owner') into first_owner;
  if not first_owner then
    select * into invite from public.invitations
      where token = coalesce(new.raw_user_meta_data ->> 'invite_token', '')
        and lower(email) = lower(coalesce(new.email, ''))
        and status = 'pending' and expires_at > now();
    if invite.id is null then
      raise exception 'A valid invitation from the workspace owner is required';
    end if;
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case when first_owner then 'owner' else 'member' end
  );
  if first_owner then
    select id into default_workspace from public.workspaces order by created_at limit 1;
    update public.workspaces set owner_id = new.id where id = default_workspace;
    insert into public.workspace_members (workspace_id, user_id, role) values (default_workspace, new.id, 'owner') on conflict do nothing;
  else
    insert into public.workspace_members (workspace_id, user_id, role) values (invite.workspace_id, new.id, invite.role) on conflict do nothing;
    update public.invitations set status = 'accepted' where id = invite.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the owner changes roles, and the owner cannot demote themselves by accident.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    if public.app_role() is distinct from 'owner' then
      raise exception 'Only the owner can change roles';
    end if;
    if old.id = auth.uid() then
      raise exception 'The owner cannot change their own role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Stamp completed_at when work moves in or out of done.
create or replace function public.stamp_task_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists stamp_task_done on public.tasks;
create trigger stamp_task_done
  before insert or update on public.tasks
  for each row execute function public.stamp_task_done();

-- Payments on an invoice can never add up to more than the invoice.
create or replace function public.guard_payment_total()
returns trigger
language plpgsql
as $$
declare
  owed    numeric;
  already numeric;
begin
  select amount into owed from public.invoices where id = new.invoice_id;
  if owed is null then
    raise exception 'That invoice does not exist in this workspace';
  end if;
  select coalesce(sum(amount), 0) into already
    from public.payments where invoice_id = new.invoice_id and id <> new.id;
  if already + new.amount > owed then
    raise exception 'This payment is more than what is still owed on the invoice';
  end if;
  return new;
end $$;

drop trigger if exists guard_payment_total on public.payments;
create trigger guard_payment_total
  before insert or update on public.payments
  for each row execute function public.guard_payment_total();

-- A row can only point at a client or invoice in its own workspace. Without this,
-- an admin of one workspace who learned an id from another could attach records
-- to it. Security definer so the check sees the parent even when RLS hides it.
create or replace function public.guard_workspace_match()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  parent_ws uuid;
  row_data  jsonb := to_jsonb(new);
begin
  if row_data ? 'client_id' and row_data ->> 'client_id' is not null then
    select workspace_id into parent_ws from public.clients where id = (row_data ->> 'client_id')::uuid;
    if parent_ws is distinct from new.workspace_id then
      raise exception 'That client belongs to a different workspace';
    end if;
  end if;
  if row_data ? 'invoice_id' and row_data ->> 'invoice_id' is not null then
    select workspace_id into parent_ws from public.invoices where id = (row_data ->> 'invoice_id')::uuid;
    if parent_ws is distinct from new.workspace_id then
      raise exception 'That invoice belongs to a different workspace';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_workspace_match on public.retainers;
create trigger guard_workspace_match before insert or update on public.retainers
  for each row execute function public.guard_workspace_match();
drop trigger if exists guard_workspace_match on public.tasks;
create trigger guard_workspace_match before insert or update on public.tasks
  for each row execute function public.guard_workspace_match();
drop trigger if exists guard_workspace_match on public.invoices;
create trigger guard_workspace_match before insert or update on public.invoices
  for each row execute function public.guard_workspace_match();
drop trigger if exists guard_workspace_match on public.payments;
create trigger guard_workspace_match before insert or update on public.payments
  for each row execute function public.guard_workspace_match();
drop trigger if exists guard_workspace_match on public.followups;
create trigger guard_workspace_match before insert or update on public.followups
  for each row execute function public.guard_workspace_match();

-- ---------------------------------------------------------------- row-level security

alter table public.profiles  enable row level security;
alter table public.workspace enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients   enable row level security;
alter table public.retainers enable row level security;
alter table public.tasks     enable row level security;
alter table public.invoices  enable row level security;
alter table public.payments  enable row level security;
alter table public.followups enable row level security;
alter table public.automations enable row level security;
alter table public.invitations enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.app_role() to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.workspace_access(uuid) to authenticated;
grant execute on function public.shares_workspace(uuid) to authenticated;

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() in ('owner', 'member'));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.app_role() = 'owner')
  with check (id = auth.uid() or public.app_role() = 'owner');

-- workspace
drop policy if exists workspace_read on public.workspace;
create policy workspace_read on public.workspace for select to authenticated
  using (public.app_role() in ('owner', 'member'));

drop policy if exists workspace_update on public.workspace;
create policy workspace_update on public.workspace for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- clients: team reads, owner writes
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (public.app_role() in ('owner', 'member'));

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- money: owner only
drop policy if exists retainers_owner on public.retainers;
create policy retainers_owner on public.retainers for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

drop policy if exists invoices_owner on public.invoices;
create policy invoices_owner on public.invoices for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

drop policy if exists payments_owner on public.payments;
create policy payments_owner on public.payments for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- tasks: owner sees all; members see what is assigned to them or what they created
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and (assignee_id = auth.uid() or created_by = auth.uid()))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and assignee_id = auth.uid())
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and assignee_id = auth.uid())
  )
  with check (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and assignee_id = auth.uid())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.app_role() = 'owner');

-- follow-ups: owner sees all; members see and manage their own
drop policy if exists followups_read on public.followups;
create policy followups_read on public.followups for select to authenticated
  using (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and owner_id = auth.uid())
  );

drop policy if exists followups_insert on public.followups;
create policy followups_insert on public.followups for insert to authenticated
  with check (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and owner_id = auth.uid() and invoice_id is null)
  );

drop policy if exists followups_update on public.followups;
create policy followups_update on public.followups for update to authenticated
  using (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and owner_id = auth.uid())
  )
  with check (
    public.app_role() = 'owner'
    or (public.app_role() = 'member' and owner_id = auth.uid())
  );

drop policy if exists followups_delete on public.followups;
create policy followups_delete on public.followups for delete to authenticated
  using (public.app_role() = 'owner');

-- automations: owner configures rules; members do not need to read them
drop policy if exists automations_owner on public.automations;
create policy automations_owner on public.automations for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

drop policy if exists invitations_owner on public.invitations;
create policy invitations_owner on public.invitations for all to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

-- ---------------------------------------------------------------- multi-workspace isolation
-- These final policies replace the legacy single-workspace policies above.

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id));

drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated
  using (public.workspace_access(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (public.app_role() = 'owner' and owner_id = auth.uid());
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(id) = 'owner');

drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (public.workspace_access(workspace_id));
drop policy if exists workspace_members_write on public.workspace_members;
create policy workspace_members_write on public.workspace_members for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated
  using (public.workspace_access(workspace_id));
drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

drop policy if exists retainers_owner on public.retainers;
create policy retainers_owner on public.retainers for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');
drop policy if exists invoices_owner on public.invoices;
create policy invoices_owner on public.invoices for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');
drop policy if exists payments_owner on public.payments;
create policy payments_owner on public.payments for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (
  public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner'
  or (public.workspace_role(workspace_id) = 'member' and (assignee_id = auth.uid() or created_by = auth.uid()))
);
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner'
  or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid())
);
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner' or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid()))
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner' or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid()));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

drop policy if exists followups_read on public.followups;
create policy followups_read on public.followups for select to authenticated using (
  public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner'
  or (public.workspace_role(workspace_id) = 'member' and owner_id = auth.uid())
);
drop policy if exists followups_insert on public.followups;
create policy followups_insert on public.followups for insert to authenticated with check (
  public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner'
  or (public.workspace_role(workspace_id) = 'member' and owner_id = auth.uid() and invoice_id is null)
);
drop policy if exists followups_update on public.followups;
create policy followups_update on public.followups for update to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner' or (public.workspace_role(workspace_id) = 'member' and owner_id = auth.uid()))
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner' or (public.workspace_role(workspace_id) = 'member' and owner_id = auth.uid()));
drop policy if exists followups_delete on public.followups;
create policy followups_delete on public.followups for delete to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

drop policy if exists automations_owner on public.automations;
create policy automations_owner on public.automations for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');
drop policy if exists invitations_owner on public.invitations;
create policy invitations_owner on public.invitations for all to authenticated
  using (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner')
  with check (public.app_role() = 'owner' or public.workspace_role(workspace_id) = 'owner');

-- ---------------------------------------------------------------- one-time invite links
-- Admins share an invitation as a private link instead of an email. Whoever opens the link can
-- see only who it is for and which workspace it opens. Accepting it marks it used, so the same
-- link stops working; unused links still expire after 7 days. Revoking deletes the row.

create or replace function public.invite_lookup(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  invite public.invitations%rowtype;
  ws public.workspaces%rowtype;
  usable boolean;
begin
  select * into invite from public.invitations where token = coalesce(p_token, '');
  if invite.id is null or invite.status = 'revoked' then return jsonb_build_object('status', 'invalid'); end if;
  if invite.status = 'accepted' then return jsonb_build_object('status', 'used'); end if;
  if invite.expires_at <= now() then return jsonb_build_object('status', 'expired'); end if;
  select * into ws from public.workspaces where id = invite.workspace_id;
  -- An account only counts if someone can sign in to it: confirmed and with a password.
  -- Accounts left half-made by an emailed invite or an unconfirmed sign-up have neither, so the
  -- link lets that person choose a password instead of asking for one nobody knows.
  select bool_or(u.email_confirmed_at is not null and coalesce(u.encrypted_password, '') <> '')
    into usable
    from auth.users u where lower(u.email) = lower(invite.email);
  return jsonb_build_object(
    'status', 'ok',
    'email', lower(invite.email),
    'role', invite.role,
    'workspace', coalesce(nullif(ws.brand_name, ''), ws.name, 'Deskbook'),
    'has_account', coalesce(usable, false),
    'unfinished_account', usable is not null and not usable
  );
end $$;

-- For people who already have an account (for example in another workspace): sign in, then accept.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  invite public.invitations%rowtype;
  my_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first, then open the invite link again'; end if;
  select * into invite from public.invitations
    where token = coalesce(p_token, '') and status = 'pending' and expires_at > now()
    for update;
  if invite.id is null then raise exception 'This invite link has expired or was already used. Ask for a new one.'; end if;
  select email into my_email from public.profiles where id = auth.uid();
  if lower(coalesce(my_email, '')) <> lower(invite.email) then
    raise exception 'This invite link is for %. Sign in with that email.', invite.email;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (invite.workspace_id, auth.uid(), invite.role) on conflict (workspace_id, user_id) do nothing;
  update public.invitations set status = 'accepted' where id = invite.id;
  return invite.workspace_id;
end $$;

revoke all on function public.invite_lookup(text) from public;
grant execute on function public.invite_lookup(text) to anon, authenticated, service_role;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------- admin and sub admin
-- Admin     = the agency owner (profiles.role = 'owner'). Creates workspaces, invites and removes
--             people, sets each workspace's white-label identity.
-- Sub admin = a workspace admin (workspace_members.role = 'owner'). Runs one client workspace:
--             clients, work, money, reports, automations. Cannot add or remove people, change
--             anyone's access, see other workspaces, or change the workspace's branding or URL.

drop policy if exists invitations_owner on public.invitations;
create policy invitations_owner on public.invitations for all to authenticated
  using (public.app_role() = 'owner')
  with check (public.app_role() = 'owner');

drop policy if exists workspace_members_write on public.workspace_members;
create policy workspace_members_write on public.workspace_members for all to authenticated
  using (public.app_role() = 'owner')
  with check (public.app_role() = 'owner');

create or replace function public.guard_workspace_identity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- auth.uid() is null for the SQL editor and server code, which may change anything.
  if auth.uid() is not null and coalesce(public.app_role(), '') <> 'owner' and (
    new.slug is distinct from old.slug
    or new.brand_name is distinct from old.brand_name
    or new.accent_color is distinct from old.accent_color
    or new.logo_url is distinct from old.logo_url
    or new.owner_id is distinct from old.owner_id
  ) then
    raise exception 'Only the agency admin can change the workspace branding or URL';
  end if;
  return new;
end $$;

drop trigger if exists guard_workspace_identity on public.workspaces;
create trigger guard_workspace_identity
  before update on public.workspaces
  for each row execute function public.guard_workspace_identity();

-- ---------------------------------------------------------------- student assignments
-- Assignments are written for students against a deadline. The work lives in `assignments`, which
-- the assigned writer can see. The money lives in two tables only admins and sub admins can read:
--   assignment_fees      the agreed price, its currency and the advance asked for up front
--   assignment_payments  every payment received, marked as advance or balance
-- Remaining = price - all payments. The database refuses payments above the price.

create or replace function public.workspace_manager(wid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.app_role() = 'owner', false) or coalesce(public.workspace_role(wid) = 'owner', false) $$;
grant execute on function public.workspace_manager(uuid) to authenticated;

create table if not exists public.assignments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces on delete cascade,
  title           text not null,
  student_name    text not null,
  student_contact text not null default '',
  institution     text not null default '',
  subject         text not null default '',
  word_count      integer check (word_count is null or word_count >= 0),
  details         text not null default '',
  status          text not null default 'new' check (status in ('new', 'in_progress', 'review', 'delivered', 'cancelled')),
  assignee_id     uuid references public.profiles on delete set null,
  deadline        timestamptz not null,
  delivered_at    timestamptz,
  created_by      uuid references public.profiles on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists assignments_workspace_idx on public.assignments (workspace_id, deadline);

create table if not exists public.assignment_fees (
  assignment_id uuid primary key references public.assignments on delete cascade,
  workspace_id  uuid not null references public.workspaces on delete cascade,
  amount        numeric(12, 2) not null default 0 check (amount >= 0),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  advance_due   numeric(12, 2) not null default 0 check (advance_due >= 0),
  check (advance_due <= amount)
);
create index if not exists assignment_fees_workspace_idx on public.assignment_fees (workspace_id);

create table if not exists public.assignment_payments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces on delete cascade,
  assignment_id uuid not null references public.assignments on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  kind          text not null default 'advance' check (kind in ('advance', 'balance')),
  paid_on       date not null default current_date,
  method        text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists assignment_payments_workspace_idx on public.assignment_payments (workspace_id, paid_on);
create index if not exists assignment_payments_assignment_idx on public.assignment_payments (assignment_id);

-- Fees and payments must belong to an assignment in the same workspace.
create or replace function public.guard_assignment_child()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare parent_ws uuid;
begin
  select workspace_id into parent_ws from public.assignments where id = new.assignment_id;
  if parent_ws is distinct from new.workspace_id then
    raise exception 'That assignment belongs to a different workspace';
  end if;
  return new;
end $$;
drop trigger if exists guard_assignment_child on public.assignment_fees;
create trigger guard_assignment_child before insert or update on public.assignment_fees
  for each row execute function public.guard_assignment_child();
drop trigger if exists guard_assignment_child on public.assignment_payments;
create trigger guard_assignment_child before insert or update on public.assignment_payments
  for each row execute function public.guard_assignment_child();

-- Never more received than the price.
create or replace function public.guard_assignment_payment_total()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare price numeric; already numeric;
begin
  select amount into price from public.assignment_fees where assignment_id = new.assignment_id;
  if price is null then raise exception 'Set a price for this assignment before recording payments'; end if;
  select coalesce(sum(amount), 0) into already
    from public.assignment_payments where assignment_id = new.assignment_id and id <> new.id;
  if already + new.amount > price then
    raise exception 'This payment is more than what is still owed on the assignment';
  end if;
  return new;
end $$;
drop trigger if exists guard_assignment_payment_total on public.assignment_payments;
create trigger guard_assignment_payment_total before insert or update on public.assignment_payments
  for each row execute function public.guard_assignment_payment_total();

-- Lowering a price below what was already received would make "remaining" negative.
create or replace function public.guard_assignment_fee()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare already numeric;
begin
  select coalesce(sum(amount), 0) into already from public.assignment_payments where assignment_id = new.assignment_id;
  if new.amount < already then
    raise exception 'The price cannot be lower than what was already paid (%)', already;
  end if;
  if tg_op = 'UPDATE' and new.currency is distinct from old.currency and already > 0 then
    raise exception 'The currency cannot change after payments were recorded';
  end if;
  return new;
end $$;
drop trigger if exists guard_assignment_fee on public.assignment_fees;
create trigger guard_assignment_fee before insert or update on public.assignment_fees
  for each row execute function public.guard_assignment_fee();

-- Writers may move their own assignment along and add notes, nothing else.
create or replace function public.guard_assignment_writer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.workspace_manager(old.workspace_id) then return new; end if;
  if new.title is distinct from old.title or new.student_name is distinct from old.student_name
    or new.student_contact is distinct from old.student_contact or new.institution is distinct from old.institution
    or new.subject is distinct from old.subject or new.word_count is distinct from old.word_count
    or new.deadline is distinct from old.deadline or new.assignee_id is distinct from old.assignee_id
    or new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by
    or new.status = 'cancelled' then
    raise exception 'Only an admin can change those details';
  end if;
  return new;
end $$;
drop trigger if exists guard_assignment_writer on public.assignments;
create trigger guard_assignment_writer before update on public.assignments
  for each row execute function public.guard_assignment_writer();

alter table public.assignments enable row level security;
alter table public.assignment_fees enable row level security;
alter table public.assignment_payments enable row level security;
grant select, insert, update, delete on public.assignments, public.assignment_fees, public.assignment_payments to authenticated;

drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using (
  public.workspace_manager(workspace_id)
  or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid())
);
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert to authenticated
  with check (public.workspace_manager(workspace_id));
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments for update to authenticated
  using (public.workspace_manager(workspace_id) or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid()))
  with check (public.workspace_manager(workspace_id) or (public.workspace_role(workspace_id) = 'member' and assignee_id = auth.uid()));
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated
  using (public.workspace_manager(workspace_id));

drop policy if exists assignment_fees_manage on public.assignment_fees;
create policy assignment_fees_manage on public.assignment_fees for all to authenticated
  using (public.workspace_manager(workspace_id)) with check (public.workspace_manager(workspace_id));
drop policy if exists assignment_payments_manage on public.assignment_payments;
create policy assignment_payments_manage on public.assignment_payments for all to authenticated
  using (public.workspace_manager(workspace_id)) with check (public.workspace_manager(workspace_id));
