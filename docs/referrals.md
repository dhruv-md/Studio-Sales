# Referrals

**Covers:** `components/referrals/** · app/api/sync/referrals/route.ts · referral ·
referral_event · referral_order · lib/domain/privacy.ts · lib/domain/reasons.ts`

## The screen: one row per client, the log behind the name

The partner's home page opens with the **list of clients they referred** — not a
merged stream of every event from all of them. The stream was the first cut and
it was the wrong unit. Four clients' visits, views and orders interleaved
newest-first is the shape a log file has; the question an architect actually has
is per person, and the answer to "how is the Rao job going" was scattered down
six rows of somebody else's activity.

So: `ClientActivity` renders the list (name, where and when they were last seen,
what is in their cart, what has counted) and swaps to that one client's timeline
when a name is tapped. `/referrals?client=<referral id>` opens the same client on
the full record page, which is what the list links to.

Inside, each event is **a chip and a value**, not a sentence: the store for a
visit, the product for a view, the size and value of a cart, the enquiry id for
an order. The prose — `title`, `detail`, the whole free-form `payload` — is one
tap away on the row somebody cares about. That is `ReferralFeed`, and it is the
same component on the client page and in the console mirror.

### The cart is the point of the screen

A referred client with things in a cart and no order is the one row worth acting
on today, so it is a chip on the list and the first panel inside — item count,
what is in it, and what it is worth.

`referral_event` has no cart state. It is an append-only log, so "is this cart
still open" is **derived**, in `cartState()` (`lib/domain/referrals.ts`):

- The newest `cart_add` is the cart. Older ones are history.
- It is closed by an `order_placed` **event** at or after it (compared as
  instants — `+05:30` and `+00:00` both arrive, and string ordering would put a
  cart after the order that closed it), or by a `referral_order` **row** whose
  `ordered_on` falls on the cart's day or later. Both signals are read because
  the sync takes `events` and `orders` as independent arrays: a producer that
  pushes only the order row would otherwise leave a bought-out cart looking open
  for ever, and the architect would ring a client who had already bought.
  `ordered_on` is a date, so that half of the rule is day-granular, and it counts
  a `pending` order — approval decides who gets paid, not whether the client
  bought.
- A producer that knows better can say so: `payload.cart_status` of `open` or
  `ordered` wins outright.

Open, ordered and *never had a cart* are three states, not two. The UI says which
one it is looking at ("Still open", "Ordered", "Nothing in a cart") rather than
asserting "active cart" as something Material Depot told us.

### The cart payload, for whoever builds the producer

`payload` on a `cart_add` is free-form and two shapes are read:

```jsonc
"payload": { "items": 3 }                        // just a count
"payload": { "items": [                          // itemised — prefer this
  { "name": "Engineered Oak Plank 14mm", "sku": "WF 4402",
    "qty": 420, "unit": "sqft", "rate": 142 }
], "cart_status": "open" }
```

`event.amount` is the cart's value. With an itemised list the panel shows the
lines; with a count it falls back to `detail` as prose. An item the payload does
not name is still counted — dropping it would understate a cart the architect is
about to ring their client about.

## What this promises the architect

> Client X visited the Whitefield store on 9 September at 1pm. Here is what they
> looked at, what is in their cart, and what they ordered.

That data does not live in this app's database. It lives across **three other
systems**, none of them reachable from a partner's browser:

| System | Holds |
|---|---|
| Django `api.materialdepot.com/apiV1`, `/crm/leads/` | the authoritative cart, quote and order state |
| Kylas | the CRM's fourth backend; lead and appointment records |
| The field-ops Supabase (`jqrdfnjfxqxrazfkaofm`) | store visits and site activity logged by staff apps |

## So the sync is a push, and it is the contract

`POST /api/sync/referrals`, authenticated with `x-sync-key: $SYNC_SHARED_SECRET`,
using the service-role key to write tables partners can only read.

```jsonc
{
  "events": [{
    "phone": "9876543210",          // 10 digits; the ONLY join key
    "external_id": "visit:88421",   // unique; the dedupe key
    "event_type": "store_visit",    // store_visit | product_view | cart_add |
                                    //  quote_shared | order_placed | call | other
    "occurred_at": "2026-09-09T13:00:00+05:30",
    "store": "Whitefield",
    "title": "Walk-in",
    "detail": "Looked at large-format marble",
    "amount": null,
    "payload": {}
  }],
  "orders": [{
    "phone": "9876543210",
    "md_enq_id": "ENQ2026090912345",  // unique; makes the total idempotent
    "order_value": 184500,
    "ordered_on": "2026-09-09",       // decides the slab PERIOD
    "store": "Whitefield",
    "status": "Order Placed",

    // 005_studio.sql. Everything below is what the incentive programme needs
    // and cannot compute without — PRD §10.4 calls the coupon pair a hard
    // Phase 1 dependency, not a Phase 2 nicety.
    "delivered_on": "2026-09-20",     // the 7-day maturation counts from HERE
    "coupon_code": "MDPRO2",
    "discount_availed": 3690          // rupees ACTUALLY taken off at the till
  }]
}
```

**Omit `discount_availed` rather than sending 0.** An absent key means "we do not
know" and the dashboard withholds the net cashback figure and says why; a literal
`0` is a claim that the client took no discount, and sending it wrongly
overstates every affected partner's net cashback. `defined()` already drops
absent keys, so omitting is also what leaves an existing value alone on a
re-sync. Same for `delivered_on`: absent means the maturation clock has not
started, and guessing it from `ordered_on` would pay a month early.

### Two properties this route must never lose

**1. Idempotent.** Every write is an upsert on `external_id` / `md_enq_id`, both
`UNIQUE`. Material Depot's field apps log one real event several times — a single
store arrival has been seen logged twenty times — and "visited 20 times on the
9th" is a number an architect would read and believe.

**2. A partial payload must not erase what is already there.** Rows are built
by `defined()`, which drops keys the caller did not send, so an upsert carrying
only `md_enq_id` and `order_value` leaves the store and the date alone. Writing
`store: o.store ?? null` instead looks harmless and is not: it blanks the
column on every re-sync. Found against production on 2026-09-11 by re-posting a
seeded order, which promptly lost its store and `ordered_on`. An explicit
`null` is still honoured — that is how a caller says "clear this".

**3. Exact phone matching, three outcomes.** A row matches one referral, matches
none, or matches **more than one** (two architects both claiming the same
client). The third is reported as `ambiguous` and skipped, never resolved by a
heuristic: attributing an order to the wrong architect pays the wrong person.

Every skip comes back in the response, with a reason
(`no_match` / `ambiguous` / `bad_phone` / `bad_row`). A sync that quietly dropped
forty orders because nobody had referred those phones is the failure that
reporting exists to prevent.

### An order arrives PENDING and counts towards nothing

`referral_order.approval_status` defaults to `pending`. A Material Depot admin
verifies each one in `/console/approvals`, and only an `approved` order enters
the incentive programme — `standing()` in `lib/domain/ledger.ts` is where that is
decided, alongside the go-live cutoff and the 7-day maturation window.
`docs/rewards.md` has the whole chain.

A decline now needs an Appendix B **reason code**; `review_referral_order()`
raises without one.

Money is handed over on the strength of that number, so it gets a human. An order
attributed to the wrong architect, or a duplicate, would otherwise have already
bought somebody a gold coin by the time anyone noticed — and a `reward_claim` row,
once written, is never deleted.

The upsert here deliberately does **not** carry `approval_status`. An absent
column is left alone on an existing row, so a nightly re-sync can neither reset a
decision an admin has already made nor grant one. Asserted in
`supabase/test/rlstest.js` group 14, both directions.

`referral_order` has no UPDATE policy for anybody, admins included. The only
thing that moves the column is `review_referral_order()`, a SECURITY DEFINER
function that re-checks `app_is_admin()` itself — so a mistake in app-layer role
checking is not enough to approve a payout. Group 10 checks that a partner and a
KAM are both refused.

The partner sees the pending order, labelled "Being checked", with its value
shown but greyed and excluded from the total. A figure that quietly omits their
newest order with no explanation is one they assume is wrong.

### It also records tier unlocks

> `reward_tier` / `reward_claim` are the record of coins Material Depot has
> physically handed over. They are **not** the incentive programme — that is the
> monthly and quarterly slab ladder in `lib/domain/slabs.ts`, derived from these
> same orders at read time. `docs/rewards.md` has the split.


`recordUnlockedTiers()` (`lib/data/unlock.ts`, shared with the console) recomputes
each touched partner's **approved** total and inserts a `reward_claim` row for
each threshold crossed. It never deletes a claim — a corrected order value that
drops a partner back below a threshold does not un-give a gold coin.

Because orders now arrive pending, a sync normally crosses nothing and
`tiers_unlocked` comes back empty. It is still called: a re-sync that corrects an
already-approved order's value upward can cross a tier. The real caller is now
`reviewOrder()` in `lib/data/console-actions.ts`, which runs it the moment an
admin approves.

**`tiers_unlocked` in the response means "crossed by THIS sync", not "earned".**
That distinction cost a bug: the first version upserted with `ignoreDuplicates`
and reported everything *due*, so a nightly run announced all six tiers every
night. Anything hung off this field — an email, a push notification — would have
congratulated the partner daily for a coin they got in July. The route now reads
the existing claims first and reports only the difference. Verified against
production on 2026-09-11: re-posting a seeded order returns `tiers_unlocked: []`
and leaves the attributed total unchanged.

## What a partner is allowed to see — PRD §14.5

A partner sees an end customer's store visits, cart contents and order values.
That is legitimate, it is somebody else's personal data, and India's DPDP Act
applies.

**The consent gate is gone, on instruction.** §14.5 originally read "no
confirmed consent → aggregate only": visited yes/no, ordered yes/no, an order
value band, nothing itemised, until Material Depot had separately confirmed
with the client that their activity could be shared. Removed 2026-09-17 —
every order on this platform already carries the client's consent to be
shared with the firm that referred them, so the gate had nothing left to
withhold and just read as Material Depot stalling on a firm's own client. The
client detail page now always shows the full timeline, cart and order
figures. `consent_given` / `consent_claimed_at` stay on `referral` as
historical columns — a trigger still refuses a firm's own write to
`consent_given` — but nothing in the app reads either one any more.

**Phone numbers are masked, and a reveal is logged.** `98XXXXXX10`, first two
and last two. `revealPhone()` writes the `phone_reveal` row **and then** returns
the number — it is not sitting in the DOM behind a CSS blur. A firm can write to
that log and cannot read it back: an audit record the audited party can read
before deciding how to behave is not one.

Searching the list by phone works on the full number even though the display is
masked. An architect typing a number they already have is not a privacy event,
and making them reveal first to find someone would be security theatre.

## The referral form — client-facing revamp

Rewritten for the studio revamp. It is now a pure **new**-referral form —
picking from an existing client (the old "one of your clients" selector) used
to pull from the opt-in workspace's own client list, a different concept that
just confused the two, so it is gone. Fields: client name, mobile number,
city, EC expected to visit + date + time, project type (residential /
commercial / something else, with a free-text describe), categories
interested in (`lib/domain/categories.ts` — Tiles, Laminates, Wooden
flooring, Wallpaper, Wall panels, Plywood, Quartz, Bathroom accessories,
Hardware), description of requirements, additional notes.

The duplicate check still runs **before** submit, on blur of the phone field,
with the same four outcomes: `free`, `yours`, `taken`, `unknown`. The fourth is
what makes it honest — if the lookup fails, the form says the check could not
run and lets the partner submit. A check that silently reports "clear" when it
did not run is worse than no check, because it is a promise.

`taken` never says *who* holds the number. That is another firm's client list,
which is why `referral_phone_taken()` in `005_studio.sql` answers exactly one
bit.

**The consent checkbox is gone, on instruction** — it read as "a stupid
performative thing" rather than a real ask, and the new field list has no room
for it either. `consent_claimed_at` is simply never written by this form now;
`consent_given` (Material Depot confirming with the client directly) was
never the partner's to set anyway, so nothing about §14.5's aggregate-vs-
itemised view changed — a referral just starts in the same "not asked" state
every referral used to start in before this form existed. If a written consent
capture is wanted again later, it is a field on this form and nothing else.

## The first visit is part of the referral, not a separate step

`createReferral()` creates the referral **and** its first `visit_request` row
(007_studio_v2.sql) in one call — a referral with no visit scheduled is not
what the form promised. If the visit insert fails, the referral is rolled back
rather than left as a client record nobody asked to see.

**Scheduling another visit** (`ScheduleVisitForm`, reached from a client's own
page) re-asks nothing about who the client is — only EC expected, date, time,
categories for that visit, and requirements. `scheduleVisit()` in
`lib/data/actions.ts`.

`visit_request.status` and the `assigned_bm_*` columns are Material Depot's
side: a KAM coordinates with the store and names a BM once one is assigned,
and `visit_request_guard_md_fields()` freezes those columns against a
partner's own write the same way `referral_guard_md_fields()` does for a
referral's decision fields — any staff role may set them, not only an admin,
because assigning a BM is a KAM's day-to-day job. `VisitLog` renders every
visit against a client, and the BM's name/phone/email/photo once assigned.

## More than one phone number per client

A client does not always order through the number they were referred on —
sometimes it is their partner's own number, sometimes one that was never
mentioned at all. `referral_phone` (007_studio_v2.sql) holds every number
linked to a referral, seeded with the original `md_phone` as a `'client'` row;
`NumbersPanel` lets a firm add more (`'partner'` or `'additional'`) and remove
ones it added, but never the original.

`POST /api/sync/referrals`'s phone resolution reads both sources — a hit on
`referral.md_phone` OR on any `referral_phone` row counts, deduplicated by
referral id so a phone matching a referral on both is one match, not two. The
`ambiguous` rule is unchanged: two DIFFERENT referrals both claiming a phone,
across either source, is still reported and skipped rather than guessed.

## Reason codes — PRD Appendix B

A rejection with no code is what §18 names as the cause of attribution disputes;
"visible reason codes" is the stated mitigation. So:

- The codes are CHECK constraints on `referral.rejection_reason` and
  `referral_order.not_counted_reason`, not free text.
- `review_referral()` and `review_referral_order()` **raise** if a decline
  arrives without one.
- `lib/domain/reasons.ts` holds one partner-facing sentence per code. Writing
  that sentence at the call site is how six different phrasings of
  ALREADY_ATTRIBUTED end up in the product and two firms comparing notes find
  both.
- `explain()` renders an unrecognised code as a readable sentence rather than as
  nothing. The CRM can add a code without this repo being redeployed, and an
  order shown as not counted with no explanation is the dispute the codes exist
  to prevent.

## The referral record

`referral.md_phone` is `NOT NULL` with a ten-digit CHECK, and
`createReferral()` refuses a number it cannot parse rather than storing `null`.
A referral with a wrong number is a referral whose orders will never be
credited, and it would sit there looking perfectly fine.

`UNIQUE (partner_id, md_phone)` means the same partner cannot double-refer one
client; the action turns that constraint violation into a readable message.

On a client's own page, the referral is matched by `client_id` first and exact
`phone` second — **never by name**. Two clients called Sharma are not one
person, and showing one client another's store visits would be worse than
showing nothing.
