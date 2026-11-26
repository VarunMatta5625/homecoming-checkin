-- Flush: an admin clears every check-in so everyone counts as not arrived again (rehearsals and dry runs). Run after
-- 20261122000009. It adds two functions and changes nothing that exists, so it is safe to apply while the earlier app
-- is still deployed.
--
-- How: one void event for every live check-in, written in a single transaction. scan_events stays append-only, nobody's
-- registration is touched, and every phone picks the voids up on its next pull, because a void is a new row with a
-- higher seq (a server delete would be invisible to phones that already hold the rows). The voids carry the reason
-- 'Flush: <why>', method 'staff' and one shared timestamp, so the app can show them as one line.
--
-- On-spot guests (registered in the app) can optionally be removed too: soft-deleted like a guest-list Replace, and
-- their contact rows deleted so a later registration with the same mobile is not flagged as a duplicate of them.
--
-- Same lock as push_batch, so the voids and any phone's scan are applied one after the other.

-- What a flush would do right now, plus phones that still have unsent items (their scans would arrive after the flush
-- and check people in again). device_status is a heartbeat: an offline phone's last report can be old.
create function admin_flush_preview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); parties_in int; people int; scans int; onspot int; phones jsonb;
begin
  select count(*), coalesce(sum(headcount), 0) into parties_in, people from party_state where entered;
  select count(*) into scans from scan_events e
    where e.action = 'pass' and e.checkpoint = 'entry'
      and not exists (select 1 from scan_events v where v.action = 'void' and v.voids_event_id = e.id);
  select count(*) into onspot from parties where source = 'onspot' and deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('counter', d.counter, 'pending', d.pending_count,
                                               'lastSyncAt', (extract(epoch from d.last_sync_at) * 1000)::bigint)
                            order by d.last_sync_at desc), '[]'::jsonb)
    into phones
  from device_status d
  where d.pending_count > 0 and d.last_sync_at > now() - interval '6 hours';
  return jsonb_build_object('checkedIn', parties_in, 'people', people, 'scans', scans, 'onSpot', onspot, 'phones', phones);
end $$;

create function admin_flush_checkins(p_reason text, p_remove_onspot boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); why text := btrim(coalesce(p_reason, '')); voided int; removed int := 0;
begin
  if length(why) < 3 then raise exception 'A reason is required'; end if;
  perform pg_advisory_xact_lock(1);
  perform set_config('app.reason', 'Flush: ' || why, true);

  insert into scan_events (id, party_id, checkpoint, action, qty, voids_event_id, reason, method, actor_id, device_id, client_at, app_version)
  select gen_random_uuid(), e.party_id, 'entry', 'void', 0, e.id, 'Flush: ' || why, 'staff', me.id, gen_random_uuid(), now(), 'server'
  from scan_events e
  where e.action = 'pass' and e.checkpoint = 'entry'
    and not exists (select 1 from scan_events v where v.action = 'void' and v.voids_event_id = e.id);
  get diagnostics voided = row_count;

  if p_remove_onspot then
    select count(*) into removed from parties where source = 'onspot' and deleted_at is null;
    update parties set deleted_at = now(), updated_by = me.id where source = 'onspot' and deleted_at is null;
    delete from party_contacts where party_id in (select id from parties where source = 'onspot' and deleted_at is not null);
  end if;

  insert into audit_log (actor_id, table_name, row_id, action, after, reason)
  values (me.id, 'scan_events', 'all', 'flush', jsonb_build_object('voided', voided, 'removedOnSpot', removed), why);
  return jsonb_build_object('voided', voided, 'removedOnSpot', removed);
end $$;

revoke execute on function admin_flush_preview(), admin_flush_checkins(text, boolean) from public, anon;
grant execute on function admin_flush_preview(), admin_flush_checkins(text, boolean) to authenticated;
