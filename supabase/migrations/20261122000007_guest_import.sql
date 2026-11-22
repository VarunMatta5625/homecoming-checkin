-- Guest list import and pass-list export, for admins. Run after 20261122000006.
--
-- admin_import_guests: loads a whole guest list in one transaction (all rows or none). "Add" keeps the current guests.
--   "Replace" first retires every current guest (soft delete: deleted_at is set, so phones pick the change up), and is
--   refused once the event is live or any scan exists. Pass codes and QR tokens are made here, never by the browser.
--   The work is set-based (one insert for all guests): a per-row loop that looks things up gets slower with every row,
--   and the hosted database cancels any request after about 8 seconds.
-- admin_export_passes: every current guest with their pass code, QR token and contact, for the SMS and QR print steps.
--   Each export is recorded in audit_log, like opening one guest's contact.

-- Private helpers: one random GH26-XXXXX candidate, and n different codes that no guest (current or retired) has.
create function _pass_code_candidate() returns text language plpgsql volatile set search_path = public as $$
declare alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ'; b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); c text := 'GH26-'; i int;
begin
  for i in 0..4 loop c := c || substr(alphabet, get_byte(b, i) % 30 + 1, 1); end loop;
  return c;
end $$;

create function _new_pass_codes(n int) returns text[] language plpgsql volatile set search_path = public as $$
declare codes text[] := '{}'; got text[];
begin
  loop
    select coalesce(array_agg(x.c), '{}') into got from (
      select u.c from (select distinct _pass_code_candidate() as c from generate_series(1, (n - cardinality(codes)) + (n - cardinality(codes)) / 4 + 20)) u
      where not exists (select 1 from parties p where p.pass_code = u.c) and u.c <> all (codes)
      limit n - cardinality(codes)) x;
    codes := codes || got;
    exit when cardinality(codes) >= n;
  end loop;
  return codes;
end $$;

-- p_rows: [{name, batchYear, school, department, course, mobile, email, spouse, children, parking, accommodation, dinnerOverride}]
create function admin_import_guests(p_filename text, p_rows jsonb, p_replace boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := _require_role('admin');
  batch uuid := gen_random_uuid();
  r jsonb; n int := 0; flagged int; retired int := 0; codes text[];
  nm text; v text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The file has no guests'; end if;
  if jsonb_array_length(p_rows) > 10000 then raise exception 'Too many guests in one file (limit 10000). Split it and use Add.'; end if;
  -- Same lock push_batch takes: change numbers then follow commit order, so no phone can miss a row.
  perform pg_advisory_xact_lock(1);

  -- Check every row first, so a bad file changes nothing and the message names the guest.
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    nm := btrim(coalesce(r->>'name', ''));
    if length(nm) < 2 then raise exception 'Guest %: the name is missing', n; end if;
    if coalesce(r->>'batchYear', '') !~ '^\d{4}$' then raise exception 'Guest % (%): the batch year must be a 4-digit year', n, nm; end if;
    if length(right(regexp_replace(coalesce(r->>'mobile', ''), '\D', '', 'g'), 10)) <> 10 then raise exception 'Guest % (%): the mobile needs 10 digits', n, nm; end if;
    if coalesce(nullif(r->>'spouse', ''), 'no') not in ('no', 'yes', 'maybe') then raise exception 'Guest % (%): spouse must be no, yes or maybe', n, nm; end if;
    if coalesce(nullif(r->>'parking', ''), 'none') not in ('none', 'two_wheeler', 'four_wheeler') then raise exception 'Guest % (%): parking must be none, two_wheeler or four_wheeler', n, nm; end if;
    v := nullif(r->>'accommodation', '');
    if v is not null and v not in ('no', 'yes', 'maybe') then raise exception 'Guest % (%): accommodation must be no, yes or maybe', n, nm; end if;
    v := coalesce(nullif(r->>'children', ''), '0');
    if v !~ '^\d{1,2}$' or v::int > 10 then raise exception 'Guest % (%): children must be a number from 0 to 10', n, nm; end if;
    v := nullif(r->>'dinnerOverride', '');
    if v is not null and v !~ '^\d{1,3}$' then raise exception 'Guest % (%): dinner override must be a whole number', n, nm; end if;
    v := nullif(btrim(coalesce(r->>'email', '')), '');
    if v is not null and v !~ '^[^@\s]+@[^@\s]+$' then raise exception 'Guest % (%): the email does not look right', n, nm; end if;
  end loop;

  perform set_config('app.reason', 'Guest list import' || coalesce(': ' || nullif(btrim(p_filename), ''), ''), true);
  if p_replace then
    if (select is_live from event_settings) then raise exception 'The event is live: the guest list can no longer be replaced. Use Add.'; end if;
    if exists (select 1 from scan_events) then
      raise exception 'Scans already exist, so the list cannot be replaced. Clear the test activity first (see supabase/README.md), then import again.';
    end if;
    update parties set deleted_at = now(), updated_by = me.id where deleted_at is null;
    get diagnostics retired = row_count;
  end if;

  insert into import_batches (id, filename, row_count) values (batch, nullif(btrim(p_filename), ''), n);
  codes := _new_pass_codes(n);

  -- One statement for everyone. A guest whose mobile is already on a current guest, or on an earlier row of this file,
  -- is still created but flagged (possible_duplicate_of). Never merged. Retired guests do not count.
  with rw as materialized (
    select t.n::int as n, gen_random_uuid() as pid, btrim(t.r->>'name') as nm, (t.r->>'batchYear')::int as yr,
           nullif(btrim(t.r->>'school'), '') as school, nullif(btrim(t.r->>'department'), '') as department,
           nullif(btrim(t.r->>'course'), '') as course, d.digits, '+91' || d.digits as mob,
           nullif(btrim(coalesce(t.r->>'email', '')), '') as email,
           coalesce(nullif(t.r->>'spouse', ''), 'no') as spouse, coalesce(nullif(t.r->>'children', ''), '0')::int as children,
           coalesce(nullif(t.r->>'parking', ''), 'none') as parking, nullif(t.r->>'accommodation', '') as acc,
           nullif(t.r->>'dinnerOverride', '')::int as ovr
    from jsonb_array_elements(p_rows) with ordinality as t(r, n),
         lateral (select right(regexp_replace(coalesce(t.r->>'mobile', ''), '\D', '', 'g'), 10) as digits) d
  ), existing as materialized (
    select distinct on (c.mobile) c.mobile, c.party_id
    from party_contacts c join parties p on p.id = c.party_id
    where p.deleted_at is null and p.id <> all (select pid from rw)
    order by c.mobile, p.created_at, p.id
  ), flagged_rows as materialized (
    select rw.n, rw.pid,
           coalesce(ex.party_id, case when first_value(rw.n) over w < rw.n then first_value(rw.pid) over w end) as dup
    from rw left join existing ex on ex.mobile = rw.mob
    window w as (partition by rw.mob order by rw.n)
  ), made as (
    insert into parties (id, pass_code, qr_token, source, lead_name, batch_year, school, department, course, mobile_last4,
                         spouse, children, entitled_override, parking, accommodation, possible_duplicate_of, import_batch_id,
                         created_by, updated_by)
    select rw.pid, u.code, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'),
           'booked', rw.nm, rw.yr, rw.school, rw.department, rw.course, right(rw.digits, 4), rw.spouse::ynm, rw.children, rw.ovr,
           rw.parking::parking_type, rw.acc::ynm, f.dup, batch, me.id, me.id
    from rw join flagged_rows f on f.n = rw.n join unnest(codes) with ordinality as u(code, n) on u.n = rw.n
    returning id
  )
  insert into party_contacts (party_id, mobile, email) select rw.pid, rw.mob, rw.email from rw;

  select count(*) into flagged from parties where import_batch_id = batch and possible_duplicate_of is not null;
  return jsonb_build_object('batch', batch, 'imported', n, 'flagged', flagged, 'retired', retired);
end $$;

create function admin_export_passes() returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'pass_code', p.pass_code, 'qr_token', p.qr_token, 'lead_name', p.lead_name, 'batch_year', p.batch_year,
           'school', p.school, 'department', p.department, 'course', p.course, 'mobile_last4', p.mobile_last4,
           'spouse', p.spouse, 'children', p.children, 'party_size', p.party_size, 'parking', p.parking,
           'mobile', c.mobile, 'email', c.email) order by p.pass_code), '[]'::jsonb)
    into out
  from parties p left join party_contacts c on c.party_id = p.id
  where p.deleted_at is null;
  insert into audit_log (actor_id, table_name, row_id, action, after, reason)
  values (me.id, 'party_contacts', 'all', 'read', jsonb_build_object('guests', jsonb_array_length(out)), 'Pass list export');
  return out;
end $$;

revoke execute on function _pass_code_candidate(), _new_pass_codes(int) from public, anon, authenticated;
revoke execute on function admin_import_guests(text, jsonb, boolean), admin_export_passes() from public, anon;
grant execute on function admin_import_guests(text, jsonb, boolean), admin_export_passes() to authenticated;
