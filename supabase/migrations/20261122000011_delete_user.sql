-- Delete a person from the staff list for good, but only when nothing on record points at them. Run after
-- 20261122000010. It adds one function and replaces admin_list_users (same output plus one key), so it is safe to apply
-- while the earlier app is deployed: that app ignores the extra key and has no delete button.
--
-- Switching someone off (admin_set_user with active = false) stays the normal way to remove access. A person who ever
-- scanned a guest, registered one, resolved a review, added another user or edited anything can't be deleted: those
-- records name them, and the log must keep saying who did what. Their own sign-in entries in the audit log do not
-- count (every account that ever signed in has one); those lose the pointer to the account, the entries stay.
--
-- Also: a request from an account that is switched off or no longer on the list now fails with 'Your account is switched
-- off or removed' instead of 'not authorised' (same error code). The check-in-only app uses that wording to tell this
-- apart from a role that is too low or a sign-in that ran out, and signs the phone out. The earlier app only looks at
-- the code, so it behaves as before. Until this migration is applied the new app falls back to the old behaviour (a
-- "please sign in again" banner).
--
-- The sign-in record in Supabase Authentication, Users is not touched. Without a staff_users row that account gets
-- "not on the list", and the sign-up hook still refuses new accounts for unlisted emails.

create or replace function _require_staff() returns staff_users language plpgsql stable security definer set search_path = public as $$
declare me staff_users;
begin
  select * into me from staff_users where auth_user_id = auth.uid() and active;
  if not found then raise exception 'Your account is switched off or removed' using errcode = '42501'; end if;
  return me;
end $$;

-- Private helper: does any record name this person?
create function _user_has_history(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from scan_events where actor_id = uid)
      or exists (select 1 from parties where created_by = uid or updated_by = uid)
      or exists (select 1 from review_resolutions where resolved_by = uid)
      or exists (select 1 from staff_users where created_by = uid)
      or exists (select 1 from audit_log where actor_id = uid and not (table_name = 'staff_users' and row_id = uid::text))
$$;

create or replace function admin_list_users() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me staff_users := _require_role('admin');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', coalesce(display_name, ''), 'role', role, 'active', active,
                                                       'canDelete', (id <> me.id and not _user_has_history(id)))
                                    order by role desc, email) from staff_users), '[]'::jsonb);
end $$;

create function admin_delete_user(p_email text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('admin'); tgt staff_users;
begin
  select * into tgt from staff_users where email = lower(btrim(p_email));
  if not found then raise exception 'No such person'; end if;
  if tgt.id = me.id then raise exception 'You can''t delete yourself'; end if;
  if tgt.active then raise exception 'Switch them off first'; end if;
  if _user_has_history(tgt.id) then raise exception 'They have scans or edits on record, so they can only be switched off'; end if;
  perform set_config('app.reason', 'User deleted', true);
  update audit_log set actor_id = null where actor_id = tgt.id;
  delete from device_status where user_id = tgt.id;
  delete from staff_users where id = tgt.id;     -- the audit trigger records the deletion, with who did it
  return jsonb_build_object('email', tgt.email);
end $$;

revoke execute on function _user_has_history(uuid) from public, anon, authenticated;
revoke execute on function admin_delete_user(text) from public, anon;
grant execute on function admin_delete_user(text) to authenticated;
