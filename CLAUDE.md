# b2b-client-dashboard

**Material Depot for Partners** — two apps on one deployment.

`app/(app)/**` is what an architect or interior designer sees, in six tabs:
Overview, Clients, Projects, Portfolio, Rewards, Settings. It is built to
**`Studio-Sales-Dashboard-PRD-v1.1`** plus the client-facing revamp on top of
it — the section numbers quoted throughout the code and docs are the PRD's.

The unit on Clients is the **client**, not the event — one row per person
referred, their timeline behind the name, and what is sitting in their cart.
It was a merged feed of everybody's events first, and that is the shape a log
file has, not the shape the question has.

**Projects** (mood boards, `docs/projects.md`) is a different, much lighter
feature from the opt-in design/quote/procurement workspace that used to live
at this URL. That workspace is real, finished, and now lives at
`/workspace/projects` and `/workspace/clients`, gated by a per-firm flag and
**off by default** — see "The project workspace is opt-in" in `docs/roles.md`.
Do not conflate the two "Projects."

`app/(console)/**` is Material Depot's own B2B team: an admin who verifies
orders and issues logins, KAMs, outreach and inbound managers. Read
`docs/roles.md` before touching either.

Next.js 16 (App Router, Turbopack) + Tailwind 4 + Supabase. Deployed on Vercel
at <https://b2b-client-dashboard-eight.vercel.app/>.

**This repo is PUBLIC** (`dhruv-md/Studio-Sales`, verified 2026-09-16).
Everything committed is world-readable, so no real partner or client names,
phone numbers, GSTINs, order values or tokens in code, seeds, fixtures, commit
messages or docs. `supabase/seed/001_demo.sql` is invented data and must stay
that way.

**`origin` moved on 2026-09-16.** It was `daaku-daddy/B2B-Client-Dashboard`,
which still exists with the same history up to `327871e` — so a stale clone, a
stale Vercel connection or an old PR link can quietly point at a repo that is no
longer the one being written to. Check `git remote -v` before believing anything
about where a commit landed.

```bash
npm run dev        # next dev — NOTE: :3000 is usually the materialdepot-crm
                   #  dev server, so this lands on :3001. Read the log line.
npm run build      # next build
npm run typecheck   # tsc --noEmit
npm run test:domain # the pure rules, run directly — no bundler, no database

cd supabase/test && npm install && npm run all   # the SQL + RLS suite
```

There is no lint command. The gate is `npm run typecheck`, `npm run build`,
`npm run test:domain`, and — for anything touching `supabase/` — the suite in
`supabase/test`, which runs the migrations and both seeds against a throwaway
Postgres 18 and asserts **189** things about RLS. **Run all four before claiming
a change works.**

And then look at it. Every one of the eighteen bugs in `docs/landmines.md` passed
`tsc` and `build` — including a `useMemo` placed below an early return, which
crashed a route the moment anybody clicked a row; most were found by signing in as the demo firm and walking
the tabs, or by rendering a component against a fixture. `supabase/seed/001_demo.sql` exists so that is a two-minute
job rather than an hour of data entry.

## The one thing to know first

**No SQL in this repo runs itself.** `supabase/migrations/*.sql` and
`supabase/seed/001_demo.sql` are pasted into the Supabase SQL Editor by hand.
001–004 were applied on 2026-09-11, **005 on 2026-09-16** — verified by probing
every column, table and function over PostgREST rather than by being told.
**006 on 2026-09-16** as well — table, both trailing functions and the anon
denial all probed live, including a real INSERT attempt.
`supabase/migrations/README.md` is the checklist and says which of the three
Material Depot Supabase projects this one is.

**Applied is not the same as populated.** 005 added the columns the incentive
programme needs; nothing fills them yet. On production today every order is
missing `delivered_on` and `discount_availed`, and every referral has
`consent_given` null — so maturity reads "awaiting a delivery date", net
cashback is withheld in favour of gross, and every client shows §14.5's
aggregate view. That is the app being correct about an empty input, not a bug,
and the producer that fixes it is the CRM bridge in
`materialdepot-crm/docs/b2b/partner-bridge.md`.

**A migration committed here is not evidence it was applied.** If a column is
missing at runtime, check the live table before assuming the code is wrong. And
before handing anyone SQL to paste, run it through `supabase/test` — several of
the entries in `docs/landmines.md` are seed or migration bugs that would
otherwise have died a third of the way through someone's paste.

**SQL first, then deploy.** `currentActor()` reads `staff_user` on every page, so
a deploy that lands before `003`/`004` have been pasted shows every partner "We
could not load your workspace" until somebody notices.

Demo login, once the seed is in: `demo.studio@materialdepot.com` /
`DemoStudio2026!`. This Supabase project has **email confirmation ON**, so a
fresh sign-up gets "check your email" and no session — the seed confirms that
one address for you.

## Shape of the app

| Path | What it is |
|---|---|
| `proxy.ts` | Session refresh + the signed-out redirect. Next 16's `proxy` convention, not the deprecated `middleware`. |
| `app/(app)/**` | The partner app. `layout.tsx` resolves the firm, bounces staff to the console, gates onboarding. |
| `app/(console)/**` | Material Depot's B2B console. `layout.tsx` bounces partners back to their own app. |
| `app/(console)/console/partners/[id]/dashboard` | One firm's own dashboard, read-only, for support calls. Adds no policy — `docs/roles.md`. |
| `app/login` | Email + password. Phone-OTP is the intended production login — see `docs/auth.md`. |
| `app/api/catalog/search` | Server proxy to Material Depot's catalogue. **Blocked today by Cloudflare, with Django CSRF behind it** — `docs/catalogue.md`. |
| `app/api/sync/referrals` | Push endpoint for referral events and orders. Service-role, shared-secret. |
| `app/api/sync/outbox`, `app/api/sync/visit-assignment` | The other direction — new referrals/visits out to the CRM, and a BM assignment back in. `docs/kam-bridge.md`. |
| `app/api/upload` | The only door into the `studio-media` Storage bucket — checks the caller's session, then writes with the service role. |
| `app/p/**` | Public, unauthenticated presentation pages for a shared Project or Space — `proxy.ts` exempts this path from the sign-in gate. |
| `lib/domain/**` | The rules, and no I/O. Money, quantity, areas, markets, the internal tiering and the per-client rollup — plus the incentive programme: `slabs.ts` (the §10 ladders), `ledger.ts` (attribution, maturation, the statement), `periods.ts` (calendar months in string space), `programme.ts` (**every §17 default, in one file**), `privacy.ts` (§14.5), `reasons.ts` (Appendix B), `theme.ts` (§13.3 + the AA gate). |
| `lib/analytics/**` | §14.6's single instrumentation layer. **The only place in the app allowed to know a vendor exists** — `docs/analytics.md`. |
| `lib/data/**` | Partner reads/writes (`queries.ts`, `actions.ts`), console reads/writes (`console-*.ts`), **your own account (`account-actions.ts`, either app)**, the `Result` type, the session and the role gates. |
| `lib/auth/credentials.ts` | The one-time password generator, and the AES-GCM seal that keeps it until its owner changes it — `docs/auth.md`. |
| `components/**` | `ui/` primitives, then one folder per module. `console/` is staff-only and must never be imported from `app/(app)/` — `account/` exists because of that rule, holding the one component both apps need. |
| `app/(app)/settings` | §13 — studio profile, team, theme, notifications, and the Sign-in tab that changes a password. |
| `app/(console)/console/settings` | A staff member's own account and password. On **every** console role's sidebar, because it is the only way to stop the console being able to read the password you were issued. |
| `test/domain.test.ts` | The pure rules, asserted at their boundaries — including every published figure of the §10 slab tables. `npm run test:domain`. |
| `supabase/migrations/**` | The schema and the RLS policies. Pasted by hand. |
| `supabase/seed/001_demo.sql` | A whole demo firm — 5 projects, boards, quotes, procurement, ledger, referrals, rewards. Idempotent. |
| `supabase/seed/002_console.sql` | The demo B2B team, two more firms, prospects, onboarding forms, portfolios, activity. |
| `supabase/test/**` | Migrations + seeds + 189 RLS assertions against a throwaway Postgres. Its deps are deliberately outside the app's `package.json`. |

## House rules

Eight conventions carry most of the weight. Breaking one is how this app would
start lying to an architect about their own money — or show their margins to a
supplier.

### 1. A failure is never an empty list

Every read and write returns `Result<T>` (`lib/data/result.ts`) and every caller
renders `<Problem>` on the failure branch. Returning `[]` on error is banned:
Material Depot has already shipped a roster that failed to load and rendered as
"no staff", and a dashboard that errored and read as a quiet day. The catalogue
search goes further and has **three** states — `ok`, `empty`, `unavailable` —
because "the search never ran" and "no product matches" are different facts.

Same rule on identity: a phone lookup either matches exactly one referral,
matches none, or is **ambiguous**. The third is reported, never folded into the
second.

### 2. Prices are snapshots, not lookups

`board_item` and `quote_line` each carry their own `sku`, `unit`, `rate`,
`gst_pct`, `coverage_area`. A quote that re-prices itself between being sent and
being accepted cannot be sent to a client. `priced_at` says how old the snapshot
is; rebuilding the quote is how you take a new one.

### 3. Material Depot rates are TAX-INCLUSIVE

`lib/domain/money.ts` is the only place that does money arithmetic, and it
documents why: the catalogue field is `selling_price_with_tax`, so GST is
**backed out** for display and never added on top. Markup applies to the
tax-inclusive figure. Do not add an "is this inclusive?" flag anywhere.

### 4. Derived totals are never stored

Reward progress, client spend, procurement percentages and project P&L are all
computed at read time from the rows they come from. `referral_order.md_enq_id`
is unique, which is what makes the incentive total idempotent under a re-sync.
`reward_claim` records that a tier was *reached* and whether it was handed over
— it is not the source of truth for whether it is unlocked.

The incentive programme goes further: slab, cashback, gift, maturation and the
whole statement are computed from `referral_order` on every read. Nothing about
money is stored except the orders themselves and an admin's decision on each one.

### 5. An unknown is not a zero, and it is not a no

Three places this rule decides money or privacy, and all three carry the third
state rather than collapsing it:

- `discount_availed` null = **we have not been told**, not ₹0. The net cashback
  figure is withheld and the screen says why (`docs/rewards.md`).
- `delivered_on` null = the maturation clock has not started, not "matured".
- `referral.consent_given` null = **not asked**, not refused (`docs/referrals.md`).

Collapsing any of them compiles, reads fine, and is wrong in the direction that
costs somebody money or exposes somebody's shopping.

A fourth arrived with `006_credentials.sql`, and it splits **four** ways rather
than three. Looking up the password a login was issued returns `current`,
`changed` (they set their own, so we erased ours), `none` (we never kept one) or
`unreadable` (a row that will not open — a rotated key). Folding `changed` into
`none` tells an admin there is nothing on file for an account that is working
perfectly, and the reset they then issue breaks it. `docs/auth.md`.

### 6. A write must not destroy what it was not told about

An upsert writes every column in its payload, so building a row with
`store: o.store ?? null` blanks the store on every re-sync that omits it.
Payload-shaped writes go through a `defined()` filter that drops `undefined`
keys; an explicit `null` still clears. This one shipped — `docs/landmines.md`.

### 7. Material Depot staff see the relationship, never the work

No policy anywhere lets staff read `client`, `project`, `project_area`, `board`,
`board_item`, `quote`, `quote_line`, `procurement_item` or `finance_entry`. A
KAM can see which clients a firm referred to us and what those clients bought
from us; they cannot see that firm's own client list, its quotes or its margins.

That is the only reason a designer would put their pricing in a supplier's
portal, and a "just for support" read policy on any one of those tables would
throw it away. `supabase/test/rlstest.js` group 8 checks all nine by name.

### 8. The money gate lives in the database

Only an `approved` order counts towards a partner's rewards, and
`referral_order` has **no UPDATE policy for anybody**. The single thing that can
change that column is `review_referral_order()`, which re-checks
`app_is_admin()` inside Postgres. Same for publishing a portfolio piece.

App-layer role checks (`requireStaff`) are there so the UI can be honest, not so
the database can be trusted to a form field. A bug in one must not be enough to
hand somebody a gold coin.

## Docs

Module detail lives in `docs/`, read on demand:

| Doc | Holds |
|---|---|
| `docs/roles.md` | **The three kinds of user, the console, market segregation, and the trust boundary. Start here.** |
| `docs/onboarding.md` | Outreach → the form → admin verification → credentials; the internal Power/Mid/Basic classification |
| `docs/portfolio.md` | Partner portfolios and the publish gate |
| `docs/auth.md` | The login model, `onboard_partner`, why not phone OTP yet, and **why the issued password is retained until its owner changes it** |
| `docs/catalogue.md` | The Material Depot search API, its field names, and the CSRF wall |
| `docs/design.md` | Rooms, boards, the palette link, how quantities are worked out |
| `docs/quote.md` | Building a quote, markup, the client PDF, accepting |
| `docs/procurement.md` | The list, quantity-vs-row progress, status auto-advance |
| `docs/finance.md` | Why the ledger is hand-entered and not derived from the quote |
| `docs/referrals.md` | The three systems referral data lives in, the sync contract, and why cart state is derived |
| `docs/rewards.md` | **The §10 slab programme** — the two ladders, the formula, maturation, go-live, and why `reward_tier` is not the programme |
| `docs/escalations.md` | §9.4, and why an open one holds an order's money |
| `docs/analytics.md` | §14.6 — the one wrapper, the taxonomy, and what is deliberately not wired |
| `docs/settings.md` | §13 — profile, team, the theme and its WCAG gate, notifications, and the Sign-in tab on both apps |
| `docs/projects.md` | **The Projects tab** — mood boards, not the workspace; sharing, uploads, the PDF, and why `/p/` is exempt from the sign-in gate |
| `docs/kam-bridge.md` | The outbox that reflects a new referral/visit into the CRM's KAM tab — built here, nothing on the CRM side yet |
| `docs/open-questions.md` | What is decided by default and needs a human to confirm |
| `docs/landmines.md` | **Eighteen bugs already shipped or caught here**, kept because the shape of each recurs. Read before trusting a passing build. |
| `supabase/test/README.md` | What the 189 assertions cover, the `blocked()` vs `unchanged()` distinction, and the two shim details that are load-bearing |

**When you change behaviour a doc describes, update that doc in the same
commit.** A doc describing last month's behaviour is worse than no doc, because
the next session will trust it.

## Deploying

Vercel project `material-depot1/b2b-client-dashboard` →
<https://b2b-client-dashboard-eight.vercel.app>.

**Connected to `dhruv-md/Studio-Sales`, and a push to `main` now deploys to
production.** That became true on 2026-09-16 and had never been true before: the
project had no Git connection at all until then — `project.link` was null and the
old repo had no webhook, so every earlier deployment was a `vercel --prod` from
this directory. This file claimed "built from `main` on push" the whole time,
which is the more dangerous kind of wrong: it reads as though shipping is
automatic when nothing was listening.

Connecting it needed a step on the GitHub side, worth knowing if it ever has to
be redone. Vercel reaches GitHub through an App installed **per account**, and it
was installed on `daaku-daddy` — which cannot see a repo owned by `dhruv-md`, so
`vercel git connect` failed with *"You need admin or write access"* even though
`dhruv-md` had admin. The fix is installing the App on the owning account
(<https://github.com/apps/vercel/installations/new>), and GitHub only offers
accounts the **currently signed-in** GitHub user administers — so the browser has
to be signed in as that account first. Both are personal accounts, so this dance
recurs; moving the repo to an org would end it.

Note the side effect: `/v1/integrations/git-namespaces` now returns only
`dhruv-md`. `material-depot-site` and `visit-schedule-site` are still linked to
`daaku-daddy/*` repos — **unverified** whether their push-deploys survived.

`vercel.json` pins `"framework": "nextjs"` **on purpose**: the project was
originally created with a static preset and every build failed with *No Output
Directory named "public" found* even though `next build` had just succeeded.
Keeping the framework in the repo means a new deployment cannot inherit that
setting again.

Environment variables live in the Vercel project, not here. All four are set on
**Production and Development** as of 2026-09-11:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SYNC_SHARED_SECRET`.

**Preview is still missing the two `NEXT_PUBLIC_*` ones** — `vercel env add …
preview` loops on `git_branch_required` whichever documented form you use, so
they need adding in the dashboard.

Four more are **optional and unset**, and the app is correct without them:

| Variable | Used by | Unset behaviour |
|---|---|---|
| `NEXT_PUBLIC_B2B_DESK_PHONE` / `_EMAIL` / `_HOURS` | `KamCard`'s fallback when a firm has no KAM assigned (§13.5) | The card says any store can help, rather than printing a desk number. **Deliberate** — an invented number in a live partner app means a partner rings a stranger and concludes the whole product is fake. Set these when the desk exists. |
| `NEXT_PUBLIC_APP_VERSION` | `app_version` on every analytics event (§14.6.3) | `'dev'`. Harmless until a vendor is connected, at which point every event from production would be stamped `dev`. |
| `CREDENTIAL_KEY` | The seal on a retained password (`lib/auth/credentials.ts`) | The key is derived from `SUPABASE_SERVICE_ROLE_KEY` instead, so nothing breaks. **Set it before ever rotating that key**: rotation changes the derived key and every password sealed under the old one then reads `unreadable` — honestly labelled, but no longer recoverable. |

There is **no Mixpanel token and no Clarity id**, on purpose — `docs/analytics.md`
has why, and what adding one costs (one function, one file).

An env var only reaches a NEW deployment, so `vercel --prod` after changing one.
`/api/sync/referrals` returns 503 naming the missing variable rather than
failing silently, which is also how you check from outside whether a deploy
picked the value up.
