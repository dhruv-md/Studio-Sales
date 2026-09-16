-- B2B Client Dashboard — the issued password, kept until its owner changes it.
-- Target project: vmwvxwqzqxhwesjokztf  (NOT the CRM project olkkioacgccgsjjlmbhc,
-- NOT the Site Audit project jqrdfnjfxqxrazfkaofm)
--
-- Run AFTER 005_studio.sql. Paste the whole file into Supabase → SQL Editor.
-- Nothing in the repo runs it. Re-running is safe.
--
-- ============================================================================
-- WHY THIS EXISTS, AND WHAT IT COSTS
--
-- Until now the one-time password was shown once and thrown away. That is the
-- safer design and it was the wrong one for how this team actually works: an
-- admin issues a login, the WhatsApp message does not get sent, and a week later
-- the only repair is to issue a *new* password — which invalidates the one the
-- firm may already have been given, off a screenshot, by somebody else.
--
-- So the issued password is now retained until its owner changes it. That is a
-- real reduction in security and it is bounded here as tightly as it can be:
--
--   1. It is stored ENCRYPTED (AES-256-GCM, sealed and opened in the app —
--      lib/auth/credentials.ts). The key never enters this database, so a dump
--      of this table, or a browse through the Supabase dashboard, yields
--      nothing readable.
--   2. This table has RLS on and NO POLICIES AT ALL. Neither `anon` nor
--      `authenticated` can read one row of it, ever. Only the service role,
--      from a server action that has already checked `requireStaff(['admin'])`.
--   3. It is erased the moment the password changes — by the trigger below on
--      any path (our settings page, a Supabase reset email, the dashboard), and
--      again by a fingerprint check on every read in case the trigger could not
--      be created.
--   4. Every reveal is counted and stamped, so "who has seen this" is a
--      question with an answer.
--
-- What remains true, and must stay in the docs: an admin of this console can
-- read the password of anyone provisioned since this migration, until they
-- change it. `docs/auth.md` says so in those words.
-- ============================================================================

create table if not exists issued_credential (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('staff','partner')),
  email          text not null,
  -- The sealed password: `v1.<iv>.<tag>.<ciphertext>`, base64url. NULL once the
  -- owner has changed it — the row stays, so the console can say "they changed
  -- it on the 3rd" rather than the far less useful "nothing on file".
  sealed         text,
  -- md5 of auth.users.encrypted_password as it stood when we sealed it. The
  -- only thing this is ever compared against is itself; it never leaves the
  -- database. NULL alongside `sealed`.
  pw_fingerprint text,
  issued_at      timestamptz not null default now(),
  issued_by      uuid references auth.users(id) on delete set null,
  changed_at     timestamptz,
  revealed_at    timestamptz,
  revealed_by    uuid references auth.users(id) on delete set null,
  reveal_count   integer not null default 0
);

alter table issued_credential enable row level security;

-- Deliberately no policies. RLS on with no policy means every signed-in user
-- reads zero rows and writes none; the service role bypasses RLS and is the
-- only way in. `referral_order`'s missing UPDATE policy works the same way, and
-- supabase/test/rlstest.js group 21 checks this one by name.
--
-- Belt and braces: PostgREST would still need table privileges, so take them
-- away from the two roles that ship to a browser.
revoke all on issued_credential from anon, authenticated;
-- And explicitly to the one role that is meant to have it, rather than relying
-- on the project's default privileges having been left alone.
grant select, insert, update, delete on issued_credential to service_role;

-- ===================================================== the fingerprint

-- `auth.users.encrypted_password` is a bcrypt hash and nothing here hands it
-- out; this returns an md5 OF that hash, and only to the service role, purely
-- so a later read can tell "still the password we issued" from "they have
-- changed it".
create or replace function app_pw_fingerprint(uid uuid)
returns text language sql security definer set search_path = auth, public stable as $$
  select md5(coalesce(encrypted_password, '')) from auth.users where id = uid
$$;

revoke all on function app_pw_fingerprint(uuid) from public, anon, authenticated;
grant execute on function app_pw_fingerprint(uuid) to service_role;

-- ===================================================== forget it

-- Erase the secret, keep the fact. Used by the trigger and by the read below.
create or replace function app_forget_credential(uid uuid)
returns void language sql security definer set search_path = public as $$
  update issued_credential
     set sealed = null, pw_fingerprint = null, changed_at = coalesce(changed_at, now())
   where user_id = uid and sealed is not null
$$;

revoke all on function app_forget_credential(uuid) from public, anon, authenticated;
grant execute on function app_forget_credential(uuid) to service_role;

-- The moment the password changes, by ANY route — this app's settings page, a
-- Supabase password-reset email, an admin editing the user in the Supabase
-- dashboard — the stored copy stops being the truth. This is what makes
-- "retained until the user changes it" a fact about the system rather than a
-- promise about our own code paths.
--
-- The exception block is not defensive habit. A trigger on auth.users that
-- raises would make password changes and account recovery fail for the whole
-- project, which is a far worse outcome than a stale row that the read-time
-- check below catches anyway.
create or replace function app_forget_credential_on_pw_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform app_forget_credential(new.id);
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists forget_issued_credential on auth.users;
create trigger forget_issued_credential
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function app_forget_credential_on_pw_change();

-- ===================================================== read it

-- One call, because the check and the read must not be able to disagree: it
-- re-checks the fingerprint, erases the secret if the password has moved on,
-- and only then returns what is left.
--
-- `state` is three-valued on purpose (house rule 5): `current` we have it,
-- `changed` they have set their own, `none` we never kept one — a login
-- provisioned before this migration is `none`, and saying that is not the same
-- as saying they have changed it.
create or replace function app_read_credential(uid uuid)
returns table (state text, sealed text, email text, kind text,
               issued_at timestamptz, changed_at timestamptz,
               revealed_at timestamptz, reveal_count integer)
language plpgsql security definer set search_path = public as $$
declare r issued_credential;
begin
  select * into r from issued_credential c where c.user_id = uid;
  if not found then
    return query select 'none'::text, null::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::timestamptz, null::integer;
    return;
  end if;

  if r.sealed is not null and r.pw_fingerprint is distinct from app_pw_fingerprint(uid) then
    perform app_forget_credential(uid);
    select * into r from issued_credential c where c.user_id = uid;
  end if;

  return query select
    case when r.sealed is not null then 'current'
         when r.changed_at is not null then 'changed'
         else 'none' end,
    r.sealed, r.email, r.kind, r.issued_at, r.changed_at, r.revealed_at, r.reveal_count;
end $$;

revoke all on function app_read_credential(uuid) from public, anon, authenticated;
grant execute on function app_read_credential(uuid) to service_role;

-- ===================================================== count a reveal

-- An audit trail nobody reads is decoration, but one that is never written
-- cannot be read later either. Who last looked, and how many times.
create or replace function app_note_credential_reveal(uid uuid, by_user uuid)
returns void language sql security definer set search_path = public as $$
  update issued_credential
     set revealed_at = now(), revealed_by = by_user, reveal_count = reveal_count + 1
   where user_id = uid
$$;

revoke all on function app_note_credential_reveal(uuid, uuid) from public, anon, authenticated;
grant execute on function app_note_credential_reveal(uuid, uuid) to service_role;
