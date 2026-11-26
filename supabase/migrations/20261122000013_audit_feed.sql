-- The audit log an admin reads in the app: everything from the start (or from the last "clear") to now, check-ins and undos
-- included. Run after 20261122000012. Replaces audit_feed (nothing in either app called it) and adds admin_clear_audit_log.
--
-- What the feed returns. Only what one line on screen needs, never the raw before/after rows: the audit table holds full
-- mobile numbers and emails of guests (from party_contacts) and those must not reach a phone. Rows are classified here
-- ('kind') so the app only has to word them.
--   - audit_log rows, plus scan_events rows (check-in, undo, staff reset) so one list covers everything.
--   - Per-guest contact rows written by an import or an on-spot registration are left out; contact *reads* stay in.
--   - Bulk rows share a transaction, so rows with the same person, table, action, reason and timestamp collapse into one
--     line with a count: a 5000-guest import is one line. Grouping happens before paging, so a line never splits.
--   - The voids a flush writes are left out: the flush has its own line.
--   - Newest first, paged by a cursor of (time, key). Times are microseconds since 1970.
--
-- "Clear" does not delete anything. It stores the moment in event_settings.audit_since and the feed starts there. The
-- log and the scans stay in the database (and can be shown again by setting audit_since back to null). Refused once the
-- event is live, so the real day can never be hidden.

alter table event_settings add column audit_since timestamptz;

drop function audit_feed(int, bigint);

create function audit_feed(p_limit int default 100, p_before_us bigint default null, p_before_key text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz; lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  perform _require_role('admin');
  select audit_since into since from event_settings;
  return jsonb_build_object(
    'since', case when since is null then null else (extract(epoch from since) * 1000)::bigint end,
    'entries', coalesce((
      with logrows as (
        select a.*,
               case when a.table_name = 'parties' and a.reason is not null
                    then coalesce(a.actor_id::text, '') || '|' || a.action || '|' || a.reason || '|' || a.at::text
                    else a.id::text end as grp
        from audit_log a
        where (since is null or a.at >= since)
          and not (a.table_name = 'party_contacts' and a.action <> 'read')
          and not (a.table_name = 'event_settings' and a.action = 'update'
                   and (a.before - 'audit_since' - 'updated_at') = (a.after - 'audit_since' - 'updated_at'))
      ), logs as (
        select distinct on (grp) l.*, count(*) over (partition by grp)::int as n
        from logrows l order by grp, id desc
      ), entries as (
        select 'a' || lpad(l.id::text, 20, '0') as key,
               (extract(epoch from l.at) * 1000000)::bigint as at_us,
               coalesce(s.display_name, split_part(s.email::text, '@', 1), 'System') as actor,
               case
                 when l.table_name = 'parties' and l.action = 'insert' and l.reason like 'Guest list import%' then 'guests_imported'
                 when l.table_name = 'parties' and l.action = 'insert' then 'guest_added'
                 when l.table_name = 'parties' and l.action = 'update' and l.before->>'deleted_at' is null and l.after->>'deleted_at' is not null then 'guest_removed'
                 when l.table_name = 'parties' and l.action = 'update' and l.before->>'possible_duplicate_of' is not null and l.after->>'possible_duplicate_of' is null then 'review_cleared'
                 when l.table_name = 'parties' and l.action = 'update' then 'guest_edited'
                 when l.table_name = 'party_contacts' and l.row_id = 'all' then 'passes_exported'
                 when l.table_name = 'party_contacts' then 'contact_read'
                 when l.table_name = 'staff_users' and l.action = 'insert' then 'user_added'
                 when l.table_name = 'staff_users' and l.action = 'delete' then 'user_deleted'
                 when l.table_name = 'staff_users' and l.before->>'auth_user_id' is null and l.after->>'auth_user_id' is not null then 'user_linked'
                 when l.table_name = 'staff_users' then 'user_changed'
                 when l.table_name = 'event_settings' and l.action = 'clear' then 'audit_cleared'
                 when l.table_name = 'event_settings' then 'settings_changed'
                 when l.table_name = 'scan_events' and l.action = 'flush' then 'flush'
                 when l.table_name = 'counters' then 'gates_set'
                 else 'other'
               end as kind,
               case
                 when l.table_name = 'parties' then coalesce(l.after, l.before)->>'lead_name'
                 when l.table_name = 'staff_users' then coalesce(l.after, l.before)->>'email'
                 when l.table_name = 'party_contacts' and l.row_id ~ '^[0-9a-f-]{36}$' then (select p.lead_name from parties p where p.id = l.row_id::uuid)
               end as subject,
               case
                 when l.table_name = 'parties' then l.row_id::uuid
                 when l.table_name = 'party_contacts' and l.row_id ~ '^[0-9a-f-]{36}$' then l.row_id::uuid
               end as party_id,
               l.reason, l.n,
               case
                 when l.table_name = 'parties' and l.action = 'update' then jsonb_build_object('changed', coalesce(
                   (select jsonb_agg(k order by k) from jsonb_object_keys(l.after) k
                    where l.after->k is distinct from l.before->k and k not in ('updated_at', 'change_seq', 'updated_by')), '[]'::jsonb))
                 when l.table_name = 'parties' then jsonb_build_object('source', l.after->>'source')
                 when l.table_name = 'staff_users' then jsonb_build_object(
                   'role', coalesce(l.after, l.before)->>'role', 'wasRole', l.before->>'role',
                   'active', (coalesce(l.after, l.before)->>'active')::boolean, 'wasActive', (l.before->>'active')::boolean)
                 when l.table_name in ('scan_events', 'counters') then coalesce(l.after, '{}'::jsonb)
                 else '{}'::jsonb
               end as extra
        from logs l left join staff_users s on s.id = l.actor_id
        union all
        select 's' || lpad(e.seq::text, 20, '0'),
               (extract(epoch from e.received_at) * 1000000)::bigint,
               coalesce(s.display_name, split_part(s.email::text, '@', 1), 'System'),
               case when e.action = 'pass' then 'checkin' when e.method = 'staff' then 'reset' else 'undo' end,
               p.lead_name, e.party_id, e.reason, 1,
               jsonb_build_object('qty', e.qty, 'counter', e.counter)
        from scan_events e left join staff_users s on s.id = e.actor_id left join parties p on p.id = e.party_id
        where (since is null or e.received_at >= since)
          and not (e.action = 'void' and e.reason like 'Flush: %')
      ), page as (
        select * from entries
        where p_before_us is null or (at_us, key) < (p_before_us, p_before_key)
        order by at_us desc, key desc limit lim
      )
      select jsonb_agg(jsonb_build_object('key', key, 'atUs', at_us, 'actor', actor, 'kind', kind, 'subject', subject,
                                          'partyId', party_id, 'reason', reason, 'n', n, 'extra', extra) order by at_us desc, key desc)
      from page
    ), '[]'::jsonb));
end $$;

create function admin_clear_audit_log(p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); why text := btrim(coalesce(p_reason, ''));
begin
  if length(why) < 3 then raise exception 'A reason is required'; end if;
  if (select is_live from event_settings) then raise exception 'The event is live: the audit log can no longer be cleared'; end if;
  update event_settings set audit_since = now(), updated_at = now();
  -- Same timestamp as audit_since (both are the transaction time), so this line is the first one the cleared feed shows.
  insert into audit_log (actor_id, table_name, row_id, action, reason) values (me.id, 'event_settings', 'audit', 'clear', why);
  return jsonb_build_object('since', (extract(epoch from now()) * 1000)::bigint);
end $$;

revoke execute on function audit_feed(int, bigint, text), admin_clear_audit_log(text) from public, anon;
grant execute on function audit_feed(int, bigint, text), admin_clear_audit_log(text) to authenticated;
