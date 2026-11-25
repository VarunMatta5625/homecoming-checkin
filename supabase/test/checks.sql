-- Acceptance checks from the build spec, run as real roles against the migrations.
create function _as(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = who), true);
  execute 'set local role authenticated';
end $$;
create function _back() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
-- Runs sql; returns the error text, or null when it succeeded.
create function _try(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;
create function _ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
create function _ev(pid uuid, cp text, qty int, who uuid, dev uuid, ago_s int default 0, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'type', 'event', 'payload', jsonb_build_object(
    'id', gen_random_uuid(), 'partyId', pid, 'checkpoint', cp, 'action', 'pass', 'qty', qty, 'method', 'qr',
    'counter', case cp when 'entry' then 'GATE-1' else 'DINNER-1' end, 'deviceId', dev,
    'clientAt', ((extract(epoch from now()) - ago_s) * 1000)::bigint) || extra) $$;

grant execute on function _as(text), _back(), _try(text), _ok(boolean, text), _ev(uuid, text, int, uuid, uuid, int, jsonb) to authenticated;

do $t$
declare
  pa uuid; pb uuid; pc uuid; d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid();
  it jsonb; r jsonb; ent int; n int; v1 uuid; err text; ev jsonb; ev3 jsonb; evid text;
begin
  insert into auth.users (email, email_confirmed_at) values
    ('admin@homecoming.test', now()), ('staff@homecoming.test', now()), ('volunteer1@homecoming.test', now()),
    ('volunteer2@homecoming.test', now()), ('inactive@homecoming.test', now()), ('unlisted@homecoming.test', now());
  select id into pa from parties order by lead_name, id limit 1 offset 0;
  select id into pb from parties order by lead_name, id limit 1 offset 1;
  select id into pc from parties order by lead_name, id limit 1 offset 2;

  -- Unlisted account: nothing at all
  perform _as('unlisted@homecoming.test');
  perform _ok(whoami() is null, 'unlisted account: whoami returns null (Not authorised)');
  perform _ok((select count(*) from parties) = 0, 'unlisted account: sees no parties');
  perform _ok(_try('select get_snapshot()') is not null, 'unlisted account: get_snapshot refused');
  perform _ok(_try('select push_batch(''[]''::jsonb)') is not null, 'unlisted account: push_batch refused');
  perform _back();

  perform _as('inactive@homecoming.test');
  perform _ok((whoami()->>'active')::boolean = false, 'inactive account: whoami says inactive');
  perform _ok((select count(*) from parties) = 0, 'inactive account: sees no parties');
  perform _back();

  -- Link accounts by verified email
  perform _as('admin@homecoming.test');     perform _ok(whoami()->>'role' = 'admin', 'admin links and gets role admin'); perform _back();
  perform _as('staff@homecoming.test');     perform _ok(whoami()->>'role' = 'staff', 'staff links and gets role staff'); perform _back();
  perform _as('volunteer1@homecoming.test'); perform _ok(whoami()->>'role' = 'volunteer', 'volunteer 1 links'); perform _back();
  perform _as('volunteer2@homecoming.test'); perform _ok(whoami()->>'role' = 'volunteer', 'volunteer 2 links'); perform _back();

  -- Volunteer cannot reach staff/admin things
  perform _as('volunteer1@homecoming.test');
  perform _ok((select count(*) from parties) = 120, 'volunteer reads the roster');
  perform _ok(_try('select count(*) from party_contacts') like 'permission denied%', 'volunteer cannot read party_contacts');
  perform _ok(_try('select notes from parties') like 'permission denied%', 'volunteer cannot read parties.notes');
  perform _ok(_try('select get_party_contact(''' || pa || ''')') is not null, 'volunteer cannot call get_party_contact');
  perform _ok(_try('select resolve_review(''' || pa || ''', ''x'')') is not null, 'volunteer cannot resolve a review');
  perform _ok(_try('select admin_set_user(''a@b.co'', ''A'', ''admin'', true)') is not null, 'volunteer cannot call admin_set_user');
  perform _ok(_try('select audit_feed()') is not null, 'volunteer cannot read the audit feed');
  perform _ok((select count(*) from staff_users) = 1, 'volunteer sees only their own staff_users row');
  perform _ok(_try('insert into parties (id, pass_code, qr_token, lead_name, batch_year) values (gen_random_uuid(), ''X'', ''X'', ''X'', 2000)') is not null, 'no direct insert into parties');
  perform _ok(_try('delete from scan_events') is not null, 'no direct delete on scan_events');
  perform _ok(not (get_snapshot()::text like '%+91%' or get_snapshot()::text like '%@%' or get_snapshot()::text like '%90000%'), 'snapshot has no mobile numbers or emails');
  perform _back();

  -- push_batch: accepted, then replay creates no duplicates
  perform _as('volunteer1@homecoming.test');
  it := jsonb_build_array(_ev(pa, 'entry', 2, null, d1), _ev(pa, 'entry', 1, null, d1));
  r := push_batch(it);
  perform _ok(r->0->>'status' = 'accepted' and r->1->>'status' = 'accepted', 'push_batch accepts new items');
  r := push_batch(it);
  perform _ok(r->0->>'status' = 'duplicate' and r->1->>'status' = 'duplicate', 'replaying the same batch returns duplicate');
  perform _back();
  perform _ok((select count(*) from scan_events where party_id = pa) = 2, 'replay created no duplicate events');

  -- Two devices check in the same party: the earliest counts and the repeat is flagged
  perform _as('volunteer1@homecoming.test'); perform push_batch(jsonb_build_array(_ev(pb, 'entry', 1, null, d1))); perform _back();
  perform _as('volunteer2@homecoming.test'); perform push_batch(jsonb_build_array(_ev(pb, 'entry', 1, null, d2))); perform _back();
  perform _ok((select duplicate_entry from party_state where party_id = pb), 'a second check-in of the same party is flagged as a repeat');
  perform _ok((select entered from party_state where party_id = pb), 'the party counts as checked in');

  -- Only check-ins are recorded
  perform _as('volunteer1@homecoming.test'); r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 1, null, d1))); perform _back();
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Only check-ins%', 'a dinner scan is refused: only check-ins are recorded');
  perform _ok((select not entered from party_state where party_id = pc), 'a refused dinner scan checks nobody in');

  -- Undo rules
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pc, 'entry', 1, null, d1);
  perform push_batch(jsonb_build_array(ev));
  evid := ev->'payload'->>'id';
  perform _back();
  perform _as('volunteer2@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d2, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'Wrong guest'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%own scans%', 'volunteer cannot undo someone else''s scan');
  perform _back();
  perform _as('volunteer1@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'Tapped by mistake'))));
  perform _ok(r->0->>'status' = 'accepted', 'volunteer can undo their own scan in time');
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'again'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Already undone%', 'cannot undo the same scan twice');
  ev := _ev(pc, 'entry', 1, null, d1, 300);
  perform push_batch(jsonb_build_array(ev));
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'late'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%window%', 'volunteer cannot undo after 120 seconds');
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'x', 'method', 'staff'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Staff only%', 'volunteer cannot send a staff-method event');
  perform _back();
  perform _as('staff@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'Guest left', 'method', 'staff'))));
  perform _ok(r->0->>'status' = 'accepted', 'staff can undo any scan, any time');
  perform _ok(_try('select mobile from party_contacts') like 'permission denied%', 'staff cannot read party_contacts directly (only through the audited function)');
  perform _ok(_try('select notes from parties') like 'permission denied%', 'staff cannot read parties.notes directly');
  perform _back();

  -- A void must target a plain scan of the same guest
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pa, 'entry', 1, null, d1);
  perform push_batch(jsonb_build_array(ev));
  r := push_batch(jsonb_build_array(_ev(pb, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'wrong guest'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%another guest%', 'a void cannot point at another guest''s scan');
  ev3 := _ev(pa, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'oops'));
  perform push_batch(jsonb_build_array(ev3));
  r := push_batch(jsonb_build_array(_ev(pa, 'entry', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev3->'payload'->>'id', 'reason', 'undo the undo'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Nothing to undo%', 'a void cannot point at another void');
  perform _back();

  -- On-spot registration + duplicate mobile
  perform _as('volunteer1@homecoming.test');
  v1 := gen_random_uuid();
  r := push_batch(jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'party', 'payload', jsonb_build_object(
    'party', jsonb_build_object('id', v1, 'passCode', 'GH26-ZZZZ1', 'qrToken', 'tok-zzzz1', 'leadName', 'On Spot Guest', 'batchYear', 2010,
                                'school', 'School of Science', 'department', 'Physics', 'course', 'M.Sc', 'spouse', 'yes', 'children', 1, 'parking', 'none'),
    'contact', jsonb_build_object('mobile', '90000 00001', 'email', null)))));
  perform _ok(r->0->>'status' = 'accepted', 'on-spot party accepted');
  perform _back();
  perform _ok((select possible_duplicate_of from parties where id = v1) is not null, 'same mobile flags possible_duplicate_of');
  perform _ok((select mobile from party_contacts where party_id = v1) = '+919000000001', 'mobile normalised to +91 and stored only in party_contacts');
  perform _ok((select mobile_last4 from parties where id = v1) = '0001', 'roster keeps only the last 4 digits');

  -- Staff powers and audit
  perform _as('staff@homecoming.test');
  perform _ok(get_party_contact(pa)->>'mobile' like '+91%', 'staff can read a contact');
  perform update_party(pa, '{"children": 3}', 'Guest corrected headcount');
  perform _ok(_try('select update_party(''' || pa || ''', ''{}'', '''')') is not null, 'update_party needs a reason');
  perform _back();
  perform _ok((select count(*) from audit_log where action = 'read' and table_name = 'party_contacts') = 1, 'contact read is audited');
  perform _ok((select reason from audit_log where table_name = 'parties' and action = 'update' order by id desc limit 1) = 'Guest corrected headcount', 'party edit is audited with its reason');

  -- Admin and the last-admin guard
  perform _as('admin@homecoming.test');
  perform admin_set_user('new.volunteer@homecoming.test', 'New V', 'volunteer', true);
  perform _ok((select count(*) from jsonb_array_elements(admin_list_users())) = 6, 'admin adds a user and lists them');
  perform _ok(jsonb_array_length(audit_feed(50)) > 0, 'admin reads the audit feed');
  perform _ok(_try('select admin_set_user(''admin@homecoming.test'', ''Test Admin'', ''staff'', true)') like '%last active admin%', 'cannot demote the last admin');
  perform _ok(_try('select admin_set_user(''admin@homecoming.test'', ''Test Admin'', ''admin'', false)') like '%last active admin%', 'cannot deactivate the last admin');
  perform admin_set_user('second.admin@homecoming.test', 'Second', 'admin', true);
  perform admin_set_user('admin@homecoming.test', 'Test Admin', 'staff', true);
  perform _ok(true, 'with a second admin, the first can be demoted');
  perform _back();

  -- Function grants: signed-out visitors get nothing; signed-in users get exactly the app's functions
  perform _ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('_as', '_back', '_try', '_ok', '_ev')), 'anon can execute no function in the public schema');
  perform _ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('_as', '_back', '_try', '_ok', '_ev')) = 15, 'signed-in users can execute exactly the 15 functions the app needs');

  -- Sign-up hook: only listed emails may create an account, and only Supabase Auth may run the hook
  execute 'set local role supabase_auth_admin';
  r := hook_before_user_created('{"user": {"email": "Admin@Homecoming.test"}}');
  err := (hook_before_user_created('{"user": {"email": "stranger@example.com"}}'))->'error'->>'message';
  ev := hook_before_user_created('{"user": {}}');
  execute 'reset role';
  perform _ok(r = '{}'::jsonb, 'sign-up hook lets a listed email in, whatever its capitals');
  perform _ok(err like 'NOT_ON_LIST%', 'sign-up hook refuses an email that is not listed');
  perform _ok(ev->'error' is not null, 'sign-up hook refuses a user with no email');
  perform _ok(not has_function_privilege('authenticated', 'hook_before_user_created(jsonb)', 'execute')
          and not has_function_privilege('anon', 'hook_before_user_created(jsonb)', 'execute'), 'sign-up hook cannot be called by users or the signed-out role');

  -- Append-only
  perform _ok(_try('update scan_events set qty = 9') like '%append-only%', 'scan_events cannot be updated');
  perform _ok(_try('delete from scan_events') like '%append-only%', 'scan_events cannot be deleted');
  raise notice 'ALL CHECKS PASSED';
end $t$;

-- Guest import and pass export (run after the block above, as the same session)
do $t$
declare
  rows jsonb; bad jsonb; r jsonb; ex jsonb; n int; before_n int; t0 timestamptz; err text; old_ids uuid[]; ch0 bigint;
begin
  update staff_users set role = 'admin' where email = 'admin@homecoming.test';
  select jsonb_agg(jsonb_build_object('name', 'Bulk Guest ' || g, 'batchYear', 1990 + (g % 30), 'school', 'School of Science',
           'department', 'Physics', 'course', 'M.Sc',
           'mobile', case when g = 3 then '90000 00001' else '+91 ' || (7000000000 + case when g = 2 then 1 else g end)::text end,
           'email', 'bulk' || g || '@example.com', 'spouse', case when g % 3 = 0 then 'yes' else 'no' end, 'children', g % 3,
           'parking', 'none'))
    into rows from generate_series(1, 5000) g;
  select count(*) into before_n from parties where deleted_at is null;

  -- Only admins may import or export
  perform _as('volunteer1@homecoming.test');
  perform _ok(_try('select admin_import_guests(''x.csv'', ''[]'', false)') like '%not authorised%', 'volunteer cannot import guests');
  perform _ok(_try('select admin_export_passes()') like '%not authorised%', 'volunteer cannot export passes');
  perform _back();
  perform _as('staff@homecoming.test');
  perform _ok(_try('select admin_import_guests(''x.csv'', ''[]'', false)') like '%not authorised%', 'staff cannot import guests');
  perform _ok(_try('select admin_export_passes()') like '%not authorised%', 'staff cannot export passes');
  perform _back();
  execute 'set local role anon';
  perform _ok(_try('select admin_import_guests(''x.csv'', ''[]'', false)') like 'permission denied%', 'signed-out visitor cannot import guests');
  perform _ok(_try('select admin_export_passes()') like 'permission denied%', 'signed-out visitor cannot export passes');
  execute 'reset role';

  -- A bad row stops the whole import: nothing is written
  perform _as('admin@homecoming.test');
  bad := jsonb_build_array(rows->0, jsonb_build_object('name', 'No Phone', 'batchYear', 2001, 'school', 'School of Law', 'course', 'LLB', 'mobile', '12345'));
  err := _try('select admin_import_guests(''bad.csv'', ' || quote_literal(bad::text) || ', false)');
  perform _back();
  perform _ok(err like 'Guest 2 (No Phone): the mobile needs 10 digits', 'a bad row is refused and named by its position');
  perform _ok((select count(*) from parties where deleted_at is null) = before_n and not exists (select 1 from import_batches where filename = 'bad.csv'),
              'a refused import writes nothing');

  -- 5000 guests in one go (timing is printed; the hosted database stops a request after about 8 seconds)
  perform _as('admin@homecoming.test');
  t0 := clock_timestamp();
  r := admin_import_guests('big.csv', rows, false);
  perform _back();
  raise notice 'TIMING: importing 5000 guests took % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
  perform _ok((r->>'imported')::int = 5000 and (select count(*) from parties where deleted_at is null) = before_n + 5000, 'admin imports 5000 guests');
  perform _ok((select count(distinct pass_code) from parties) = (select count(*) from parties), 'every pass code is different');
  perform _ok((select count(*) from parties where import_batch_id = (r->>'batch')::uuid and pass_code ~ '^GH26-[2-9A-HJKMNP-TV-Z]{5}$') = 5000, 'pass codes use the GH26-XXXXX format');
  perform _ok((select count(distinct qr_token) from parties) = (select count(*) from parties) and (select min(length(qr_token)) from parties where import_batch_id = (r->>'batch')::uuid) = 22, 'every QR token is different and 22 characters');
  perform _ok((r->>'flagged')::int = 2, 'a repeated mobile is flagged, in the file and against an existing guest');
  perform _ok((select count(*) from parties where import_batch_id = (r->>'batch')::uuid and possible_duplicate_of is not null) = 2, 'flagged guests point at the guest they may repeat');
  perform _ok((select mobile from party_contacts c join parties p on p.id = c.party_id where p.lead_name = 'Bulk Guest 1') = '+917000000001', 'imported mobile is stored as +91 and ten digits, in party_contacts only');
  perform _ok((select mobile_last4 from parties where lead_name = 'Bulk Guest 1') = '0001', 'imported guest keeps only the last 4 digits in the roster');
  perform _ok((select count(*) from audit_log where table_name = 'parties' and action = 'insert' and reason = 'Guest list import: big.csv') = 5000, 'every imported guest is in the audit log with the file name');

  -- Replace: refused while scans exist, and while the event is live
  perform _as('admin@homecoming.test');
  perform _ok(_try('select admin_import_guests(''again.csv'', ' || quote_literal(jsonb_build_array(rows->0)::text) || ', true)') like 'Scans already exist%', 'replace is refused while scans exist');
  perform _back();
  update event_settings set is_live = true;
  alter table scan_events disable trigger scan_events_no_update; delete from scan_events; alter table scan_events enable trigger scan_events_no_update;
  perform _as('admin@homecoming.test');
  perform _ok(_try('select admin_import_guests(''again.csv'', ' || quote_literal(jsonb_build_array(rows->0)::text) || ', true)') like 'The event is live%', 'replace is refused once the event is live');
  r := admin_import_guests('late.csv', jsonb_build_array(jsonb_build_object('name', 'Late Guest', 'batchYear', 2000, 'school', 'School of Law', 'course', 'LLB', 'mobile', '9111111111')), false);
  perform _back();
  perform _ok((r->>'imported')::int = 1, 'adding guests is still allowed once the event is live');
  update event_settings set is_live = false;

  -- Replace: old guests are retired (soft delete), phones see the change, a retired guest's mobile is not a duplicate
  select array_agg(id) into old_ids from parties where deleted_at is null;
  select max(change_seq) into ch0 from parties;
  perform _as('admin@homecoming.test');
  r := admin_import_guests('fresh.csv', jsonb_build_array(
         jsonb_build_object('name', 'Fresh One', 'batchYear', 1999, 'school', 'School of Science', 'course', 'B.Sc', 'mobile', '9000000001', 'spouse', 'maybe', 'children', 2, 'parking', 'two_wheeler', 'dinnerOverride', 6),
         jsonb_build_object('name', 'Fresh Two', 'batchYear', 1999, 'school', 'School of Law', 'course', 'LLB', 'mobile', '9000000002')), true);
  perform _back();
  perform _ok((r->>'retired')::int = cardinality(old_ids) and (r->>'imported')::int = 2, 'replace retires every current guest and adds the new ones');
  perform _ok((select count(*) from parties where deleted_at is null) = 2, 'only the new guests are current after a replace');
  perform _ok((select min(change_seq) from parties where id = any(old_ids)) > ch0, 'retired guests get new change numbers, so phones learn about them');
  perform _ok((r->>'flagged')::int = 0, 'a retired guest''s mobile is not flagged as a duplicate');
  perform _ok((select entitled from party_state ps join parties p on p.id = ps.party_id where p.lead_name = 'Fresh One') = 4, 'a dinner override in an import file is ignored: the entitlement is the party size');
  perform _ok((select parking::text || spouse::text || children::text from parties where lead_name = 'Fresh One') = 'two_wheelermaybe2', 'imported spouse, children and parking are kept');

  -- Export: every current guest, contacts included, and the export itself is audited
  perform _as('admin@homecoming.test');
  ex := admin_export_passes();
  perform _back();
  perform _ok(jsonb_array_length(ex) = 2 and ex->0 ? 'pass_code' and ex->0 ? 'qr_token' and ex->0 ? 'mobile' and ex->0 ? 'email' and ex->0 ? 'party_size', 'export lists current guests with the columns the pass sheets use');
  perform _ok((select count(*) from audit_log where action = 'read' and table_name = 'party_contacts' and reason = 'Pass list export') = 1, 'an export is recorded in the audit log');
  raise notice 'IMPORT CHECKS PASSED';
end $t$;

-- Undo without trusting the phone's clock, and heartbeats that can't overwrite another user's row (migration 8)
do $t$
declare
  pa uuid; d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); dx uuid := gen_random_uuid();
  ev jsonb; r jsonb; vo jsonb;
begin
  select id into pa from parties where deleted_at is null order by lead_name limit 1;
  vo := '{"action":"void","reason":"Tapped by mistake"}';

  -- Same phone, undo within the window while offline: accepted even though the scan was received long ago.
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pa, 'entry', 1, null, d1, 300);
  perform push_batch(jsonb_build_array(ev));
  perform _back();
  set local session_replication_role = replica;      -- the log is append-only; the test needs an old received_at
  update scan_events set received_at = now() - interval '10 minutes' where id = (ev->'payload'->>'id')::uuid;
  set local session_replication_role = origin;
  perform _as('volunteer1@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pa, 'entry', 0, null, d1, 240, vo || jsonb_build_object('voidsEventId', ev->'payload'->>'id'))));
  perform _ok(r->0->>'status' = 'accepted', 'an offline undo from the same phone is accepted when it syncs late');

  -- An undo dated before the scan (backdated clock) is refused.
  ev := _ev(pa, 'entry', 1, null, d1, 10);
  perform push_batch(jsonb_build_array(ev));
  r := push_batch(jsonb_build_array(_ev(pa, 'entry', 0, null, d1, 120, vo || jsonb_build_object('voidsEventId', ev->'payload'->>'id'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%before the scan%', 'an undo dated before its scan is rejected');

  -- Another phone, scan only just received: accepted. The server's clock decides.
  r := push_batch(jsonb_build_array(_ev(pa, 'entry', 0, null, d2, 0, vo || jsonb_build_object('voidsEventId', ev->'payload'->>'id'))));
  perform _ok(r->0->>'status' = 'accepted', 'an undo from another phone is accepted while the scan is fresh');
  perform _back();

  -- Another phone, scan received long ago: refused, whatever the undo's own timestamp says.
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pa, 'entry', 1, null, d1, 0);
  perform push_batch(jsonb_build_array(ev));
  perform _back();
  set local session_replication_role = replica;
  update scan_events set received_at = now() - interval '10 minutes' where id = (ev->'payload'->>'id')::uuid;
  set local session_replication_role = origin;
  perform _as('volunteer1@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pa, 'entry', 0, null, d2, 0, vo || jsonb_build_object('voidsEventId', ev->'payload'->>'id'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%window%', 'an undo from another phone is rejected once the scan is old, whatever its timestamp says');
  perform _back();

  -- Heartbeats: each user writes only their own row for a device id.
  perform _as('volunteer1@homecoming.test');
  perform device_heartbeat(dx, 'DINNER-1', 0, 'one', now());
  perform _back();
  perform _as('volunteer2@homecoming.test');
  perform device_heartbeat(dx, 'DINNER-9', 5, 'two', now());
  perform _back();
  perform _ok((select counter from device_status where device_id = dx and user_id = (select id from staff_users where email = 'volunteer1@homecoming.test')) = 'DINNER-1', 'another user''s heartbeat does not overwrite the first user''s row');
  perform _ok((select count(*) from device_status where device_id = dx) = 2, 'each user gets their own row for a shared device id');
  perform _as('volunteer1@homecoming.test');
  perform device_heartbeat(dx, 'DINNER-2', 1, 'one', now());
  perform _back();
  perform _ok((select counter from device_status where device_id = dx and user_id = (select id from staff_users where email = 'volunteer1@homecoming.test')) = 'DINNER-2', 'a user''s own heartbeat still updates their row');
  raise notice 'MIGRATION 8 CHECKS PASSED';
end $t$;

-- Check-in only (migration 9)
do $t$
declare r jsonb; pa uuid; pz uuid; d1 uuid := gen_random_uuid(); ps text;
begin
  select id into pa from parties where deleted_at is null order by lead_name limit 1;
  select id into pz from parties where deleted_at is null and not exists (select 1 from scan_events e where e.party_id = parties.id) limit 1;
  select string_agg(column_name, ',' order by ordinal_position) into ps from information_schema.columns where table_name = 'party_state';
  perform _ok(ps = 'party_id,entitled,entered,entered_at,headcount,duplicate_entry,possible_duplicate', 'party_state has no dinner columns');
  perform _ok((select count(*) from counters where kind = 'dinner' and active) = 0 and (select count(*) from counters where kind = 'dinner') = 10, 'dinner counters are off but their rows stay');
  perform _as('volunteer1@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pa, 'dinner', 0, null, d1, 0, '{"action":"void","voidsEventId":"00000000-0000-0000-0000-000000000000","reason":"x"}')));
  perform _back();
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Only check-ins%', 'a dinner-type void is refused too');
  -- A dinner scan already in the log (written before this migration) does not check anyone in
  set local session_replication_role = replica;
  insert into scan_events (id, party_id, checkpoint, action, qty, method, actor_id, counter, device_id, client_at)
  values (gen_random_uuid(), pz, 'dinner', 'pass', 3, 'qr', (select id from staff_users where email = 'volunteer1@homecoming.test'), 'DINNER-1', d1, now());
  set local session_replication_role = origin;
  perform _ok((select count(*) from scan_events where checkpoint = 'dinner') >= 1, 'an old dinner scan is kept in the log');
  perform _ok(pz is not null and not (select entered from party_state where party_id = pz), 'an old dinner scan does not count as a check-in');
  raise notice 'MIGRATION 9 CHECKS PASSED';
end $t$;
