-- Check-in only: the app no longer serves dinner. Apply this together with deploying the check-in-only app (the
-- refactor/checkin-only branch). Do NOT apply it while the earlier app, which records dinner scans, is still in use:
-- it would refuse those scans and break its stats.
--
-- Nothing is deleted. Old dinner scans (if any) stay in scan_events, so the append-only log keeps its history; the
-- 'dinner' checkpoint row stays too, because those rows point at it.
--
-- 1. party_state no longer has the dinner columns (served, last_served_at, over_served, served_without_entry), and a
--    party's entitlement is its party size. entitled_override stays in the parties table, unused.
-- 2. The server refuses any event that is not an entry check-in, including a void of an old dinner scan. A phone that
--    still has dinner scans waiting to sync will see them listed as "Not sent". Sync every phone before applying this.
-- 3. The dinner counters are switched off. They stay in the table so old scans can still show their names.

-- 1. The view. Same rule as src/lib/state.ts partyState(): live = entry passes that were not undone, earliest wins.
drop view party_state;
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
entry_n as (select party_id, count(*) n from live where checkpoint = 'entry' group by 1)
select p.id as party_id,
  p.party_size                                              as entitled,
  (en.party_id is not null)                                 as entered,
  en.entered_at, en.headcount,
  coalesce(n.n, 0) > 1                                      as duplicate_entry,
  (p.possible_duplicate_of is not null)                     as possible_duplicate
from parties p
left join entry en on en.party_id = p.id
left join entry_n n on n.party_id = p.id
where p.deleted_at is null;
grant select on party_state to authenticated;

-- 2. Same function as migration 8, plus one line: only entry events are accepted.
create or replace function _push_event(me staff_users, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p->>'id')::uuid;
  act event_action := coalesce(p->>'action', 'pass')::event_action;
  vid uuid := nullif(p->>'voidsEventId', '')::uuid;
  cat timestamptz := to_timestamp((p->>'clientAt')::numeric / 1000.0);
  tgt scan_events;
begin
  if exists (select 1 from scan_events where id = eid) then return '{"status":"duplicate"}'::jsonb; end if;
  if coalesce(p->>'checkpoint', '') <> 'entry' then raise exception 'Only check-ins are recorded'; end if;
  if not exists (select 1 from parties where id = (p->>'partyId')::uuid) then raise exception 'Unknown party'; end if;
  if me.role = 'volunteer' and (p->>'method' = 'staff' or nullif(p->>'overrideReason', '') is not null) then
    raise exception 'Staff only';
  end if;
  if act = 'void' then
    select * into tgt from scan_events where id = vid;
    if not found or tgt.action <> 'pass' then raise exception 'Nothing to undo'; end if;
    if tgt.party_id <> (p->>'partyId')::uuid then raise exception 'That scan belongs to another guest'; end if;
    if exists (select 1 from scan_events where voids_event_id = vid) then raise exception 'Already undone'; end if;
    if me.role = 'volunteer' then
      if tgt.actor_id <> me.id then raise exception 'You can only undo your own scans'; end if;
      if tgt.device_id = (p->>'deviceId')::uuid then
        -- Same phone, one clock.
        if cat < tgt.client_at then raise exception 'That undo is dated before the scan'; end if;
        if cat - tgt.client_at > interval '120 seconds' then raise exception 'Undo window has passed'; end if;
      else
        -- Another phone: its clock can't be compared with the scan's, so use ours.
        if now() - tgt.received_at > interval '120 seconds' then raise exception 'Undo window has passed'; end if;
      end if;
    end if;
  end if;
  insert into scan_events (id, party_id, checkpoint, action, qty, voids_event_id, reason, override_reason, method,
                           actor_id, counter, device_id, client_at, app_version)
  values (eid, (p->>'partyId')::uuid, p->>'checkpoint', act, coalesce((p->>'qty')::int, 1), vid,
          nullif(p->>'reason', ''), nullif(p->>'overrideReason', ''), p->>'method',
          me.id, nullif(p->>'counter', ''), (p->>'deviceId')::uuid, cat, p->>'appVersion');
  return '{"status":"accepted"}'::jsonb;
end $$;

-- 3. Dinner counters off. The rows stay so old scans keep their counter names.
update counters set active = false where kind = 'dinner';
