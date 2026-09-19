-- 009_soft_delete.sql
--
-- Soft delete for projects and their spaces. Deleting one sets `is_deleted`
-- rather than removing the row, so a deletion is recoverable and never cascades
-- away a partner's saved inspiration by surprise. The app filters these out on
-- every read (lib/data/queries.ts); the columns are additive and the existing
-- ownership policies (007_studio_v2.sql) already scope who can flip them.
--
-- Idempotent — safe to re-run.

alter table studio_project
  add column if not exists is_deleted boolean not null default false;

alter table studio_project_space
  add column if not exists is_deleted boolean not null default false;

-- Reads filter on these, so index the common "not deleted" case.
create index if not exists studio_project_live_idx
  on studio_project (partner_id) where is_deleted = false;

create index if not exists studio_project_space_live_idx
  on studio_project_space (project_id) where is_deleted = false;
