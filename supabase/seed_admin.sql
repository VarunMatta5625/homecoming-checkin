-- Your first admin. Edit the email, then run this once in the Supabase SQL editor.
-- This must match the Google account you sign in with.
insert into staff_users (email, display_name, role)
values ('YOUR_EMAIL@example.com', 'Owner', 'admin')
on conflict (email) do nothing;
