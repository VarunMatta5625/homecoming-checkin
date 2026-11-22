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
  it := jsonb_build_array(_ev(pa, 'entry', 2, null, d1), _ev(pa, 'dinner', 1, null, d1));
  r := push_batch(it);
  perform _ok(r->0->>'status' = 'accepted' and r->1->>'status' = 'accepted', 'push_batch accepts new items');
  r := push_batch(it);
  perform _ok(r->0->>'status' = 'duplicate' and r->1->>'status' = 'duplicate', 'replaying the same batch returns duplicate');
  perform _back();
  perform _ok((select count(*) from scan_events where party_id = pa) = 2, 'replay created no duplicate events');

  -- Two devices serve the same party; servings add; over entitlement flags review
  select entitled into ent from party_state where party_id = pb;
  perform _as('volunteer1@homecoming.test'); perform push_batch(jsonb_build_array(_ev(pb, 'entry', 1, null, d1), _ev(pb, 'dinner', ent, null, d1))); perform _back();
  perform _as('volunteer2@homecoming.test'); perform push_batch(jsonb_build_array(_ev(pb, 'dinner', 1, null, d2))); perform _back();
  perform _ok((select served from party_state where party_id = pb) = ent + 1, 'servings from two devices add up');
  perform _ok((select over_served from party_state where party_id = pb), 'over-serving is flagged for review');

  -- Dinner without entry
  perform _as('volunteer1@homecoming.test'); perform push_batch(jsonb_build_array(_ev(pc, 'dinner', 1, null, d1))); perform _back();
  perform _ok((select served_without_entry from party_state where party_id = pc), 'served without entry is flagged');

  -- Undo rules
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pc, 'dinner', 1, null, d1);
  perform push_batch(jsonb_build_array(ev));
  evid := ev->'payload'->>'id';
  perform _back();
  perform _as('volunteer2@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d2, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'Wrong guest'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%own scans%', 'volunteer cannot undo someone else''s scan');
  perform _back();
  perform _as('volunteer1@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'Tapped by mistake'))));
  perform _ok(r->0->>'status' = 'accepted', 'volunteer can undo their own scan in time');
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', evid, 'reason', 'again'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Already undone%', 'cannot undo the same scan twice');
  ev := _ev(pc, 'dinner', 1, null, d1, 300);
  perform push_batch(jsonb_build_array(ev));
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'late'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%window%', 'volunteer cannot undo after 120 seconds');
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'x', 'method', 'staff'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%Staff only%', 'volunteer cannot send a staff-method event');
  perform _back();
  perform _as('staff@homecoming.test');
  r := push_batch(jsonb_build_array(_ev(pc, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'Guest left', 'method', 'staff'))));
  perform _ok(r->0->>'status' = 'accepted', 'staff can undo any scan, any time');
  perform _ok(_try('select mobile from party_contacts') like 'permission denied%', 'staff cannot read party_contacts directly (only through the audited function)');
  perform _ok(_try('select notes from parties') like 'permission denied%', 'staff cannot read parties.notes directly');
  perform _back();

  -- A void must target a plain scan of the same guest
  perform _as('volunteer1@homecoming.test');
  ev := _ev(pa, 'dinner', 1, null, d1);
  perform push_batch(jsonb_build_array(ev));
  r := push_batch(jsonb_build_array(_ev(pb, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'wrong guest'))));
  perform _ok(r->0->>'status' = 'rejected' and r->0->>'reason' like '%another guest%', 'a void cannot point at another guest''s scan');
  ev3 := _ev(pa, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev->'payload'->>'id', 'reason', 'oops'));
  perform push_batch(jsonb_build_array(ev3));
  r := push_batch(jsonb_build_array(_ev(pa, 'dinner', 0, null, d1, 0, jsonb_build_object('action','void','voidsEventId', ev3->'payload'->>'id', 'reason', 'undo the undo'))));
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
      and p.proname not in ('_as', '_back', '_try', '_ok', '_ev')) = 13, 'signed-in users can execute exactly the 13 functions the app needs');

  -- Append-only
  perform _ok(_try('update scan_events set qty = 9') like '%append-only%', 'scan_events cannot be updated');
  perform _ok(_try('delete from scan_events') like '%append-only%', 'scan_events cannot be deleted');
  raise notice 'ALL CHECKS PASSED';
end $t$;
