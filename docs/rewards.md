# Rewards

**Covers:** `lib/domain/slabs.ts · lib/domain/ledger.ts · lib/domain/programme.ts ·
components/rewards/** · app/(app)/rewards · referral_order`

## Two ladders, and which one is the programme

There are two things in this repo called rewards and they are not the same thing.

| | What it is | Where it lives |
|---|---|---|
| **The slab programme** | The incentive structure a partner is actually on — PRD v1.1 §10. Monthly cashback + gift, quarterly experience. | `lib/domain/slabs.ts`, computed at read time from `referral_order` |
| **`reward_tier` / `reward_claim`** | The record of coins Material Depot has physically **handed over**, and where each handover got to. | Postgres, written by `lib/data/unlock.ts` and the console |

Before 2026-09-16 the first of those did not exist and the second was presented
to partners as the programme: one lifetime, cumulative, six-rung ladder. The
approved structure is not a simplification of that, it is a different promise —
periods that reset, a rate on actual spend, a fixed gift, a maturation window —
so the partner-facing module was replaced rather than relabelled. The tables
stay because the handover workflow is real.

## The slab tables

Monthly (§10.2), five bands from ₹50,001 to ₹10,00,000. Quarterly (§10.3), three
bands from ₹25,00,001, the top one open-ended.

**Only the percentages are stored.** `floor`, `ceiling`, four rates and the
milestone. Every rupee figure the PRD prints — retail max, store max, cashback
max, net cashback, gift value, max total advantage — is derived, and
`test/domain.test.ts` asserts the derivation reproduces all forty published
figures. The published table is internally consistent to the rupee; encoding the
rupees too would give them two places to disagree.

### Why this is source and not a `reward_slab` table

`reward_tier` is config in Postgres because it is one number per row. A slab is
eight numbers, a milestone and a version, and §10.5.6 requires that a partner
sees *the version that applied to their accrual period*. A mutable config row
cannot answer "what was the rate in August" after somebody edits it. Changing
the ladder is a commit, which is the audit trail the money needs.

## The rules that cost money if they are missed

**Gift value is fixed per slab, cashback is a rate on actual spend.** ₹2,10,000
and ₹4,90,000 in a month earn the same ₹5,000 gift and different cashback. The
rupee figures in the PRD's cashback column are ceilings at the top of the band.

**Net cashback floors at zero.** `gross − store discount availed`, never
negative.

**A missing discount is not a zero discount.** §10.4 makes per-order coupon
capture a hard Phase 1 dependency; §18 says the fallback is gross cashback with
the gap stated, "never a silent approximation". So `discount_availed` is
NULLABLE, null means UNKNOWN, and `discountOn()` counts the orders that did not
send it instead of summing them as nothing. When any order in a period is
missing it, the **net figure is withheld** and the screen says why. Treating
those as ₹0 would overstate every partner's net cashback on the platform.

**Maturation is 7 days from DELIVERY.** Not from the order. Changed from 30 days on instruction, 2026-09-17. `delivered_on` null
means `unknown`, and `maturity()` says so rather than counting from `ordered_on`
— which would pay a month early. An open escalation against an order holds it in
`held` however old the delivery is.

**Only orders on or after `GO_LIVE` count.** `lib/domain/programme.ts`. Earlier
ones are `pre_programme`: shown in the client's timeline, labelled, worth
nothing. Go-live is checked **before** approval status, so a May order is never
described to a partner as "waiting on an admin".

**Above ₹10,00,000 a month, no rate is applied.** §17 decision 4 is open.
`positionIn()` returns `above` and `cashbackFor()` refuses to compute. Applying
the top slab's rate would be inventing a payout; paying its ceiling figure would
short-change the best partner on the platform. The screen says the rate is being
confirmed.

**The slab is set on full eligible spend, not on the matured subset.** §10.4
determines the slab at period close on total attributed spend and then converts
provisional entries to confirmed. Setting it on matured spend only would drop a
partner a band for a fortnight and silently promote them later, which reads as
the dashboard changing its mind about money.

**An order is priced at its PERIOD's rate.** The same ₹1,20,000 order earns 2% in
a ₹1.5 L month and 4% in a ₹6 L one. `ledgerRows()` takes the whole order set for
exactly this reason.

## The screens

`?tab=` on `/rewards`, five of them, per the §7 IA plus the client-facing
revamp's comparison tab.

- **This month / This quarter** — `SlabProgress`. Spend, slab, the whole ladder
  with every band marked, the gap in rupees *and what it buys*, days left, and
  the breakdown that shows the formula rather than hiding it.
- **Statement** — `RewardLedger`. Thirteen columns, per §10.5.4. The instinct is
  to cut it to five and it is the wrong instinct: what makes a partner ring
  their KAM is not a big number or a small one, it is a number with no working
  shown.
- **Compare** — `RewardCompare`. A calculator ("if you did this much business
  with us, this is what it pays") plus both ladders laid out for direct
  comparison. Driven through the same `positionIn()` / `cashbackFor()` the
  real tabs use, on a typed hypothetical spend rather than the firm's actual
  one — presentation only, nothing here writes anything.
- **Programme terms** — versioned prose, `PROGRAMME_VERSION`.
- **Coin wall** — `CoinWall`, on the month tab. Twelve squares, one per month.
  §10.5.3 asks for this instead of a lifetime badge, and the honesty is the
  point: a lifetime badge on a monthly programme implies a ladder that only goes
  up, and the first ₹40,000 month a partner would find a badge they thought they
  owned quietly gone.

## Failure that must not read as zero

Escalations are read on the Rewards and Clients pages to hold maturation. **If
that read fails it is reported, not counted as "nothing open"** — treating an
unreadable escalation table as no escalations matures an order that should be
held, which is money out of the door on a query error.
