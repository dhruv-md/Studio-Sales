# The KAM bridge — reflecting a new referral and visit into the CRM

**Covers:** `app/api/sync/outbox · app/api/sync/visit-assignment · referral.pushed_at ·
visit_request.pushed_at`

## What this solves

When a partner refers a client (or schedules a further visit), the KAM
responsible for that firm needs to see it on `crm.materialdepot.com/?tab=b2bSales`
so they can coordinate with the store team and get a BM assigned. That data is
created here, in this app's own database, on `referral` and `visit_request` —
the CRM has never seen either table.

This mirrors the shape of the **existing** bridge the other way —
`/api/sync/referrals` (`docs/referrals.md`), which the CRM pushes orders and
events into. That established the rule for this whole relationship:
**this app is what a partner owns, and Material Depot's systems read it, not
the other way round.** So the new referral/visit half is also this app
exposing a read, not this app calling into the CRM.

## The two endpoints, both built and both live in THIS repo

- **`GET /api/sync/outbox`** — the CRM polls this. Returns every `referral`
  and `visit_request` row not yet delivered (`pushed_at is null`), marks them
  delivered in the same request, and reports them by their stable UUID so a
  re-delivered row (a retry after a dropped connection) is a duplicate the
  CRM can dedupe on rather than a new one.
- **`POST /api/sync/visit-assignment`** — the CRM calls this once a KAM and
  the store team have named a BM for a scheduled visit. Body:
  `{ visit_request_id, status, assigned_bm_name, assigned_bm_phone,
  assigned_bm_email, assigned_bm_photo_url }`. `status` is one of
  `requested` / `bm_assigned` / `completed` / `cancelled`.

Both are authenticated the same way `/api/sync/referrals` is —
`x-sync-key: $SYNC_SHARED_SECRET` — and both need the service role, which is
what lets `visit-assignment` move `status` and the `assigned_bm_*` columns at
all: `visit_request_guard_md_fields()` (007_studio_v2.sql) freezes those
against any authenticated partner session, and treats a null `auth.uid()`
(the service role) as Material Depot's side, exactly the way
`referral_guard_md_fields()` already does for a referral's decision fields.

## What is NOT built, and where it belongs

**Nothing in `materialdepot-crm` polls `/api/sync/outbox` or calls
`/api/sync/visit-assignment` yet.** That is a change in a different repo, on
a different deploy pipeline (Azure, and merging to `main` there is the
deploy) — designing and building it there is separate work, the same way the
original `/api/sync/referrals` producer was designed here and built into the
CRM as its own piece of work. A GitHub Actions nightly (or on-demand button)
hitting `outbox`, upserting into whatever table backs the `b2bSales` tab, is
the shape that matches how the existing referral-sync producer works —
**Azure SWA has no scheduler**, so do not build a cron on Azure for this
either.

## The trade-off this v1 makes, on purpose

`pushed_at` is marked delivered as soon as the outbox response is built, not
after the CRM confirms it wrote the row somewhere. If the CRM's write then
fails — a dropped connection, a bug on that side — the row will not be
offered again automatically. This is accepted here because nothing on this
path decides money (unlike `/api/sync/referrals`, where an order arrives
`pending` and only counts once an admin verifies it): worst case, a referral
sits invisible to the KAM tab until someone notices and re-triggers it by
hand. If that trade-off stops being acceptable, the fix is a `since` cursor
instead of a `pushed_at` flag — return everything updated after a timestamp
the CRM tracks itself, so a dropped response just gets re-fetched next poll.
Not built now because it adds a second synchronisation state to reason about
for a problem that has not happened yet.

## What the CRM side still owes, concretely

1. A poller (GitHub Actions nightly, or a manual button matching the existing
   "producer ships with a manual button first" pattern) that calls
   `GET /api/sync/outbox` and upserts each referral/visit into whatever
   backs the B2B sales tab, keyed on the UUID.
2. A screen or action where a KAM assigns a BM to a visit, which then calls
   `POST /api/sync/visit-assignment`.
3. Nothing else changes on this side — `VisitLog` (`components/referrals/`)
   already renders the assigned BM's name, phone, email and photo the moment
   this endpoint sets them.
