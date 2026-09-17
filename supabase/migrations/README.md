# Migrations

Nothing in this repo runs these. Paste each file into
**Supabase → SQL Editor → Run**, in order, against project
`vmwvxwqzqxhwesjokztf`.

Every file is idempotent — re-running one is safe and is the intended way to
apply a change to it.

| File | What it does | Applied |
|---|---|---|
| `001_init.sql` | Tables, indexes, the six reward tiers, `updated_at` triggers | ☑ 2026-09-11 |
| `002_rls.sql` | RLS on every table, ownership helper functions, `onboard_partner()` | ☑ 2026-09-11 |
| `003_roles.sql` | `staff_user`, partner lifecycle columns, the order approval gate, onboarding forms, the outreach pipeline, portfolios, partner activity | ☑ 2026-09-15 |
| `004_roles_rls.sql` | Policies for all of the above, the partner field guard, `review_portfolio_item()`, `my_kam()` (its `review_referral_order()` was replaced by 005) | ☑ 2026-09-15 |
| `005_studio.sql` | **PRD v1.1.** The columns the incentive formula cannot run without (per-order coupon, discount availed, delivery date), the §9.2 referral form fields and consent, escalations + their thread, theming, notification preferences, the phone-reveal log, Appendix B reason codes, `review_referral()`, `referral_phone_taken()` | ☑ 2026-09-16 |
| `006_credentials.sql` | **The issued password, kept until its owner changes it.** `issued_credential` (RLS on, no policies, sealed column), the fingerprint + read + reveal functions, and the trigger on `auth.users` that erases the secret on any password change | ☑ 2026-09-16 |
| `007_studio_v2.sql` | **The client-facing revamp.** `staff_user.photo_url` + `my_kam()` returning it, `referral_phone` (multiple numbers per referred client), `visit_request` (scheduling a store visit, and the BM assigned to it), `portfolio_item`'s new field list, `partner_team_invite`, `studio_project`/`studio_project_space`/`studio_project_item`/`studio_project_template` (the Projects tab), the `studio-media` Storage bucket | ☑ confirmed applied 2026-09-17 — this table's own ☐ was wrong. Probed live over PostgREST with the service-role key: `studio_project?select=id` and `staff_user?select=photo_url` both `200`, not `404`. |
| `008_phone_review.sql` | A number a firm links to a client (`referral_phone`, label `partner`/`additional`) now arrives `pending` and does not count for cart/order matching until an admin approves it in `/console/approvals` — `review_referral_phone()`, mirroring `review_referral_order()`. Every pre-existing row, and every `client`-label row (the number the referral itself was made on), is grandfathered/forced to `approved`. | ☑ confirmed applied 2026-09-17 — probed live over PostgREST with the service-role key: `referral_phone?select=status` returns `200` with `client` rows `approved`, non-`client` rows also `approved` (grandfathered), and `rpc/review_referral_phone` returns `42501 only a Material Depot admin can approve a linked number` for the service role (`auth.uid()` null there, correctly refused). |
| `../seed/001_demo.sql` | Demo data — a firm, 4 clients, 5 projects, boards, quotes, procurement, ledger, referrals, rewards | ☑ confirmed applied 2026-09-17, but see the note below — its own tail section sat silently unapplied for weeks and had to be re-run |
| `../seed/002_console.sql` | Demo console data — the team, two more firms, prospects, onboarding forms, portfolios, activity | ☑ confirmed applied 2026-09-17 — `partner` has 3 rows, `staff_user` linked, over the Management API after the Supabase SQL Editor could not get through it (see CLAUDE.md's landmine) |
| `../seed/003_bulk_variety.sql` | Five more testable partner logins across every lifecycle state, mood boards, portfolio images, escalations, visit requests, team invites, notification prefs — see its own header | ☑ confirmed applied 2026-09-17 — `partner` has 5 rows, all 8 `referral.status` values and all 6 `escalation.status` values present, probed by direct query |

**The Supabase SQL Editor cannot be trusted to apply a long paste, silently or
loudly.** 001_demo.sql's own consent/escalation tail (near its end) reported
success when originally pasted and had, in fact, not run — found only by
querying `escalation` directly and getting zero rows, months later. Pasting
002_console.sql to fix an unrelated gap then threw `42P01: relation "another"
does not exist`, and rewording that string just moved the error to `relation
"a" does not exist` on the next attempt — proven a false alarm by running the
byte-identical file through `supabase/test`'s real Postgres with zero errors,
twice. What actually got both files applied cleanly was Supabase's Management
API (`POST https://api.supabase.com/v1/projects/<ref>/database/query`, a
personal access token, the whole file as one `{"query": ...}` string) — pure
HTTPS, and it skips whatever the browser editor's client-side parser is doing
wrong. After ANY paste — editor or API — query the actual table. A green
checkmark in this file is not evidence either; re-verify per row count or
per-status the way this section just did.

**003 and 004 must be run BEFORE the app that needs them is deployed.** Every
page reads `staff_user` through `currentActor()`, so a deployment that lands
first shows every partner "We could not load your workspace" until the paste
happens. Run the SQL, then deploy.

**005 should be run before its deploy too, though it degrades rather than
breaks.** It was written so that a deployment landing first is survivable and
honest, not silent:

- Its new **columns** arrive as `undefined` through `select('*')`, and every one
  of them is typed optional and read as *unknown* rather than as zero or false.
  So a delivery date that is not there reads "awaiting a delivery date from us",
  and a missing coupon withholds the net cashback figure with the reason on
  screen — which is what it should say anyway until the sync starts sending
  them.
- Its new **tables** 404, and the pages that read them render `<Problem>` saying
  so. The Rewards page will show "We could not check your open escalations", and
  the Clients page the same.
- The one real regression while it is unapplied: `consent_given` is missing, so
  **every** client reads as "consent not confirmed" and the partner sees the
  §14.5 aggregate view rather than the itemised timeline they had before. That
  is the correct behaviour for an unknown consent state and the wrong answer for
  a client who has actually agreed. Paste 005 first.

**008 is the opposite of 005: it BREAKS if the deploy lands first, it does not
degrade.** `/api/sync/referrals` filters `referral_phone` on `.eq('status',
'approved')`, and a column that does not exist yet is a hard Postgres error,
not an empty result — every sync call 500s and no cart or order matches
anything, for every firm, until the paste happens. Paste 008 first, here more
than anywhere else in this file.

Both migrations, and the seed, are tested against a real Postgres by
`supabase/test` — `cd supabase/test && npm install && npm run all`. That suite
is also what asserts one architect cannot read another's rows, so run it before
changing any policy.

Tick the box in this table when you have run it, and say so in the commit. A
migration committed here is **not** evidence it was applied — if a column is
missing at runtime, check the live table before assuming the code is wrong.

Neither is a tick, on its own. Every box above was confirmed by **probing the
live project over PostgREST** with the service-role key — selecting each new
column, hitting each new table, and calling each new function to see whether it
404s (missing) or 403s with its own permission message (present and enforcing).
003 and 004 sat unticked here for a day after they had actually shipped, which
is the same failure in the other direction.

**006 was applied 2026-09-16 and probed, not assumed.** Over PostgREST with the
service-role key: `issued_credential` returns `200 []`, `app_read_credential`
returns `state: "none"` for an unknown uuid (the third state, not an error), and
`app_note_credential_reveal` returns `204`. That last one is the **final**
statement in the file and `app_read_credential` the one before it — a paste that
died partway aborts at the first error, so both answering proves every object
ahead of them ran, the `auth.users` trigger included. That ordering argument is
the cheap way to check a long migration without a SQL console.

The security claim was probed too, with the anon key, and includes a real write
rather than only reads — all four came back `42501`: select on the table, the two
functions, and an INSERT.

| Probe (anon key) | Result |
|---|---|
| `select * from issued_credential` | `42501 permission denied for table` |
| `rpc/app_read_credential` | `42501 permission denied for function` |
| `rpc/app_pw_fingerprint` | `42501 permission denied for function` |
| `INSERT` a row | `42501 permission denied for table` |

**What it looked like before that, kept because it is the shape of every
unapplied migration here.** Until it was pasted, every
login still gets created and still works — retention is best-effort by design —
but the modal says *"the password was NOT retained … copy it now"* instead of
promising it can be found again, and tapping a name returns the error naming
this file. Nothing silently forgets a password while telling an admin it is
kept.

Two things to check after pasting it:

- **The trigger on `auth.users`.** Supabase normally allows it (it is the same
  privilege the `handle_new_user` pattern uses), but if the statement is refused
  the rest of the file still works: `app_read_credential()` re-checks the
  password fingerprint on every read and erases the secret itself. The suite
  asserts both paths separately, so the trigger is a fast path and not the
  guarantee.
- **The schema cache.** New functions reach PostgREST on a cache reload. If
  `app_read_credential` 404s from the app a minute after the paste, run
  `notify pgrst, 'reload schema';`.

**Applied is not populated.** 005's columns exist and nothing fills them: every
order is missing `delivered_on` and `discount_availed`, every referral has
`consent_given` null. The app reads all three as *unknown* and says so, which is
correct. The producer that changes that is the CRM bridge — `docs/referrals.md`.

## Which project

Three Material Depot Supabase projects exist and they are easy to confuse:

| Project | What lives there |
|---|---|
| `vmwvxwqzqxhwesjokztf` | **this app** — partners, projects, boards, quotes, referrals |
| `olkkioacgccgsjjlmbhc` | the internal CRM (`materialdepot-crm`) |
| `jqrdfnjfxqxrazfkaofm` | the field-ops apps (site audit, installations) — runs with RLS **off** |

This app runs with RLS **on**, unlike the field-ops project. That is not an
oversight to be tidied up: the anon key ships to every architect's browser, and
one architect must not be able to read another's client list or margins.
