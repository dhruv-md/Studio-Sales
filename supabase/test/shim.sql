-- A faithful-enough stand-in for what Supabase gives you, so the migrations
-- and the seed are exercised the way they will be in the real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  -- THIS IS THE POINT OF THE SHIM: in Supabase, confirmed_at is a GENERATED
  -- column. Anything that tries to write it fails with 428C9.
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  created_at timestamptz default now()
);

-- Supabase's auth.uid() reads the JWT claim off the request. Setting
-- request.jwt.claim.sub is how a test pretends to be a signed-in user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- A faithful-enough stand-in for Supabase Storage's bucket registry — just
-- enough that 007_studio_v2.sql's `insert into storage.buckets` runs. Nothing
-- in this suite tests file upload itself (that goes through the service role
-- from a route handler, not through RLS), so `storage.objects` is not shimmed.
create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
