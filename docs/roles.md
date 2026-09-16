# Who uses this, and what each of them can see

**Covers:** `app/(console)/** · components/console/** · lib/data/session.ts · lib/data/console-*.ts · staff_user · 003_roles.sql · 004_roles_rls.sql`

Three kinds of people sign in here, and they get different apps.

| Kind | What they are | Where they land |
|---|---|---|
| **Partner** | An architect or interior designer | `app/(app)/**` |
| **Staff** | Material Depot: admin, KAM, outreach, inbound | `app/(console)/**` |
| Neither | Signed in, attached to nothing | The onboarding form, or a note saying an admin has to link them |

`currentActor()` in `lib/data/session.ts` decides which, in one query pair, and
each layout redirects the other kind away. A staff member who lands on
`/dashboard` gets bounced to `/console` rather than shown an empty partner
workspace they would read as a broken app.

## The trust boundary

**Material Depot staff see the relationship. They never see the work.**

A KAM, an outreach manager and an admin can read a firm's profile, the clients
that firm referred to us, those clients' orders, the firm's rewards, its
portfolio and its history with us. They **cannot** read `client`, `project`,
`project_area`, `board`, `board_item`, `quote`, `quote_line`,
`procurement_item` or `finance_entry` — the architect's own clients, their
prices and their margins.

There is no policy on those tables for staff and there must never be one. A
"just for support" read would throw away the only reason a designer would put
their pricing in a supplier's portal at all. `supabase/test/rlstest.js` group 8
checks each of the nine tables by name, as an admin and as a KAM.

The same rule going the other way: a partner cannot read `staff_user`,
`partner_application`, `outreach_prospect` or `outreach_touch` (group 9). Their
KAM's name and number reach them through `my_kam()`, a SECURITY DEFINER function
that returns exactly one row — theirs.

## Seeing a firm's own dashboard

`/console/partners/[id]/dashboard` shows one firm its own dashboard back, exactly
as that firm sees it, read-only. It is reached from **Open their dashboard** on
the firm page and from **Their view** in the Firms directory.

This is the answer to "an admin should be able to see every partner's
dashboard", and it stays on the right side of the boundary above:

- **It added no policy.** Every table it reads — `partner`, `referral`,
  `referral_order`, `referral_event`, `reward_tier`, `reward_claim`,
  `partner_activity`, `portfolio_item` — already had a staff `select` policy
  from `004_roles_rls.sql`, scoped by `app_staff_sees_partner()`. Nothing was
  pasted into Supabase for this feature and nothing needs to be.
- **"Every partner" falls out of the market rule, not out of a new grant.** An
  admin has `market = null`, so `app_covers_market()` is true for every firm. A
  KAM opening the same URL for a firm outside their market gets the same 404 the
  firm page already gives them. That is checked in `rlstest.js` group 15.
- **The workspace is still not there.** No `client`, `project`, `board`,
  `quote`, `procurement_item` or `finance_entry` is read, so there is nothing to
  show for a firm's own projects, prices or margins — with the flag on or off.
  The page says so in as many words where those modules would have been, rather
  than stopping silently, because an admin who reads the gap as a broken page
  goes looking for a bug that is actually the product working.

Three smaller decisions worth knowing:

- **It is not an impersonation.** The page renders under the staff member's own
  session; no token is swapped and no write action exists on it, so a bug here
  cannot post anything as the firm.
- **The numbers come from the partner's own functions** — `standing()`, `attributedSale()`,
  `pendingSale()`, `rewardStatus()` — never `partnerStanding()`. A support call
  is somebody reading a screen down the phone, and the figure the admin reads
  out has to be the figure the architect is looking at. Nothing from
  `lib/domain/tiering.ts` may be imported into that view for the same reason it
  may not be imported into the partner app: Power/Mid/Basic is how a KAM plans
  their week, not something to say to a firm.
- **History is filtered in the page, not by RLS.** Staff see internal
  `partner_activity` rows and partners do not, so the view drops them itself and
  says how many it dropped. The unfiltered history is one click away on the firm
  page.

## The four staff roles

| Role | Market | Does |
|---|---|---|
| `admin` | every market | Verifies orders and onboarding forms, issues logins, publishes portfolios, manages the team |
| `kam` | one market | Looks after firms once they are on the platform; works the reactivation list |
| `outreach` | one market | Works the list of firms who are not with us yet, and files the onboarding form |
| `inbound` | every market | Firms that came to us. Same pipeline as outreach today — see the open question below |

**One thing an admin can do that is worth naming.** Since `006_credentials.sql`
an admin can read back the password *this console issued* to any partner or
staff member, until that person changes it — from the firm's page, or by tapping
a name on Team. That is not a read of somebody's chosen password (nobody can do
that; Supabase keeps a hash) and it is not available to a KAM, to outreach, to
inbound, or to an admin's own signed-in session against the database. It ends
the moment the person changes their password, which every role can do from
Settings. `docs/auth.md` holds the trade and its bounds.

## Market segregation

`staff_user.market`, `partner.market`, `outreach_prospect.market` and
`partner_application.market` are free text validated against
`lib/domain/markets.ts` — Bangalore and Hyderabad today. **No CHECK constraint**,
deliberately, same as `project_area.area_type`: opening Chennai is a line in
that file and a deploy, not a migration somebody has to remember to paste.

Two rules, both in `app_covers_market()`:

- A staff member with **`market = null` covers every market.** That is the admin
  and the central team.
- A row with **`market = null` is visible to everyone on the team**, not to
  nobody. An unassigned firm that nobody can see is a firm nobody follows up.

A KAM additionally sees any firm they are personally the KAM for, whatever its
market — a reassignment across cities should not lose them the account.

## What a firm is not allowed to change about itself

`partner` has an UPDATE policy for the firm (so it can edit its own name and
studio profile) and one for admins. RLS cannot restrict an update to some
columns, so a `BEFORE UPDATE` trigger — `partner_guard_md_fields()` — refuses a
non-admin's change to `phone`, `market`, `kam_user_id`, `workspace_enabled`,
`md_client_id`, `onboarding_source`, `onboarded_by` and `internal_note`.

Without it, the policy a firm needs in order to rename itself would also let it
reassign its own KAM and switch its own modules on. Checked in group 12.

The trigger lets anything through when `auth.uid()` is null — the service role
and the SQL Editor. Every signed-in route into the table is a policy that is
`to authenticated` and needs a uid, so null there cannot be a partner.

## The project workspace is opt-in

`partner.workspace_enabled` defaults to **false**. Design boards, client quotes,
procurement and the project ledger are all built, and hidden until a firm asks
for them.

An architect who has just been handed a login by a supplier is not going to move
their client pricing into it on day one, and a sidebar full of modules they have
not asked for is what makes the whole thing look like a system to be managed.
`partnerNav()` drops those items, and `app/(app)/projects/**` and
`app/(app)/clients/**` each check the flag as well — a hidden nav item is still
a URL anyone can type.

An admin turns it on from the firm's page in the console.

## Bootstrapping the first admin

An auth user is made by GoTrue, not by an `INSERT`, so there is no way for SQL
alone to create the first staff login. The snippet is in
`supabase/migrations/README.md`: sign up through `/login` with a Material Depot
address, **do not fill in the firm form**, then link the row by hand. After that,
every other staff member is added from `/console/staff`.

`onboard_partner()` refuses to create a firm for a login that already has a
`staff_user` row, so a staff member who walks through the sign-up form by
accident gets told what they are rather than ending up as a one-person studio.
