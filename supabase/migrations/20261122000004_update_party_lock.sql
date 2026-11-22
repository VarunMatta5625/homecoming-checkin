-- update_party bumps change_seq, so it takes the same lock as push_batch.
-- Without it, an edit could commit out of change_seq order and a phone's cursor pull could skip that row for good.
create or replace function update_party(p_id uuid, p_patch jsonb, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare me staff_users := _require_role('staff');
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  perform pg_advisory_xact_lock(1);
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
