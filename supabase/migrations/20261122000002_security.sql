-- Helpers, triggers, RLS and grants. Build spec section 7.

create function current_staff() returns staff_users
language sql stable security definer set search_path = public as
$$ select * from staff_users where auth_user_id = auth.uid() and active limit 1 $$;

create function is_active_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff_users where auth_user_id = auth.uid() and active) $$;

create function has_role(min_role app_role) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff_users where auth_user_id = auth.uid() and active and role >= min_role) $$;

-- Audit: every change to the tables below is copied to audit_log. RPCs may set app.reason first.
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; a jsonb;
  noise text[] := array['updated_at','change_seq','last_seen_at'];
begin
  if tg_op <> 'INSERT' then b := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then a := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (a - noise) = (b - noise) then return new; end if;
  insert into audit_log (actor_id, table_name, row_id, action, before, after, reason)
  values (
    (select id from staff_users where auth_user_id = auth.uid() limit 1),
    tg_table_name, coalesce(a, b) ->> tg_argv[0], lower(tg_op), b, a,
    nullif(current_setting('app.reason', true), '')
  );
  return coalesce(new, old);
end $$;

create trigger audit_parties        after insert or update or delete on parties        for each row execute function audit_row('id');
create trigger audit_staff_users    after insert or update or delete on staff_users    for each row execute function audit_row('id');
create trigger audit_event_settings after insert or update or delete on event_settings for each row execute function audit_row('id');
create trigger audit_party_contacts after insert or update or delete on party_contacts for each row execute function audit_row('party_id');

create function stamp_party() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.change_seq := nextval('change_seq');
  end if;
  return new;
end $$;
create trigger parties_stamp before update on parties for each row execute function stamp_party();

-- Never lose the last active admin.
create function guard_last_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active) then
    if not exists (select 1 from staff_users where role = 'admin' and active and id <> old.id) then
      raise exception 'Cannot remove, demote or deactivate the last active admin';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger staff_users_last_admin before update or delete on staff_users
  for each row execute function guard_last_admin();

-- RLS on every table. No INSERT/UPDATE/DELETE policies: all writes go through the RPCs.
alter table staff_users        enable row level security;
alter table checkpoints        enable row level security;
alter table counters           enable row level security;
alter table event_settings     enable row level security;
alter table import_batches     enable row level security;
alter table parties            enable row level security;
alter table party_contacts     enable row level security;
alter table scan_events        enable row level security;
alter table review_resolutions enable row level security;
alter table device_status      enable row level security;
alter table audit_log          enable row level security;

create policy read_parties    on parties        for select to authenticated using (is_active_staff());
create policy read_events     on scan_events    for select to authenticated using (is_active_staff());
create policy read_checkpts   on checkpoints    for select to authenticated using (is_active_staff());
create policy read_counters   on counters       for select to authenticated using (is_active_staff());
create policy read_settings   on event_settings for select to authenticated using (is_active_staff());
create policy read_contacts   on party_contacts     for select to authenticated using (has_role('staff'));
create policy read_resolved   on review_resolutions for select to authenticated using (has_role('staff'));
create policy read_devices    on device_status      for select to authenticated using (has_role('staff'));
create policy read_users      on staff_users    for select to authenticated using (has_role('admin') or auth_user_id = auth.uid());
create policy read_audit      on audit_log      for select to authenticated using (has_role('admin'));
create policy read_batches    on import_batches for select to authenticated using (has_role('admin'));

-- Grants: read only, for signed-in users. Nothing for anon. Writes only via RPCs.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant select on parties, scan_events, checkpoints, counters, event_settings, party_contacts,
  review_resolutions, device_status, staff_users, audit_log, import_batches, party_state to authenticated;
grant execute on function current_staff(), is_active_staff(), has_role(app_role) to authenticated;
