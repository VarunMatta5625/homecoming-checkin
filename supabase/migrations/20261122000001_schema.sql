-- Homecoming 2026 check-in: schema. Run migrations in filename order.
-- Source: build spec section 6.

create extension if not exists citext;
create extension if not exists pgcrypto;

create type app_role     as enum ('volunteer','staff','admin');   -- order matters (comparisons)
create type ynm          as enum ('no','yes','maybe');
create type parking_type as enum ('none','two_wheeler','four_wheeler');
create type party_source as enum ('booked','onspot');
create type event_action as enum ('pass','void');

create sequence change_seq;
create sequence event_seq;

-- Allowlist + roles. Insert your first admin by hand (see supabase/seed_admin.sql).
create table staff_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text,
  role app_role not null,
  active boolean not null default true,
  auth_user_id uuid unique references auth.users(id),   -- linked at first login by whoami()
  created_by uuid references staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table checkpoints (
  code text primary key,
  label text not null,
  requires text references checkpoints(code),
  counted boolean not null default false,
  sort int not null
);
insert into checkpoints (code, label, requires, counted, sort) values
  ('entry','Entry',null,false,1),
  ('dinner','Dinner','entry',true,2);

create table counters (
  code text primary key,           -- 'GATE-1','DINNER-1'..'DINNER-10'
  label text not null,
  kind text not null check (kind in ('gate','dinner','desk')),
  active boolean not null default true
);
insert into counters (code, label, kind)
  select 'GATE-' || i, 'Gate desk ' || i, 'gate' from generate_series(1, 2) i
  union all
  select 'DINNER-' || i, 'Counter ' || i, 'dinner' from generate_series(1, 10) i;

create table event_settings (      -- single row
  id boolean primary key default true check (id),
  event_name text not null default 'Homecoming 2026',
  event_date date not null default '2026-12-12',
  timezone text not null default 'Asia/Kolkata',
  is_live boolean not null default false,        -- true => reset scripts refuse to run
  deploy_freeze boolean not null default false,  -- true => no app-update prompts
  min_app_version text,
  updated_at timestamptz not null default now()
);
insert into event_settings default values;

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text, row_count int, created_at timestamptz not null default now()
);

create table parties (
  id uuid primary key,                           -- client-generated for on-spot
  pass_code text not null unique,
  qr_token  text not null unique,
  source party_source not null default 'booked',
  lead_name text not null,
  batch_year int not null check (batch_year between 1950 and 2100),
  decade int generated always as ((batch_year/10)*10) stored,
  school text,
  department text,
  course text,
  mobile_last4 text,
  spouse ynm not null default 'no',
  children int not null default 0 check (children between 0 and 10),
  party_size int generated always as
    (1 + (case when spouse <> 'no' then 1 else 0 end) + children) stored,
  entitled_override int check (entitled_override >= 0),
  parking parking_type not null default 'none',
  accommodation ynm,
  notes text,
  registration_status text,
  possible_duplicate_of uuid references parties(id),
  import_batch_id uuid references import_batches(id),
  deleted_at timestamptz,
  created_by uuid references staff_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references staff_users(id),
  updated_at timestamptz not null default now(),
  change_seq bigint not null default nextval('change_seq')
);
create index on parties (change_seq);
create index on parties (batch_year);
create index on parties (lower(lead_name));

-- PII lives here: Staff+ only.
create table party_contacts (
  party_id uuid primary key references parties(id),
  mobile text, email citext
);
create index on party_contacts (mobile);

create table scan_events (                       -- APPEND-ONLY
  id uuid primary key,                           -- client UUID = idempotency key
  seq bigint not null default nextval('event_seq'),
  party_id uuid not null references parties(id),
  checkpoint text not null references checkpoints(code),
  action event_action not null default 'pass',
  qty int not null default 1 check (qty >= 0),   -- entry: headcount; dinner: servings
  voids_event_id uuid references scan_events(id),
  reason text,
  override_reason text,
  method text not null check (method in ('qr','search','code','staff')),
  actor_id uuid not null references staff_users(id),
  counter text references counters(code),
  device_id uuid not null,
  client_at timestamptz not null,                -- device clock (untrusted for ordering)
  received_at timestamptz not null default now(),
  app_version text,
  check (action = 'pass' or (voids_event_id is not null and reason is not null))
);
create index on scan_events (seq);
create index on scan_events (party_id);
create unique index one_void_per_event on scan_events (voids_event_id) where action = 'void';

create function forbid_mutation() returns trigger language plpgsql as
$$ begin raise exception 'scan_events is append-only'; end $$;
create trigger scan_events_no_update before update or delete on scan_events
  for each row execute function forbid_mutation();

create table review_resolutions (                -- append-only
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id),
  note text, resolved_by uuid references staff_users(id),
  resolved_at timestamptz not null default now()
);

create table device_status (
  device_id uuid primary key,
  user_id uuid references staff_users(id),
  counter text, pending_count int, app_version text,
  last_sync_at timestamptz, clock_offset_ms int
);

create table audit_log (                         -- append-only; filled by triggers/RPCs
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references staff_users(id),
  table_name text not null, row_id text not null,
  action text not null, before jsonb, after jsonb, reason text
);

-- Derived state. The TypeScript partyState() in src/lib/state.ts must agree with this view.
create view party_state with (security_invoker = true) as
with live as (
  select e.* from scan_events e
  where e.action = 'pass'
    and not exists (select 1 from scan_events v
                    where v.action = 'void' and v.voids_event_id = e.id)
),
entry as (
  select distinct on (party_id) party_id, client_at as entered_at, qty as headcount, counter
  from live where checkpoint = 'entry'
  order by party_id, client_at, received_at          -- earliest wins
),
entry_n as (select party_id, count(*) n from live where checkpoint='entry' group by 1),
dinner as (
  select party_id, sum(qty)::int as served, max(client_at) as last_served_at
  from live where checkpoint = 'dinner' group by party_id
)
select p.id as party_id,
  coalesce(p.entitled_override, p.party_size)               as entitled,
  (en.party_id is not null)                                 as entered,
  en.entered_at, en.headcount,
  coalesce(d.served,0)                                      as served,
  d.last_served_at,
  coalesce(d.served,0) > coalesce(p.entitled_override,p.party_size) as over_served,
  (coalesce(d.served,0) > 0 and en.party_id is null)        as served_without_entry,
  coalesce(n.n,0) > 1                                       as duplicate_entry,
  (p.possible_duplicate_of is not null)                     as possible_duplicate
from parties p
left join entry en on en.party_id = p.id
left join entry_n n on n.party_id = p.id
left join dinner d on d.party_id = p.id
where p.deleted_at is null;
