-- 008: the linked-number approval gate
--
-- A partner can ADD a number to one of their clients (`referral_phone`), but an
-- added number must be approved by a Material Depot admin before it is used to
-- match anything. Without this, a firm could add a stranger's number and have
-- the sync attribute that stranger's orders to them — this single column decides
-- whose orders count, so, like the order gate in 004, it is enforced here in the
-- database rather than trusted to an app-layer check.
--
-- Three parts: the column, a trigger that forces the value on insert (a partner
-- has no UPDATE policy and now cannot self-approve on INSERT either), and the
-- one admin-checked function that can move it afterwards.

-- --------------------------------------------------------------- the column
-- The backfill runs ONLY on first application. This file is meant to be re-run,
-- and a second run must not re-approve a number an admin has since rejected.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_phone' and column_name = 'approval_status'
  ) then
    alter table referral_phone
      add column approval_status text not null default 'pending'
        check (approval_status in ('pending','approved','rejected')),
      add column approved_by uuid references auth.users(id) on delete set null,
      add column approved_at timestamptz;

    -- Everything that existed before the gate was already active and matching.
    -- Grandfather it in as approved so no working number silently stops counting
    -- the moment this lands.
    update referral_phone set approval_status = 'approved';
  end if;
end $$;

-- ------------------------------------------------------------- insert gate
-- Forces approval_status regardless of what the caller sent. The primary
-- 'client' number (off the referral form) and anything an admin adds are trusted
-- at once; everything a partner adds lands 'pending'. This is what stops a
-- partner from POSTing approval_status = 'approved' straight past the app.
create or replace function referral_phone_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app_is_admin() or new.label = 'client' then
    new.approval_status := 'approved';
    new.approved_by := case when app_is_admin() then auth.uid() else null end;
    new.approved_at := now();
  else
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists referral_phone_gate_ins on referral_phone;
create trigger referral_phone_gate_ins
  before insert on referral_phone
  for each row execute function referral_phone_gate();

-- ---------------------------------------------------------- the admin gate
-- `referral_phone` has NO update policy for anybody, so this function is the only
-- way approval_status can change after insert, and it re-checks the caller inside
-- Postgres — the same shape as review_referral_order(). A mistake in the console
-- role check cannot approve a number.
create or replace function review_referral_phone(p_id uuid, p_status text)
returns referral_phone
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
     set approval_status = p_status,
         approved_by     = case when p_status = 'pending' then null else auth.uid() end,
         approved_at     = case when p_status = 'pending' then null else now() end
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no such number';
  end if;
  return v_row;
end $$;
revoke all on function review_referral_phone(uuid,text) from public;
grant execute on function review_referral_phone(uuid,text) to authenticated;
