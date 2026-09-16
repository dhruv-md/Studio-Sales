-- B2B Client Dashboard — the client-facing revamp, phase by phase.
-- Target project: vmwvxwqzqxhwesjokztf (same project as 001-006).
--
-- Run AFTER 006_credentials.sql. Paste the whole file into Supabase → SQL
-- Editor. Nothing in the repo runs it. Re-running is safe: every statement is
-- if-not-exists, or drops before it creates.
--
-- Sections are appended in the order the revamp was built, so this file can
-- be split and applied incrementally if you would rather not paste it whole:
--
--   A. KAM photo on the Overview contact card
--   B. Multiple phone numbers per referred client
--   C. Scheduling a store visit, and the BM assigned to it
--
-- ============================================================================

-- ===================================== A. KAM photo (Overview contact card)

-- Link, not upload — same pattern as partner.logo_url and portfolio cover
-- images. An admin pastes a URL on the staff member's row.
alter table staff_user add column if not exists photo_url text;

-- my_kam() already exists (004_roles_rls.sql). Replaced, not altered, because
-- it is the ONLY way a partner reaches anything about a staff row, and adding
-- a column to what it returns is the whole of this change. Postgres will not
-- let `create or replace` change an OUT-parameter row type, so the old
-- signature is dropped first.
drop function if exists my_kam();
create or replace function my_kam()
returns table (name text, phone text, email text, market text, photo_url text)
language sql security definer set search_path = public stable as $$
  select s.name, s.phone, s.email, s.market, s.photo_url
  from partner p
  join staff_user s on s.user_id = p.kam_user_id and s.active
  where p.id in (select app_partner_ids())
  limit 1
$$;
revoke all on function my_kam() from public;
grant execute on function my_kam() to authenticated;

-- ============================ B. Multiple phone numbers per referred client

-- A client can place an order through their own number, their partner's
-- number, or a number they never mentioned at referral time. Cart and order
-- matching (lib/domain/referrals.ts, /api/sync/referrals) reads every phone
-- linked to a referral, not just `referral.md_phone` — so this table is
-- additive to that column, never a replacement for it.

-- "Something else, describe" on the referral form's project type.
alter table referral add column if not exists project_type_other text;

-- Delivery bookkeeping for the CRM outbox poll (phase 7) — a new referral is
-- partner-owned data the CRM needs to read, so this marks what it has already
-- fetched. Never surfaced to a partner, and added to the same guard trigger
-- that already freezes Material Depot's other columns on `referral` — without
-- that it would be the one column on this table a firm's own update policy
-- could still tamper with.
alter table referral add column if not exists pushed_at timestamptz;

create or replace function referral_guard_md_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app_is_admin() then return new; end if;
  if new.status                 is distinct from old.status
     or new.rejection_reason       is distinct from old.rejection_reason
     or new.consent_given          is distinct from old.consent_given
     or new.consent_at             is distinct from old.consent_at
     or new.reviewed_by            is distinct from old.reviewed_by
     or new.reviewed_at            is distinct from old.reviewed_at
     or new.review_note            is distinct from old.review_note
     or new.attribution_expires_on is distinct from old.attribution_expires_on
     or new.md_phone               is distinct from old.md_phone
     or new.pushed_at              is distinct from old.pushed_at
  then
    raise exception 'that field is set by Material Depot, not by the firm'
      using errcode = '42501';
  end if;
  return new;
end $$;

create table if not exists referral_phone (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referral(id) on delete cascade,
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  label       text not null default 'additional'
                check (label in ('partner','client','additional')),
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (referral_id, phone)
);

-- Every referral already has one number on it. Backfilled once, as the
-- 'client' number, so a query that unions `referral_phone` with `md_phone`
-- and one that only reads `referral_phone` agree on every existing referral.
insert into referral_phone (referral_id, phone, label)
select r.id, r.md_phone, 'client'
from referral r
on conflict (referral_id, phone) do nothing;

alter table referral_phone enable row level security;

drop policy if exists referral_phone_read on referral_phone;
create policy referral_phone_read on referral_phone for select to authenticated
  using (
    exists (select 1 from referral r
             where r.id = referral_id
               and (r.partner_id in (select app_partner_ids()) or app_staff_sees_partner(r.partner_id)))
  );

-- A firm can add a number to its own referral and remove one it added by
-- mistake. It cannot touch the original 'client' row that came off the
-- referral form — that one only moves if the referral itself is corrected.
drop policy if exists referral_phone_insert on referral_phone;
create policy referral_phone_insert on referral_phone for insert to authenticated
  with check (
    exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  );

drop policy if exists referral_phone_delete on referral_phone;
create policy referral_phone_delete on referral_phone for delete to authenticated
  using (
    label = 'additional'
    and exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  );

-- ============================ C. Scheduling a store visit, and its outcome

-- The first visit is created alongside a new referral; every later one is
-- "schedule another visit" against the same client, which re-asks nothing
-- about who the client is. `status` and the `assigned_bm_*` columns are
-- Material Depot's side of this record — a KAM coordinates with the store and
-- names the BM — so a guard trigger freezes them exactly the way
-- `referral_guard_md_fields` freezes a referral's decision fields.
create table if not exists visit_request (
  id               uuid primary key default gen_random_uuid(),
  referral_id      uuid not null references referral(id) on delete cascade,
  ec_name          text,
  scheduled_on     date not null,
  scheduled_time   text not null,
  categories       text[] not null default '{}',
  requirements     text,
  notes            text,
  status           text not null default 'requested'
                     check (status in ('requested','bm_assigned','completed','cancelled')),
  assigned_bm_name  text,
  assigned_bm_phone text,
  assigned_bm_email text,
  assigned_bm_photo_url text,
  -- Set once this row has been read by the CRM outbox poll (phase 7). Never
  -- read by a partner — it is delivery bookkeeping, not part of the record.
  pushed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists visit_request_referral_idx on visit_request(referral_id);

create or replace function visit_request_guard_md_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Unlike `referral_guard_md_fields` (admin only), any Material Depot staff
  -- role may set these — coordinating the store team and naming a BM is a
  -- KAM's job, not only an admin's.
  if auth.uid() is null or app_is_staff() then return new; end if;
  if new.status                 is distinct from old.status
     or new.assigned_bm_name       is distinct from old.assigned_bm_name
     or new.assigned_bm_phone      is distinct from old.assigned_bm_phone
     or new.assigned_bm_email      is distinct from old.assigned_bm_email
     or new.assigned_bm_photo_url  is distinct from old.assigned_bm_photo_url
     or new.pushed_at              is distinct from old.pushed_at
  then
    raise exception 'that field is set by Material Depot, not by the firm'
      using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists visit_request_guard on visit_request;
create trigger visit_request_guard before update on visit_request
  for each row execute function visit_request_guard_md_fields();

alter table visit_request enable row level security;

drop policy if exists visit_request_read on visit_request;
create policy visit_request_read on visit_request for select to authenticated
  using (
    exists (select 1 from referral r
             where r.id = referral_id
               and (r.partner_id in (select app_partner_ids()) or app_staff_sees_partner(r.partner_id)))
  );

drop policy if exists visit_request_insert on visit_request;
create policy visit_request_insert on visit_request for insert to authenticated
  with check (
    exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  );

-- A firm can edit its own request (fix a typo in requirements, change the
-- time) as long as Material Depot has not already acted on it — the guard
-- trigger stops it touching status/assignment regardless, this just stops a
-- firm rewriting the ask out from under a BM who has already been assigned.
drop policy if exists visit_request_update on visit_request;
create policy visit_request_update on visit_request for update to authenticated
  using (
    status = 'requested'
    and exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  )
  with check (
    exists (select 1 from referral r where r.id = referral_id and r.partner_id in (select app_partner_ids()))
  );

-- Staff (the KAM's own console, and the sync endpoint below) move status and
-- assignment. Same relationship rule as everything else staff can see.
drop policy if exists visit_request_staff_update on visit_request;
create policy visit_request_staff_update on visit_request for update to authenticated
  using (
    exists (select 1 from referral r where r.id = referral_id and app_staff_sees_partner(r.partner_id))
  )
  with check (
    exists (select 1 from referral r where r.id = referral_id and app_staff_sees_partner(r.partner_id))
  );

-- ==================================== D. Portfolio — the new field list

-- The submission form drops `completed_on`, `area_sqft` and `credits` in
-- favour of the fields the client-facing revamp actually asks a partner for.
-- The old columns are left in place (unused by this form, harmless) rather
-- than dropped — a partner's already-submitted rows keep whatever they had.
alter table portfolio_item add column if not exists inspiration      text;
alter table portfolio_item add column if not exists drive_link       text;
alter table portfolio_item add column if not exists rough_cost       numeric(14,2);
alter table portfolio_item add column if not exists aspects_covered  text[] not null default '{}';

-- ======================================== E. Settings → Team, as a request

-- A firm asks for a teammate's login; an admin approves or rejects. Provi-
-- sioning reuses the exact primitives `provisionFromApplication()` already
-- uses (generatePassword, auth.admin.createUser, rememberCredential) — this
-- is the same mechanism, scoped to an EXISTING partner_id instead of a new
-- firm. Only an admin (service role) ever moves `status` or sets
-- `provisioned_user_id`; RLS gives a firm no update policy on this table at
-- all, so there is nothing here for a `partner_guard`-style trigger to guard.
create table if not exists partner_team_invite (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null references partner(id) on delete cascade,
  name                text not null,
  email               text not null,
  role                text not null check (role in ('design_team','procurement')),
  status              text not null default 'requested'
                        check (status in ('requested','approved','rejected')),
  requested_by        uuid references auth.users(id) on delete set null,
  requested_at        timestamptz not null default now(),
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text,
  provisioned_user_id uuid references auth.users(id) on delete set null
);

create index if not exists partner_team_invite_partner_idx on partner_team_invite(partner_id);

alter table partner_team_invite enable row level security;

drop policy if exists partner_team_invite_read on partner_team_invite;
create policy partner_team_invite_read on partner_team_invite for select to authenticated
  using (partner_id in (select app_partner_ids()) or app_staff_sees_partner(partner_id));

drop policy if exists partner_team_invite_insert on partner_team_invite;
create policy partner_team_invite_insert on partner_team_invite for insert to authenticated
  with check (partner_id in (select app_partner_ids()) and status = 'requested');

-- No update policy for anybody, deliberately — including staff. Approving or
-- rejecting an invite creates a real login (or tells someone their request
-- was declined), so it goes through the service role from console-actions.ts
-- only, the same way `provisionFromApplication()` does, never through a row
-- a KAM's own session could patch directly.

-- What an invited teammate is for, alongside `partner_user.role`'s access
-- level (`associate`) — display only, so the console's own team list can say
-- "Design team" or "Procurement" rather than just "Associate".
alter table partner_user add column if not exists title text;
