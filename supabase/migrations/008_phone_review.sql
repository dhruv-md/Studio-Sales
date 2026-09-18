-- ============================================ 008. Approving a linked number
--
-- A firm can already attach extra numbers to a referred client
-- (007_studio_v2.sql's `referral_phone`) and every one of them counts for
-- cart/order matching in `/api/sync/referrals` the moment it is added. On
-- Material Depot's own instruction: a number should NOT start counting the
-- instant a firm types it in — an admin approves it first, the same way an
-- order does not count towards rewards until `review_referral_order()` says
-- so (004_roles_rls.sql).
--
-- The 'client' label is the exception. It is the number the client was
-- referred on in the first place — already trusted by the time it reaches
-- this table — so it is approved automatically and never sits in a queue.

alter table referral_phone add column if not exists status text not null default 'pending'
  check (status in ('pending','approved','rejected'));
alter table referral_phone add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table referral_phone add column if not exists reviewed_at timestamptz;
alter table referral_phone add column if not exists review_note text;

-- Grandfather every row that already exists — including the ones this same
-- statement just defaulted to 'pending' by adding a NOT NULL column with a
-- default. These are numbers already relied on for matching; the approval
-- gate is for what a firm adds from here on, not a retroactive freeze on
-- everybody's existing clients.
update referral_phone set status = 'approved' where status = 'pending';

-- A 'client' row is never something a firm submitted for review — force it
-- approved regardless of what the label was inserted alongside, so a future
-- caller cannot leave one sitting pending by omission.
create or replace function referral_phone_guard_status() returns trigger
language plpgsql as $$
begin
  if new.label = 'client' then
    new.status := 'approved';
  end if;
  return new;
end $$;

drop trigger if exists referral_phone_guard on referral_phone;
create trigger referral_phone_guard before insert on referral_phone
  for each row execute function referral_phone_guard_status();

-- Belt and braces alongside the trigger: a firm's insert is refused outright
-- if it arrives with anything but 'pending' already set, so a caller that
-- goes around the app (straight to PostgREST with its own session) cannot
-- self-approve a number by including `"status":"approved"` in the payload.
drop policy if exists referral_phone_insert on referral_phone;
create policy referral_phone_insert on referral_phone for insert to authenticated
  with check (
    status = 'pending'
    and exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  );

-- No UPDATE policy for anybody, on purpose — same reasoning as
-- `referral_order`. The only thing that moves `status` is the function below.
create or replace function review_referral_phone(
  p_phone_id uuid,
  p_status   text,
  p_note     text default null
) returns referral_phone
language plpgsql security definer set search_path = public as $$
declare v_row referral_phone;
begin
  if not app_is_admin() then
    raise exception 'only a Material Depot admin can approve a linked number'
      using errcode = '42501';
  end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'status must be pending, approved or rejected';
  end if;

  update referral_phone
     set status      = p_status,
         review_note = p_note,
         reviewed_by = case when p_status = 'pending' then null else auth.uid() end,
         reviewed_at = case when p_status = 'pending' then null else now() end
   where id = p_phone_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no such number';
  end if;
  return v_row;
end $$;
revoke all on function review_referral_phone(uuid,text,text) from public;
grant execute on function review_referral_phone(uuid,text,text) to authenticated;
