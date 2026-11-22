-- FAKE data for testing only. Never load real attendee data from here.
-- Creates test accounts on the allowlist (you still create matching Auth users, see supabase/README.md)
-- and 120 fake parties with obviously fake mobile numbers.

insert into staff_users (email, display_name, role, active) values
  ('admin@homecoming.test',      'Test Admin',      'admin',     true),
  ('staff@homecoming.test',      'Test Staff',      'staff',     true),
  ('volunteer1@homecoming.test', 'Test Volunteer 1','volunteer', true),
  ('volunteer2@homecoming.test', 'Test Volunteer 2','volunteer', true),
  ('inactive@homecoming.test',   'Test Inactive',   'volunteer', false)
on conflict (email) do nothing;
-- (unlisted@homecoming.test is deliberately NOT on the list: create an Auth user for it to test "Not authorised".)

create function _fake_code() returns text language sql volatile as $$
  select 'GH26-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 30)::int, 1), '')
  from generate_series(1, 5) $$;

do $$
declare
  firsts text[] := array['Priya','Arjun','Kavya','Rahul','Meera','Sameer','Anita','Vikram','Divya','Karthik','Sneha','Rohan','Lakshmi','Aditya','Farah','Nikhil'];
  lasts  text[] := array['Raghavan','Venkatesh','Sreenivas','Iyengar','Kolluri','Rao','Sharma','Reddy','Naidu','Menon','Shaik','Joshi','Das','Gupta','Nair','Babu'];
  schools text[] := array['School of Technology','School of Science','School of Business','School of Pharmacy','School of Law','GITAM Dental College'];
  pid uuid; sp ynm; ch int; yr int; i int;
begin
  for i in 1..120 loop
    pid := gen_random_uuid();
    sp := (array['no','yes','maybe'])[1 + (i % 3)]::ynm;
    ch := i % 3;
    yr := 1984 + (i * 7) % 43;
    insert into parties (id, pass_code, qr_token, lead_name, batch_year, school, department, course, mobile_last4, spouse, children, parking)
    values (pid, _fake_code(), translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_'),
            firsts[1 + i % 16] || ' ' || lasts[1 + (i * 5) % 16], yr, schools[1 + i % 6], 'Computer Science', 'B.Tech',
            lpad((i * 37 % 10000)::text, 4, '0'), sp, ch, (array['none','two_wheeler','four_wheeler'])[1 + i % 3]::parking_type);
    insert into party_contacts (party_id, mobile, email)
    values (pid, '+91900000' || lpad(i::text, 4, '0'), 'guest' || i || '@example.invalid');
  end loop;
end $$;

drop function _fake_code();
