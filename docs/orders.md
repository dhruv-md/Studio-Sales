# Order tracking

**Covers:** `components/partner/LiveOrders.tsx · app/(app)/orders/page.tsx`

## "Live" reuses `maturity()`, on purpose

The Overview's "Live orders" panel and the `/orders` page both define "not yet
delivered" the same way the reward ledger already does — `maturity(order).state
!== 'matured'` (`lib/domain/ledger.ts`). That is `unknown` (no delivery date
sent), `maturing` (delivered, inside the escalation window) or `held` (an
escalation is open). This is a second *view* onto that same fact, not a second
definition of it — inventing a parallel "is this order done" rule here would be
exactly the kind of drift `docs/referrals.md`'s house rules exist to prevent.

**Expect this to show most of the book.** `docs/referrals.md` and CLAUDE.md
both record that on production today `delivered_on` is null for every order —
the CRM producer that fills it in does not exist yet. So "live orders" is
honestly almost everything, not a bug in the filter.

## `/orders` is not a seventh sidebar tab

`components/shell/nav.ts` is deliberately six items. This page is a drill-down
on the same `referral_order` rows Clients already shows per client, reached
from the Overview panel's "Track all orders" link and nowhere else — the same
pattern as `/referrals?client=`, which also has no nav entry of its own.

Three filters — `?filter=live` (default), `delivered`, `all` — split on the
same `maturity()` call, nothing new.

## This is Material Depot's synced order status, not live procurement telemetry

The ask that prompted this page was live tracking "fetched from
procurement.materialdepot.com". That host **does not resolve at all** —
checked 2026-09-17, no DNS answer, not even a Cloudflare wall to hit — so it is
unlike `api.materialdepot.com` (`docs/catalogue.md`), which exists and is
merely blocked. Building a fetch against a host with no known contract, no
confirmed reachability from Vercel, and no auth scheme would be guessing at an
integration rather than building one.

What ships instead is what the app already has: `referral_order.status`
(Material Depot's own free-text order status, synced by `/api/sync/referrals`)
shown as a caption under a badge driven by the structured facts —
`approval_status` and `maturity()` — the app already trusts. `order.status` is
opaque text from a fourth system with no fixed vocabulary in this app (same
reasoning as `not_counted_reason` in `docs/referrals.md`), so it is never used
to pick the badge's colour or to decide "live" vs "delivered".

**Getting real live tracking in needs, from whoever owns that system:** the
actual hostname (internal-only? not yet launched? a typo for something else?),
its auth scheme, and its request/response shape — the same three things
`docs/catalogue.md` had to get for the product search API before that
integration could be attempted. Do not guess at any of them.
