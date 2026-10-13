-- ============================================================================
-- Home Os — schema
--
-- Run this ONCE in Supabase -> SQL Editor -> New query -> Run.
-- It is idempotent, so re-running is safe.
--
-- Privacy model:
--   * earnings and savings are readable ONLY by their owner (RLS, all 4 verbs)
--   * the shared savings pool total comes from savings_pool_total(), which
--     returns only a SUM, so members see the household figure but never each
--     other's individual contributions
--   * everything else (groceries, tasks, goals, house expenses) is household-wide
--
-- RLS is enabled on EVERY table. A table with no policy returns zero rows.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  -- 6 characters, letters and digits. Ambiguous pairs (0/O, 1/I/L) are excluded
  -- so a code read aloud or typed from a screenshot is not a coin flip.
  invite_code text not null unique
    check (invite_code ~ '^[0-9A-HJ-NP-Z]{6}$'),
  -- Nullable with SET NULL on purpose: if the creator's login is ever deleted,
  -- the home and everyone's data must survive. Headship lives on
  -- household_members.role, not here.
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  email        text,
  avatar_index int not null default 0 check (avatar_index between 0 and 7),
  -- Photo uploaded from Settings. Null means "use the coloured initials".
  avatar_url   text,
  -- Set once the person has chosen their own name. Until then we fall back to
  -- the part before the @ in their email, which is a poor thing to show a
  -- family roster.
  is_set_up    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever Supabase creates a user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, avatar_index)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, 'member'), '@', 1), ''),
      'Member'
    ),
    new.email,
    floor(random() * 8)::int
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Migrations for databases built by older revisions of this file.
-- `create table if not exists` never alters an existing table, so without
-- these a re-run leaves the old column set / old check behind and inserts
-- fail with "column does not exist" or a check-violation.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_set_up boolean not null default false;

alter table public.profiles
  add column if not exists avatar_url text;

-- Calling the head on SOS needs a phone number. Plain text, optional —
-- families outside any one numbering plan store whatever they dial.
alter table public.profiles
  add column if not exists phone text;

-- Old revision allowed digits-only codes (`^[0-9]{6}$`); current codes are
-- alphanumeric (`K7M2QP`). Existing all-digit rows still satisfy the new
-- pattern, so replacing the constraint is safe.
alter table public.households drop constraint if exists households_invite_code_check;
alter table public.households add constraint households_invite_code_check
  check (invite_code ~ '^[0-9A-HJ-NP-Z]{6}$');

-- Old revision deleted the whole household when the creator's login was
-- deleted (`created_by on delete cascade`). Headship now lives on
-- household_members.role, so the creator reference just goes null instead.
alter table public.households drop constraint if exists households_created_by_fkey;
alter table public.households alter column created_by drop not null;
alter table public.households add constraint households_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- membership
-- ---------------------------------------------------------------------------
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- `owner` is the Head of the House: exactly one per household. The creator
  -- gets it automatically; it moves only through transfer_headship(). There is
  -- no UPDATE policy on this table, so nobody can self-promote around that.
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- At most one head per household. Zero is possible transiently (legacy rows);
-- the transfer function refuses to run until a head exists.
create unique index if not exists household_members_single_owner_idx
  on public.household_members (household_id) where role = 'owner';

-- The app's hottest lookup is "which household is this user in", but the PK
-- leads with household_id, so that filter sequential-scans. This fixes it.
create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- SECURITY DEFINER so RLS policies can call it without recursing on itself.
create or replace function public.is_member(p_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- groceries — shared monthly list
-- ---------------------------------------------------------------------------
create table if not exists public.groceries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 120),
  category     text not null default 'Other',
  quantity     numeric(10, 2) check (quantity is null or quantity > 0),
  unit         text,
  -- permanent items (milk, oil) carry over to the next month; temporary do not
  is_permanent boolean not null default false,
  is_bought    boolean not null default false,
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  added_by     uuid not null references auth.users(id),
  bought_by    uuid references auth.users(id),
  bought_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists groceries_household_month_idx
  on public.groceries (household_id, month);

-- ---------------------------------------------------------------------------
-- house expenses — household-visible
-- ---------------------------------------------------------------------------
create table if not exists public.house_expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category     text not null check (
                 category in ('rent', 'electricity', 'water', 'gas',
                              'internet', 'maid', 'maintenance', 'other')),
  label        text not null check (char_length(trim(label)) between 1 and 120),
  amount       numeric(14, 2) not null check (amount >= 0),
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  due_day      int check (due_day is null or due_day between 1 and 31),
  paid_by      uuid references auth.users(id),
  is_paid      boolean not null default false,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists house_expenses_household_month_idx
  on public.house_expenses (household_id, month);

-- ---------------------------------------------------------------------------
-- earnings — PRIVATE to owner
-- ---------------------------------------------------------------------------
create table if not exists public.earnings (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount       numeric(14, 2) not null check (amount >= 0),
  source       text not null default 'Other',
  note         text,
  created_at   timestamptz not null default now(),
  unique (user_id, month, source)
);

-- ---------------------------------------------------------------------------
-- savings — PRIVATE rows, SHARED total via function
-- ---------------------------------------------------------------------------
create table if not exists public.savings (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount       numeric(14, 2) not null default 0 check (amount >= 0),
  note         text,
  created_at   timestamptz not null default now(),
  unique (user_id, month)
);

-- The pool total sums by household, but the unique index above leads with
-- user_id, so that SUM sequential-scans. This fixes it.
create index if not exists savings_household_idx
  on public.savings (household_id);

-- Returns ONLY the sum. SECURITY DEFINER bypasses the row policies above,
-- which is the whole point: the household total is shared, the individual
-- contributions behind it are not readable by anyone else.
create or replace function public.savings_pool_total(p_household uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when public.is_member(p_household) then
      coalesce(
        (select sum(amount) from public.savings where household_id = p_household),
        0
      )
    else null
  end;
$$;

revoke all on function public.savings_pool_total(uuid) from public;
grant execute on function public.savings_pool_total(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 120),
  cadence      text not null check (cadence in ('once', 'daily', 'weekly')),
  -- permanent = recurs forever; temporary = one-off or bounded
  is_permanent boolean not null default false,
  assignee_id  uuid references auth.users(id) on delete set null,
  assigned_by  uuid not null references auth.users(id) on delete cascade,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- A daily task is personal and can never be assigned to somebody else.
alter table public.tasks drop constraint if exists daily_tasks_are_self;
alter table public.tasks add constraint daily_tasks_are_self
  check (cadence <> 'daily' or assignee_id is null or assignee_id = assigned_by);

-- Optional deadline: the app asks at creation and pings this device there.
-- Null means no deadline. RLS is unchanged — same table, same policies.
alter table public.tasks
  add column if not exists due_at timestamptz;

create index if not exists tasks_household_idx on public.tasks (household_id);

create table if not exists public.task_completions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  completed_on date not null default current_date,
  created_at   timestamptz not null default now(),
  unique (task_id, user_id, completed_on)
);

create index if not exists task_completions_lookup_idx
  on public.task_completions (task_id, completed_on);

-- ---------------------------------------------------------------------------
-- goals — household-visible, author tracked
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid not null references auth.users(id),
  title        text not null check (char_length(trim(title)) between 1 and 120),
  description  text,
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  is_done      boolean not null default false,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists goals_household_month_idx
  on public.goals (household_id, month);

-- ---------- maps: saved places + live member locations (shared) ----------
-- Saved pins (Home, School, …) any member adds; live rows are one per member
-- and shared with the household by choice — anyone in the home can read them,
-- but only the owner can write or delete their own.
create table if not exists public.places (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 80),
  note         text,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists places_household_idx
  on public.places (household_id);

create table if not exists public.member_locations (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  updated_at   timestamptz not null default now()
);
create index if not exists member_locations_household_idx
  on public.member_locations (household_id);

-- Battery shown next to a live pin (0-100, null = unknown / old app).
-- Added as a migration so homes built before this column keep working.
alter table public.member_locations
  add column if not exists battery_level int;

-- ---------- sos alerts (household-visible distress flag) ----------
-- One row per SOS press. The latest active row is the banner every member
-- sees; resolving sets is_active = false. Calling itself is the phone app
-- (tel: link to the head) — the row is the shared "who needs help" signal
-- for members who missed the moment.
create table if not exists public.sos_alerts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  triggered_by uuid not null references auth.users(id) on delete cascade,
  message      text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists sos_alerts_household_idx
  on public.sos_alerts (household_id, created_at desc);

-- ============================================================================
-- Avatars (Supabase Storage)
--
-- Profile photos live in the `avatars` bucket, one folder per user
-- (`<user-id>/<timestamp>.jpg`). The bucket is public so an <Image> renders
-- with a plain URL and no signed-URL refresh dance; paths are unguessable
-- (user UUID + timestamp) and writes are locked to the owner's own folder.
-- `avatar_url` on profiles just stores the public URL — no extra RLS needed,
-- the existing profiles policies already cover that column.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_upload_own on storage.objects;
create policy avatars_upload_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.households        enable row level security;
alter table public.profiles          enable row level security;
alter table public.household_members enable row level security;
alter table public.groceries         enable row level security;
alter table public.house_expenses    enable row level security;
alter table public.earnings          enable row level security;
alter table public.savings           enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_completions enable row level security;
alter table public.goals            enable row level security;
alter table public.places           enable row level security;
alter table public.member_locations enable row level security;
alter table public.sos_alerts        enable row level security;

-- households: members read; only the head may rename. The invite code and
-- creator reference are additionally frozen by the protect_household_keys
-- trigger below, so renaming can never lock the family out.
drop policy if exists households_read   on public.households;
create policy households_read   on public.households for select using (public.is_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update
  using (
    exists (
      select 1 from public.household_members
      where household_id = households.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.household_members
      where household_id = households.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- Nobody may rewrite a household's invite code or creator, through any path.
create or replace function public.protect_household_keys()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.invite_code is distinct from old.invite_code
     or new.created_by is distinct from old.created_by then
    raise exception 'The invite code cannot be changed.';
  end if;
  return new;
end $$;

drop trigger if exists protect_household_keys on public.households;
create trigger protect_household_keys before update on public.households
  for each row execute function public.protect_household_keys();

-- profiles: household members can see each other's name and avatar, because
-- list rows are attributed to whoever added or bought them. Nothing private
-- lives on this table.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_members mine
      join public.household_members theirs on theirs.household_id = mine.household_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- membership: read your own household; joining happens via RPC only.
-- Roles change only through transfer_headship(): there is no UPDATE policy,
-- so nobody can self-promote. Leaving is your own row, except the head
-- cannot abandon a home that still has members — they transfer first. A head
-- who is the last member left may still leave.
drop policy if exists members_read on public.household_members;
create policy members_read on public.household_members for select
  using (public.is_member(household_id));

drop policy if exists members_leave on public.household_members;
create policy members_leave on public.household_members for delete
  using (
    user_id = auth.uid()
    and (
      role <> 'owner'
      or not exists (
        select 1 from public.household_members others
        where others.household_id = household_members.household_id
          and others.user_id <> auth.uid()
      )
    )
  );

-- groceries: full household access
drop policy if exists groceries_rw on public.groceries;
create policy groceries_rw on public.groceries for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- house expenses: full household access
drop policy if exists expenses_rw on public.house_expenses;
create policy expenses_rw on public.house_expenses for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- earnings: OWNER ONLY, all four verbs
drop policy if exists earnings_select_own on public.earnings;
create policy earnings_select_own on public.earnings for select using (user_id = auth.uid());

drop policy if exists earnings_insert_own on public.earnings;
create policy earnings_insert_own on public.earnings for insert with check (user_id = auth.uid());

drop policy if exists earnings_update_own on public.earnings;
create policy earnings_update_own on public.earnings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists earnings_delete_own on public.earnings;
create policy earnings_delete_own on public.earnings for delete using (user_id = auth.uid());

-- savings: OWNER ONLY rows. The shared figure comes from savings_pool_total().
drop policy if exists savings_select_own on public.savings;
create policy savings_select_own on public.savings for select using (user_id = auth.uid());

drop policy if exists savings_insert_own on public.savings;
create policy savings_insert_own on public.savings for insert with check (user_id = auth.uid());

drop policy if exists savings_update_own on public.savings;
create policy savings_update_own on public.savings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists savings_delete_own on public.savings;
create policy savings_delete_own on public.savings for delete using (user_id = auth.uid());

-- tasks: full household access
drop policy if exists tasks_rw on public.tasks;
create policy tasks_rw on public.tasks for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- task completions: household reads, but you only ever log your own
drop policy if exists completions_read on public.task_completions;
create policy completions_read on public.task_completions for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_member(t.household_id)
    )
  );

drop policy if exists completions_insert_own on public.task_completions;
create policy completions_insert_own on public.task_completions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_completions.task_id and public.is_member(t.household_id)
    )
  );

drop policy if exists completions_delete_own on public.task_completions;
create policy completions_delete_own on public.task_completions for delete
  using (user_id = auth.uid());

-- goals: full household access
drop policy if exists goals_rw on public.goals;
create policy goals_rw on public.goals for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- places: full household access (saved pins are shared by design)
drop policy if exists places_rw on public.places;
create policy places_rw on public.places for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- member_locations: household reads, but you only publish your own.
-- Sharing is opt-in per member: no row means "not sharing".
drop policy if exists locations_read on public.member_locations;
create policy locations_read on public.member_locations for select
  using (public.is_member(household_id));
drop policy if exists locations_write_own on public.member_locations;
create policy locations_write_own on public.member_locations for insert
  with check (user_id = auth.uid());
drop policy if exists locations_update_own on public.member_locations;
create policy locations_update_own on public.member_locations for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists locations_delete_own on public.member_locations;
create policy locations_delete_own on public.member_locations for delete
  using (user_id = auth.uid());

-- sos_alerts: anyone in the home reads; any member may raise one, and any
-- member may stand it down (the head resolves when everyone is safe).
drop policy if exists sos_rw on public.sos_alerts;
create policy sos_rw on public.sos_alerts for all
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- Future tables must work without a manual rescue grant. The SETUP.md grant
-- covers only tables that exist today; this covers everything created later.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============================================================================
-- Onboarding RPCs
--
-- Invite-code generation is server-side so it is atomic. Two members creating
-- a household at the same moment cannot collide on a code, which a client-side
-- generate-then-insert would.
--
-- These two run as SECURITY DEFINER (with a locked search_path) so they can
-- insert the household + membership rows. There is deliberately no INSERT
-- policy on these tables — joining happens only through these functions, and
-- the invite code is the credential. As INVOKER they fail with
-- "new row violates row-level security policy", and join's lookup SELECT also
-- returns nothing since the caller is not a member yet.
-- ============================================================================

create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_code      text;
  i           int;
  j           int;
  -- No 0/O and no 1/I/L. "0" vs "O" is the single most common way a family
  -- misreads a code off a screen.
  v_alphabet  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_name is null or trim(p_name) = '' then
    raise exception 'Give your home a name first.';
  end if;

  -- The app serves one home per person (it loads a single membership), so a
  -- second household would silently orphan the first. Say so instead.
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You are already in a home.';
  end if;

  for i in 1..30 loop
    v_code := '';
    for j in 1..6 loop
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    end loop;

    begin
      insert into public.households (name, invite_code, created_by)
      values (trim(p_name), v_code, auth.uid())
      returning id into v_household;

      insert into public.household_members (household_id, user_id, role)
      values (v_household, auth.uid(), 'owner');

      return v_household;
    exception when unique_violation then
      continue; -- code was taken, try another
    end;
  end loop;
  raise exception 'could not allocate a unique invite code';
end $$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_normalised text;
begin
  -- Case-insensitive, and tolerant of the spaces people add when reading a code
  -- aloud. Without this, "ab3 k9z" fails while "AB3K9Z" works.
  v_normalised := upper(regexp_replace(trim(p_code), '[^0-9A-Za-z]', '', 'g'));

  if char_length(v_normalised) <> 6 then
    raise exception 'A Home Os code is 6 letters and numbers';
  end if;

  select id into v_household
  from public.households
  where invite_code = v_normalised;

  if v_household is null then
    raise exception 'We could not find a home with that code';
  end if;

  -- Re-joining your own home is a harmless no-op, but silently collecting a
  -- second home would orphan the first in the app (it loads one membership).
  if exists (
    select 1 from public.household_members
    where user_id = auth.uid() and household_id <> v_household
  ) then
    raise exception 'You are already in a home. Leave it before joining another.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, auth.uid(), 'member')
  on conflict do nothing;

  return v_household;
end $$;

-- Pass the Head of the House title to another member. Exactly one head exists
-- (see household_members_single_owner_idx), and the swap is a single
-- transaction: demote-then-promote can never strand the home with zero or two
-- heads, even if two transfers race.
create or replace function public.transfer_headship(p_household uuid, p_new_head uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner
  from public.household_members
  where household_id = p_household and role = 'owner'
  limit 1;

  if v_owner is null then
    raise exception 'This home has no head right now.';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Only the head can pass on the title.';
  end if;

  if p_new_head = auth.uid() then
    raise exception 'You are already the head.';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = p_new_head
  ) then
    raise exception 'They are not a member of this home.';
  end if;

  update public.household_members
  set role = case
    when user_id = auth.uid() then 'member'
    when user_id = p_new_head then 'owner'
    else role
  end
  where household_id = p_household
    and user_id in (auth.uid(), p_new_head);
end $$;

-- Called after the person chooses their own name and avatar.
create or replace function public.finish_profile(p_display_name text, p_avatar_index int)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_display_name is null or trim(p_display_name) = '' then
    raise exception 'Tell your family your name.';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      avatar_index = greatest(0, least(7, p_avatar_index)),
      is_set_up = true
  where id = auth.uid();
end $$;

revoke all on function public.create_household(text) from public;
revoke all on function public.join_household(text) from public;
revoke all on function public.finish_profile(text, int) from public;
revoke all on function public.transfer_headship(uuid, uuid) from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.finish_profile(text, int) to authenticated;
grant execute on function public.transfer_headship(uuid, uuid) to authenticated;
