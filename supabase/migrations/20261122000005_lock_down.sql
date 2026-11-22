-- Lock-down pass. Safe to run on a project that already has migrations 1 to 4 (run just this file there).
--
-- 1. Signed-out visitors (the anon role) could still call the public RPCs. They were refused inside the function
--    ("not authorised"), so no data leaked, but the door itself should be shut. Migration 2 stripped function
--    grants before the RPCs of migration 3 existed, and those new functions got the Postgres/Supabase defaults.
-- 2. Staff could read every mobile number and email straight from the party_contacts table, which skipped the audit
--    row that get_party_contact writes. Contacts are now readable only through that audited function.
-- 3. Everyone signed in could read parties.notes (free text that can hold personal details) straight from the table.
--    The roster snapshot never included it. Notes are now hidden from direct reads too.
-- 4. A void event could point at another guest's scan, or at another void. Both are now rejected.

-- 1. RPC access: signed-in users only, and only the functions the app calls.
-- Postgres gives every new function EXECUTE to PUBLIC, which a schema default cannot take away, so a function added
-- later still needs its own "revoke execute ... from public, anon" (the check in test/checks.sql catches a miss).
alter default privileges in schema public revoke execute on functions from anon;
revoke execute on all functions in schema public from public, anon;
revoke execute on function audit_row(), stamp_party(), guard_last_admin(), forbid_mutation() from authenticated;
grant execute on function current_staff(), is_active_staff(), has_role(app_role), whoami(), get_snapshot(bigint, bigint, int),
  push_batch(jsonb), device_heartbeat(uuid, text, int, text, timestamptz), get_party_contact(uuid), resolve_review(uuid, text),
  update_party(uuid, jsonb, text), admin_set_user(text, text, app_role, boolean), admin_list_users(),
  audit_feed(int, bigint) to authenticated;

-- 2. Contacts only through get_party_contact (SECURITY DEFINER, so it still reads the table).
drop policy if exists read_contacts on party_contacts;
revoke select on party_contacts from authenticated;

-- 3. Everything on parties except notes.
revoke select on parties from authenticated;
grant select (id, pass_code, qr_token, source, lead_name, batch_year, decade, school, department, course, mobile_last4,
              spouse, children, party_size, entitled_override, parking, accommodation, registration_status,
              possible_duplicate_of, import_batch_id, deleted_at, created_by, created_at, updated_by, updated_at, change_seq)
  on parties to authenticated;

-- 4. Void checks. Same function as migration 3, plus two lines.
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
      if cat - tgt.client_at > interval '120 seconds' then raise exception 'Undo window has passed'; end if;
    end if;
  end if;
  insert into scan_events (id, party_id, checkpoint, action, qty, voids_event_id, reason, override_reason, method,
                           actor_id, counter, device_id, client_at, app_version)
  values (eid, (p->>'partyId')::uuid, p->>'checkpoint', act, coalesce((p->>'qty')::int, 1), vid,
          nullif(p->>'reason', ''), nullif(p->>'overrideReason', ''), p->>'method',
          me.id, nullif(p->>'counter', ''), (p->>'deviceId')::uuid, cat, p->>'appVersion');
  return '{"status":"accepted"}'::jsonb;
end $$;
