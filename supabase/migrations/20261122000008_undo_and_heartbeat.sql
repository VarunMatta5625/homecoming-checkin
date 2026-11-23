-- Undo window without trusting the phone's clock, and device rows that one user can't overwrite for another.
-- Safe to run on a project that already has migrations 1 to 7 (run just this file). The app works with or without it.
--
-- 1. Volunteer undo. The window compares the undo's client_at with the scan's client_at, both stamped by the phone. For
--    two scans from the same phone that stays the rule, on purpose: the clock offset cancels, and a volunteer who
--    undoes within the window while offline must still be accepted when the phone reconnects. So a volunteer can
--    still stretch the window for their own scans from their own phone by setting its clock back; that is not closed
--    and can't be without refusing legitimate offline undos. What this migration changes:
--      - an undo dated before the scan it undoes is refused (a clock set back past the scan);
--      - an undo from a different phone than the scan is judged by the server's own time (it must arrive within the
--        window of the scan arriving), because two phones' clocks can't be compared.
--    The device id is supplied by the phone, so this is about clock skew and mix-ups between phones, not a modified
--    app. Staff and admins are unaffected: they can undo any scan at any time, as before.
-- 2. device_heartbeat. The row was keyed on device_id alone and the upsert overwrote user_id, so any signed-in user who
--    knew (or guessed) another phone's device id could rewrite that phone's row. The row is now keyed on
--    (device_id, user_id): each user can only ever write their own row, and a phone handed to someone else simply gets
--    a second row.

create or replace function _push_event(me staff_users, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p->>'id')::uuid;
  act event_action := coalesce(p->>'action', 'pass')::event_action;
  vid uuid := nullif(p->>'voidsEventId', '')::uuid;
  cat timestamptz := to_timestamp((p->>'clientAt')::numeric / 1000.0);
  tgt scan_events;
begin
  if exists (select 1 from scan_events where id = eid) then return '{"status":"duplicate"}'::jsonb; end if;
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

alter table device_status alter column user_id set not null;
alter table device_status drop constraint device_status_pkey;
alter table device_status add primary key (device_id, user_id);

create or replace function device_heartbeat(p_device_id uuid, p_counter text, p_pending_count int, p_app_version text, p_client_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_staff();
begin
  insert into device_status (device_id, user_id, counter, pending_count, app_version, last_sync_at, clock_offset_ms)
  values (p_device_id, me.id, p_counter, p_pending_count, p_app_version, now(),
          (extract(epoch from (now() - p_client_now)) * 1000)::int)
  on conflict (device_id, user_id) do update set counter = excluded.counter,
    pending_count = excluded.pending_count, app_version = excluded.app_version,
    last_sync_at = excluded.last_sync_at, clock_offset_ms = excluded.clock_offset_ms;
end $$;
