-- Three small admin and staff features. Run after 20261122000011. Only replaces resolve_review (same signature, same
-- grant) and adds two functions, so it is safe to apply while the earlier app is deployed: that app never calls any of them.
--
-- 1. resolve_review: staff say "these are two different guests" and the flag goes away. The flag is the column
--    parties.possible_duplicate_of, so clearing it is an ordinary party change: it gets a new change_seq and every phone
--    picks it up on its next pull, with no new sync channel. The reason goes to the audit log through the party trigger.
--    It takes the same lock as push_batch and update_party, for the same reason (change_seq must follow commit order).
-- 2. admin_set_gate_count: an admin sets how many gate desks there are. Only kind = 'gate' rows are touched. Missing
--    GATE-n rows are added, rows above n are switched off (never deleted: old scans point at them). Phones copy the
--    counters table every ten minutes.
-- 3. admin_list_devices: the phones that have reported in, with the name of the person using each. Staff can read
--    device_status directly but not other people's names, so this is an admin function.

create or replace function resolve_review(p_party_id uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('staff'); why text := btrim(coalesce(p_note, ''));
begin
  if length(why) < 3 then raise exception 'A reason is required'; end if;
  perform pg_advisory_xact_lock(1);
  perform set_config('app.reason', 'Not a duplicate: ' || why, true);
  update parties set possible_duplicate_of = null, updated_by = me.id
  where id = p_party_id and possible_duplicate_of is not null and deleted_at is null;
  if not found then raise exception 'That guest is not flagged for review'; end if;
  insert into review_resolutions (party_id, note, resolved_by) values (p_party_id, why, me.id);
end $$;

create function admin_set_gate_count(p_count int) returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); before int;
begin
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'Choose from 1 to 20 gate desks'; end if;
  select count(*) into before from counters where kind = 'gate' and active;
  insert into counters (code, label, kind, active)
    select 'GATE-' || i, 'Gate desk ' || i, 'gate', true from generate_series(1, p_count) i
  on conflict (code) do nothing;
  update counters set active = (substring(code from 6)::int <= p_count) where kind = 'gate' and code ~ '^GATE-[0-9]+$';
  insert into audit_log (actor_id, table_name, row_id, action, before, after)
  values (me.id, 'counters', 'gates', 'set', jsonb_build_object('gates', before), jsonb_build_object('gates', p_count));
  return (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'kind', kind, 'active', active) order by code), '[]'::jsonb)
          from counters where kind = 'gate');
end $$;

create function admin_list_devices() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_role('admin');
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'deviceId', x.device_id, 'name', x.name, 'email', x.email, 'counter', x.counter, 'pending', x.pending_count,
                     'appVersion', x.app_version, 'lastSyncAt', (extract(epoch from x.last_sync_at) * 1000)::bigint,
                     'clockOffsetMs', x.clock_offset_ms) order by x.last_sync_at desc)
                   from (select d.*, coalesce(s.display_name, split_part(s.email::text, '@', 1)) as name, s.email
                         from device_status d join staff_users s on s.id = d.user_id
                         order by d.last_sync_at desc limit 200) x), '[]'::jsonb);
end $$;

revoke execute on function admin_set_gate_count(int), admin_list_devices() from public, anon;
grant execute on function admin_set_gate_count(int), admin_list_devices() to authenticated;
