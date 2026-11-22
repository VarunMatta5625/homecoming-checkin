-- RPCs. Build spec section 7. All SECURITY DEFINER with a fixed search_path; the caller is
-- always identified from auth.uid(), never from anything the client sends.

create function _require_staff() returns staff_users language plpgsql stable security definer set search_path = public as $$
declare me staff_users;
begin
  select * into me from staff_users where auth_user_id = auth.uid() and active;
  if not found then raise exception 'not authorised' using errcode = '42501'; end if;
  return me;
end $$;

create function _require_role(min_role app_role) returns staff_users language plpgsql stable security definer set search_path = public as $$
declare me staff_users := _require_staff();
begin
  if me.role < min_role then raise exception 'not authorised' using errcode = '42501'; end if;
  return me;
end $$;

-- Links the signed-in auth user to the allowlist by verified email. null => "Not authorised".
create function whoami() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok boolean; s staff_users;
begin
  if uid is null then return null; end if;
  select lower(u.email), (u.email_confirmed_at is not null) into em, ok from auth.users u where u.id = uid;
  if em is null or not ok then return null; end if;
  select * into s from staff_users where email = em;
  if not found then return null; end if;
  if not s.active then return jsonb_build_object('active', false); end if;
  if s.auth_user_id is not null and s.auth_user_id <> uid then return null; end if;
  update staff_users set auth_user_id = uid, last_seen_at = now() where id = s.id returning * into s;
  return jsonb_build_object('id', s.id, 'email', s.email, 'role', s.role, 'active', true,
                            'name', coalesce(s.display_name, split_part(s.email::text, '@', 1)));
end $$;

-- Paged pull, used for the first download and for later catch-up. No PII: roster rows only.
create function get_snapshot(p_party_after bigint default 0, p_event_after bigint default 0, p_limit int default 1000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ps jsonb; es jsonb; pc bigint; ec bigint; pn int; en int;
begin
  perform _require_staff();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.change_seq), '[]'::jsonb), coalesce(max(x.change_seq), p_party_after), count(*)
    into ps, pc, pn
  from (select id, pass_code, qr_token, source, lead_name, batch_year, school, department, course, mobile_last4,
               spouse, children, party_size, entitled_override, parking, possible_duplicate_of, deleted_at, change_seq
        from parties where change_seq > p_party_after order by change_seq limit p_limit) x;
  select coalesce(jsonb_agg(to_jsonb(y) order by y.seq), '[]'::jsonb), coalesce(max(y.seq), p_event_after), count(*)
    into es, ec, en
  from (select e.id, e.seq, e.party_id, e.checkpoint, e.action, e.qty, e.voids_event_id, e.reason, e.override_reason,
               e.method, e.actor_id, coalesce(s.display_name, split_part(s.email::text, '@', 1)) as actor_name, e.counter,
               e.device_id, (extract(epoch from e.client_at) * 1000)::bigint as client_at,
               (extract(epoch from e.received_at) * 1000)::bigint as received_at
        from scan_events e left join staff_users s on s.id = e.actor_id
        where e.seq > p_event_after order by e.seq limit p_limit) y;
  return jsonb_build_object('parties', ps, 'events', es, 'party_cursor', pc, 'event_cursor', ec,
                            'more', (pn = p_limit or en = p_limit));
end $$;

create function _push_party(me staff_users, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare pt jsonb := p->'party'; ct jsonb := p->'contact'; pid uuid := (pt->>'id')::uuid; digits text; mob text; dup uuid;
begin
  if exists (select 1 from parties where id = pid) then return '{"status":"duplicate"}'::jsonb; end if;
  digits := right(regexp_replace(coalesce(ct->>'mobile', ''), '\D', '', 'g'), 10);
  if length(digits) <> 10 then raise exception 'Mobile needs 10 digits'; end if;
  mob := '+91' || digits;
  -- Same mobile as an existing party: still create it, but flag it. Never auto-merge.
  select party_id into dup from party_contacts where mobile = mob limit 1;
  insert into parties (id, pass_code, qr_token, source, lead_name, batch_year, school, department, course, mobile_last4,
                       spouse, children, parking, possible_duplicate_of, created_by, updated_by)
  values (pid, pt->>'passCode', pt->>'qrToken', 'onspot', btrim(pt->>'leadName'), (pt->>'batchYear')::int,
          pt->>'school', pt->>'department', pt->>'course', right(digits, 4),
          (pt->>'spouse')::ynm, (pt->>'children')::int, coalesce(pt->>'parking', 'none')::parking_type, dup, me.id, me.id);
  insert into party_contacts (party_id, mobile, email) values (pid, mob, nullif(btrim(ct->>'email'), ''));
  return '{"status":"accepted"}'::jsonb;
end $$;

create function _push_event(me staff_users, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
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
    if not found then raise exception 'Nothing to undo'; end if;
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

-- Ordered batch from the phone's outbox. One bad item never blocks the others.
create function push_batch(items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_staff(); it jsonb; r jsonb; res jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(1);   -- seq / change_seq order == commit order, so cursor pulls are safe
  for it in select value from jsonb_array_elements(items) loop
    begin
      r := case it->>'type'
             when 'party' then _push_party(me, it->'payload')
             when 'event' then _push_event(me, it->'payload')
             else jsonb_build_object('status', 'rejected', 'reason', 'Unknown item type') end;
    exception when others then
      r := jsonb_build_object('status', 'rejected', 'reason', sqlerrm);
    end;
    res := res || jsonb_build_array(jsonb_build_object('id', it->>'id') || r);
  end loop;
  return res;
end $$;

create function device_heartbeat(p_device_id uuid, p_counter text, p_pending_count int, p_app_version text, p_client_now timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_staff();
begin
  insert into device_status (device_id, user_id, counter, pending_count, app_version, last_sync_at, clock_offset_ms)
  values (p_device_id, me.id, p_counter, p_pending_count, p_app_version, now(),
          (extract(epoch from (now() - p_client_now)) * 1000)::int)
  on conflict (device_id) do update set user_id = excluded.user_id, counter = excluded.counter,
    pending_count = excluded.pending_count, app_version = excluded.app_version,
    last_sync_at = excluded.last_sync_at, clock_offset_ms = excluded.clock_offset_ms;
end $$;

-- Staff and up -------------------------------------------------------------------------------

create function get_party_contact(p_party_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('staff'); c party_contacts;
begin
  select * into c from party_contacts where party_id = p_party_id;
  insert into audit_log (actor_id, table_name, row_id, action) values (me.id, 'party_contacts', p_party_id::text, 'read');
  return jsonb_build_object('mobile', c.mobile, 'email', c.email);
end $$;

create function resolve_review(p_party_id uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('staff');
begin
  insert into review_resolutions (party_id, note, resolved_by) values (p_party_id, p_note, me.id);
end $$;

create function update_party(p_id uuid, p_patch jsonb, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('staff');
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  perform set_config('app.reason', p_reason, true);
  update parties set
    lead_name         = coalesce(p_patch->>'lead_name', lead_name),
    batch_year        = coalesce((p_patch->>'batch_year')::int, batch_year),
    school            = coalesce(p_patch->>'school', school),
    department        = coalesce(p_patch->>'department', department),
    course            = coalesce(p_patch->>'course', course),
    spouse            = coalesce((p_patch->>'spouse')::ynm, spouse),
    children          = coalesce((p_patch->>'children')::int, children),
    entitled_override = case when p_patch ? 'entitled_override' then (p_patch->>'entitled_override')::int else entitled_override end,
    parking           = coalesce((p_patch->>'parking')::parking_type, parking),
    notes             = coalesce(p_patch->>'notes', notes),
    updated_by        = me.id
  where id = p_id;
  if not found then raise exception 'Unknown party'; end if;
end $$;

-- Admin only ---------------------------------------------------------------------------------

create function admin_set_user(p_email text, p_name text, p_role app_role, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); s staff_users;
begin
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  insert into staff_users (email, display_name, role, active, created_by)
  values (lower(btrim(p_email)), nullif(btrim(p_name), ''), p_role, p_active, me.id)
  on conflict (email) do update set display_name = excluded.display_name, role = excluded.role,
    active = excluded.active, updated_at = now()
  returning * into s;
  return jsonb_build_object('email', s.email, 'name', coalesce(s.display_name, ''), 'role', s.role, 'active', s.active);
end $$;

create function admin_list_users() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_role('admin');
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', coalesce(display_name, ''), 'role', role, 'active', active)
                                    order by role desc, email) from staff_users), '[]'::jsonb);
end $$;

create function audit_feed(p_limit int default 100, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_role('admin');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
    select a.id, a.at, s.email as actor_email, a.table_name, a.row_id, a.action, a.before, a.after, a.reason
    from audit_log a left join staff_users s on s.id = a.actor_id
    where p_before is null or a.id < p_before order by a.id desc limit least(p_limit, 500)) x), '[]'::jsonb);
end $$;

-- Only the public RPCs are callable by signed-in users. The _helpers stay private.
revoke execute on function _require_staff(), _require_role(app_role), _push_party(staff_users, jsonb), _push_event(staff_users, jsonb) from public, anon, authenticated;
grant execute on function whoami(), get_snapshot(bigint, bigint, int), push_batch(jsonb),
  device_heartbeat(uuid, text, int, text, timestamptz), get_party_contact(uuid), resolve_review(uuid, text),
  update_party(uuid, jsonb, text), admin_set_user(text, text, app_role, boolean), admin_list_users(),
  audit_feed(int, bigint) to authenticated;
