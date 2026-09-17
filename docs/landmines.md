# Bugs already shipped here

Twenty-two now. Kept because the **shape** of each one recurs, and because
every one of them passed `tsc` and `next build` first.

Add to this file when you fix a bug whose shape could come back. Date it, and
say what it looked like from the user's side — that is the part that makes the
next person recognise it.

---

## 2026-09-11 · A partial sync payload erased columns it never mentioned

`/api/sync/referrals` built its rows as `store: o.store ?? null`. An upsert
writes every column in the payload, so a re-sync carrying only `md_enq_id` and
`order_value` **blanked the store and the date** on a row that already had them.

*From the user's side:* an order in the Rewards table with a dash where
"Whitefield" had been, and no order date. Nothing errored.

Rows now go through `defined()`, which drops keys whose value is `undefined`.
An explicit `null` still clears — that is how a caller says "empty this".

**The shape:** any upsert built from an optional-field payload. `?? null` in a
row literal is the tell. Found by re-posting a seeded row during testing, which
is the cheapest way to look for it.

---

## 2026-09-11 · `auth.users.confirmed_at` cannot be written

The seed tried to confirm the demo login with
`set email_confirmed_at = …, confirmed_at = …` and failed with
`428C9: column "confirmed_at" can only be updated to DEFAULT`. In Supabase it is
`GENERATED ALWAYS AS (least(email_confirmed_at, phone_confirmed_at)) STORED`.

Set `email_confirmed_at` only; the other follows for free. `supabase/test/shim.sql`
reproduces the generated column so this cannot regress silently.

**The shape:** assuming a Supabase-managed schema is plain columns.

---

## 2026-09-11 · The seed linked a login to a firm that did not exist yet

`partner_user` was inserted before `partner`, so the whole file died on
`23503 violates foreign key constraint`, a third of the way through a paste.

**The shape:** ordering in a hand-run SQL file. Nothing checks it but running it.

---

## 2026-09-11 · Procurement truncated the Material Depot enquiry id

`md_enq_id` sat in a `w-28` input. `ENQ2026072884321` rendered as
`ENQ2026072884` — not a shortened number, **a different one** to anyone reading
it off the screen and quoting it to Material Depot.

*From the user's side:* nothing looks wrong. That is what makes it bad.

**The shape:** an identifier in a fixed-width input. Identifiers need room for
their real length, or a `title` at minimum. Check the longest live value, not a
placeholder.

---

## 2026-09-11 · An accepted quote could still be repriced

`quote_line` editing was locked once a quote was `accepted`, but the quote-level
markup, discount and validity beside it were not — so the total a client had
agreed to could be changed afterwards, with no record.

Accepted quotes now render as a read-only summary pointing at Rebuild.

**The shape:** locking a record at one level and not the other. If part of a
thing becomes immutable, all of it has to.

---

## 2026-09-11 · Every board cover rendered blank, from images that loaded fine

The seed used `palette.materialdepot.com/cdn-img/main/general-images/<uuid>.png`.
Those are real, public, return `200 image/webp`, and are palette's scene
**compositing layers** — near-transparent, ~2 KB. So `img.complete` was `true`,
`naturalWidth` was 800, the element was 363×96 and visible, and there was
nothing to see.

The photographs are `/cdn-img/azure/application_image/<scene>-medres.jpg`,
40–124 KB. See `docs/catalogue.md`.

**The shape:** verifying an asset with a status code. `200` means a response
arrived, not that it is a picture. Check the byte size.

Second lesson from the same bug: a JPEG page screenshot can be captured before
images paint even when `complete` is `true`. Zoom into the region before
concluding an image is broken.

---

## 2026-09-15 · A guard trigger locked the SQL Editor out of its own table

`partner_guard_md_fields()` refuses a non-admin's change to the columns Material
Depot owns, and decided "non-admin" with `app_is_admin()` alone. The service role
and the SQL Editor have no `auth.uid()`, so `app_is_admin()` is false for them —
and `seed/002_console.sql` died on `42501 that field is set by Material Depot,
not by the firm` while trying to set the demo firm's own market.

*From the user's side:* a seed file that runs fine as far as section 2 and then
stops, with an error that reads like a permissions misconfiguration.

The guard now passes anything through when `auth.uid() is null`. That is safe
because every signed-in route into the table is a policy that is `to
authenticated` and needs a uid, so a null uid cannot be a partner.

**The shape:** a trigger written in terms of "is this user allowed" when the
thing doing the writing is not a user at all. RLS has `service_role bypassrls`;
triggers have no such thing and fire for everybody. Any `SECURITY DEFINER` guard
needs an explicit answer for "there is no caller".

---

## 2026-09-15 · Three RLS assertions passed by not testing anything

New tests, caught before they were trusted, but the shape is worth keeping:

- `update partner set workspace_enabled = true` to prove a firm *cannot* — the
  demo firm already had it `true`, `is distinct from` was false, and the guard
  let the no-op through. The test reported "IT WENT THROUGH" on a guard that
  works. Now `not workspace_enabled`.
- Setting a portfolio item to `submitted` and *then* trying to publish it — the
  `using` clause rejected the second update for 0 rows, which the harness read as
  blocked. It was, but by the wrong clause; `with check` on the status was never
  exercised. Now the publish attempt runs first, on a genuine draft.
- Counting partner rows to prove market scoping, when the suite's own fixture
  firm has `market = null` and is *deliberately* visible to everyone. Correct
  behaviour read as a leak. Now asserted by id.

**The shape:** an expected-failure test that would also pass if the thing under
test did nothing. Three separate ways to get it — writing the value that is
already there, tripping an earlier guard than the one you mean, and counting
rows when a documented exception is in the count. Make the write a real change,
assert the specific refusal, and name the rows.

---

## 2026-09-15 · Valid SQL that a real Postgres ran, and the SQL Editor would not

`seed/002_console.sql` applied cleanly against Postgres 18 in `supabase/test`,
and died in the Supabase SQL Editor with:

```
ERROR: 42P01: relation "another" does not exist
```

`another` is a word from the middle of a string literal —
`'Locked into another supplier until next year.'`. For Postgres to read
`into another` as a table reference, the quoting had to be off by the time it
reached that line. Checked and ruled out: the file is byte-identical to raw
GitHub, a proper lexer says every quote and `$$` is balanced, there are no curly
quotes, and the line numbers in the editor matched the file exactly, so the paste
was complete.

Nothing was written — all six tables were still empty afterwards — so the
failure was at least atomic.

Rather than chase the client, the file was rewritten so there is nothing to lose
track of: plain ASCII throughout (it had em dashes, an en dash, `->` arrows, a
rupee sign and an `é`), no `$$` block (the one `do` block became a plain
`select`), no apostrophes in prose comments, and no semicolons inside string
literals. It then ran first time.

**The shape:** "it is valid SQL" and "it will survive the trip to the server" are
different claims, and only the first one is testable here. Hand-pasted SQL passes
through a clipboard, a browser and an editor before it is parsed. Anything whose
meaning depends on exact quoting — an apostrophe in prose, a semicolon in a
string, a multi-byte character, a dollar-quoted block — is a thing that can
arrive subtly different. Keep files that humans paste boring and ASCII.

And the diagnostic that actually paid: query the live tables to see how far it
got. Six empty tables said "atomic failure, safe to retry" in one request, and
the same check proved 003 and 004 had landed.

---

## 2026-09-15 · A nav array crossed the server/client boundary and 500'd every page

`Sidebar` is a client component. It used to `import { NAV } from './nav'`
itself, so the Lucide icons on each item never left the client bundle. Making it
serve two apps, it was changed to take `items: NavItem[]` as a prop — computed in
a Server Component layout.

A `NavItem` carries `icon`, which is a React component. Functions cannot be
serialised across the boundary, so every render threw:

```
Functions cannot be passed directly to Client Components
  {$$typeof: ..., render: function LayoutDashboard}
```

*From the user's side:* a black "This page couldn't load — A server error
occurred" on **every page of both apps**. Not the console alone: the partner app
took the same prop and broke identically.

`npm run typecheck`, `npm run build`, every RLS assertion and every domain
assertion all passed, and so did every data query when probed directly with a
real user's JWT. Nothing but loading the page in a browser found it.

The fix: `Sidebar` takes `nav={{ kind: 'partner', workspaceEnabled }}` or
`nav={{ kind: 'console', role }}` — plain serialisable data — and calls
`partnerNav()` / `consoleNav()` itself.

**The shape:** moving a computation from inside a client component up into a
server one, when its result contains anything that is not plain data. Components,
functions, class instances, `Date` methods. The tell is a prop whose type comes
from a module that imports an icon library. It compiles, it type-checks, and it
fails on first render.

Second lesson, and the one worth keeping: the deploy went green, the data layer
verified clean from the command line, and the app was still completely broken.
`docs/landmines.md` keeps saying "and then look at it" — this is why.

---

## 2026-09-15 · "All earned 🎉" was what an empty ladder looked like

`rewardStatus()` returned `next: null` for two completely different situations —
a partner who has cleared every milestone, and a `reward_tier` table that came
back empty because the read of it failed. Four call sites read that one null as
the first: the partner dashboard, the referrals page, `RewardTrack`'s headline
badge and the new firm-view page all said **All earned / Every milestone
unlocked / Every milestone earned 🎉**.

*From the user's side:* an architect who has referred nothing opens their
dashboard and is congratulated on completing an incentive scheme they have not
started. The `<Problem>` banner about the failed read is on the same screen,
above it, saying the opposite.

`RewardStatus` now carries `complete` — every tier earned **and** there was at
least one to earn — and every call site reads
`complete ? 'All earned' : next ? … : '—'`.

**The shape:** house rule 1 one level down. "A failure is never an empty list"
was obeyed at the data layer — the read returned `Result` and the page rendered
`<Problem>` — and then the empty list was fed into a derived value where absence
and completion collapse into the same sentinel. Any `find() ?? null` whose null
answers two questions. Found by rendering the component against a fixture with
no tiers, which took two minutes and is the only reason it was not shipped.

---

## 12. A `useMemo` added below an early return

`tsc` passed. `next build` passed. Every page rendered. Opening one client threw
**"Rendered fewer hooks than expected"** and the whole route went to the error
overlay.

`ReferralsView` returns early when a client is open. The §9.1 list filtering was
added as a `useMemo` further down the file, *after* that return, so the hook ran
on the list and did not run on the detail view. React counts hooks; two different
counts for one component is a crash, not a warning.

**The shape:** a component with an early return is a component where "add the
memo next to where it is used" is wrong. Every hook goes above every `return`.

Found by clicking a client. Neither of the two gates that pass before you click
can see it.

## 13. Our own brand colour failed the contrast rule we were about to enforce

§13.3 requires WCAG AA on partner themes. The first run of the preset test
failed on `Material Depot` itself: `#c4581c` measures **4.41:1** against white
and AA needs 4.5 for normal text. It had shipped that way from the start and
nobody had noticed, because 4.41 and 4.5 look identical.

Fixed the colour (`#bd5318`, 4.76:1) rather than exempting the default from the
rule. **The shape:** a rule you are about to apply to other people is worth
running against yourself first — and a contrast ratio is the kind of thing only
a function can see.

## 14. "No order yet" next to "Placed an order: Yes"

`valueBand(0)` returned `'No order yet'`. On a client with two orders that had
not matured, the consent-limited panel rendered:

> Placed an order — **Yes**
> Value so far — **No order yet**

Two orders had been placed; nothing had *counted*. Zero-counted and never-ordered
are different facts and the band label conflated them. Now `'Nothing yet'`, and
the row is labelled "Counting towards your rewards".

**The shape:** a formatter that phrases its own zero case will eventually be used
somewhere that zero means something else. Keep the label at the call site.

## 15. A chart label drawn over the bar it was labelling

The revenue trend draws slab thresholds as reference lines with the figure at the
right-hand end. The labels were absolutely positioned inside the plot, so the
moment a month reached the band being labelled — the exact month a partner looks
at the chart for — the bar covered the text.

The threshold labels now have their own 56px column. **The shape:** an overlay
that is legible in the empty state is not evidence it is legible with data in it.

## 16. Grey meant two opposite things on the same chart

The same chart painted pre-programme months in `bg-line` and Silver Coin months
in `bg-silver`. Both are grey. The caption read *"Grey bars are before the
programme started and carry no reward value"* — pointing directly at the month
that had earned a Silver Coin.

Pre-programme months are now an outline, and the caption names both. **The
shape:** a legend that describes a colour rather than a treatment breaks the
moment two things in the palette are the same colour family.

## 17. An RLS test that passed because the write changed nothing

`update referral set consent_given = true` against a row where it was already
`true` is allowed by `referral_guard_md_fields()` — the guard compares with `is
distinct from`, so a no-op update is correctly not a change. The first version of
the test asserted a firm could not set that column and wrote the value that was
already there, so the guard never fired and the suite reported a leak.

Asserted as a **change** now (`true` → `false`, and claiming consent on a client
who has not given it). **The shape:** a negative test has to attempt something
that would actually differ.

## 18. A policy-less UPDATE does not raise

Three new assertions failed with "IT WENT THROUGH" against tables that have no
UPDATE policy for a partner at all. They had not gone through: RLS filters the
row out and Postgres reports success against **zero rows**.

The suite's `blocked()` helper only understands exceptions, so it scored a
correctly-refused write as a pass in the other direction. Added `unchanged()`,
which asserts `rowCount === 0`. **The shape:** "refused" has two shapes in
Postgres, and a table whose only defence is the *absence* of a policy gets the
quiet one.

## 19. A public share page redirected to /login

`app/p/[token]` and `app/p/space/[token]` (007, the Projects tab) are meant to
be opened by anyone with the link, no account needed. `proxy.ts` runs on
every route except `/login` and `/api/*` and bounces a signed-out visitor to
`/login` — so the very first load of a shared link, by the person it was
built for, went straight to a sign-in screen for an app they were never given
credentials to. Caught before ship by actually opening the link signed out,
not by `tsc` or `build`, which have no opinion about redirects.

Fixed with an explicit `if (path.startsWith('/p/')) return res` ahead of the
sign-in check. **The shape:** a global auth gate defaults to closed, so any
route meant to be public needs its own exemption — the same one `/login`
already has — and that only shows up by loading the page as a stranger would.

## 20. `create or replace function` refused a wider return type

`my_kam()` (007) grew a `photo_url` column. `create or replace function`
changed nothing else about it, and Postgres refused with `42P13: cannot
change return type of existing function … Use DROP FUNCTION my_kam() first`
— a `returns table (...)` signature is fixed once created; replacing the
body is fine, widening the OUT parameters is not. **The shape:** any
`SECURITY DEFINER` function returning `table (...)` needs an explicit `drop
function` ahead of `create or replace` the day its return shape changes, not
just the day it is first written.

## 21. A guard trigger written for "admin" silently blocked "any staff"

`visit_request_guard_md_fields()` (007) copied `referral_guard_md_fields()`'s
shape — `if auth.uid() is null or app_is_admin() then return new` — without
noticing the two rows mean different people. A referral's decision fields
really are admin-only; naming a BM for a visit is a KAM's routine job, so the
first version of the trigger raised `42501` against the market KAM's own
console action, which read from the outside like "assigning a BM is broken"
rather than "the wrong function was copied." Caught by the RLS suite
asserting the KAM case explicitly, not by asserting the partner case and
assuming staff followed from it. Fixed to `app_is_staff()`. **The shape:**
copying a guard trigger for a new table copies its bypass condition too, and
that condition is the one part that has to be re-derived from who is
actually supposed to write the column, not read off the table it was copied
from.

## 22. A rejected order rendered as "awaiting a delivery date"

The first version of `OrderStatus` (`components/partner/LiveOrders.tsx`,
2026-09-17) branched on `approval_status === 'pending'` and otherwise fell
straight through to `maturity()`. `maturity()` has no notion of `rejected` —
its only inputs are `delivered_on` and open escalations — so a declined
duplicate order, whose `delivered_on` is null forever because it was never
really being delivered under this attribution, came back `unknown` and
rendered "Awaiting a delivery date" directly above Material Depot's own
free-text status of "Cancelled".

*From the user's side:* signed in as a second demo firm
(`demo.aranya@materialdepot.com`, whose seed data in `003_bulk_variety.sql`
carries exactly this case) rather than the one the feature was first checked
against, an order that had been declined weeks earlier still read as
in-flight and due any day.

Fixed by checking `approval_status === 'rejected'` first and returning early
with **Not counted** and the same Appendix B reason the approvals queue
already renders (`explain(ORDER_NOT_COUNTED, o.not_counted_reason)`), rather
than reasoning about it from delivery state at all. **The shape:** a status
built from one field (delivery progress) silently mishandles a row whose
real state lives in a different field (an admin's decision) that the first
version never checked — and a feature verified against only the one demo
firm it was designed around will not surface that, because that firm had no
row in the state being missed. Checking a second account with different data
found it in minutes.
