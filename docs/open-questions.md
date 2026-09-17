# Decisions taken by default

Everything here was decided so the build could finish. Each one is a real
product call that someone may want to overrule — none of them is load-bearing
enough that changing it is expensive.

| # | Question | What was decided, and why |
|---|---|---|
| 1 | How do partners log in? | Email + password. Phone + OTP is the right answer and needs Material Depot's OTP endpoints allowlisted for this domain — `docs/auth.md`. `partner.phone` is the join key either way, so swapping later touches no other table. |
| 2 | Where does the architect's markup live? | On the quote (`markup_pct`), overridable per line. The alternative — a markup per product category — is more expressive and much more to maintain. |
| 3 | Does the client see the Material Depot rate? | No. The PDF shows the marked-up figure only. |
| 4 | Is the project P&L derived from the quote? | No — hand-entered ledger. Quoted and paid are different facts; `docs/finance.md`. |
| 5 | Can two partners refer the same client? | The schema allows it (`UNIQUE (partner_id, md_phone)`, not global) and the sync refuses to attribute that client's orders to either — reported as `ambiguous`. Deciding whose it is needs a human. |
| 6 | Do rewards ever expire or reset annually? | **Superseded.** The PRD v1.1 §10 programme runs on calendar months and quarters and resets with them. `reward_tier` stays as the physical-handover record only — `docs/rewards.md`. |
| 7 | Does dropping below a threshold revoke a tier? | No. `reward_claim` rows are never deleted. |
| 8 | Who confirms a reward was handed over? | Material Depot, not the partner. `reward_claim` has no partner write policy — the UI says "your Material Depot contact will arrange the handover". |
| 9 | Can a partner add colleagues? | Not self-serve. `partner_user` has no insert policy; `onboard_partner()` refuses a second firm on the same phone and says to ask Material Depot. |
| 10 | Wastage default | 0%, set per item. A silent default of 5–10% would inflate quotes in a way nobody asked for. |
| 11 | Do partners get the project workspace on day one? | **No.** `partner.workspace_enabled` defaults to false and an admin turns it on per firm. The brief was explicit that designers are wary of moving their workflow into a supplier's portal, and a nav full of modules nobody asked for is what makes that worse. Nothing is deleted — `docs/roles.md`. |
| 12 | Does a referred order count as soon as it syncs? | **No.** It arrives `pending`, an admin verifies it, and then it still has to be 7 days past delivery with no open escalation — `standing()` in `lib/domain/ledger.ts`. |
| 13 | Who verifies an order — anyone on the B2B team, or only an admin? | Only an admin, enforced inside Postgres by `review_referral_order()`. A KAM verifying their own firms' orders is the one person with a reason not to look hard. |
| 14 | How are credentials delivered? | Generated on approval and **shown once** to the admin, who sends them. There is no mail transport on this deployment; `auth.admin.inviteUserByEmail()` is the swap once Supabase SMTP is configured — `docs/onboarding.md`. |
| 15 | How long before a firm "needs reactivating"? | 90 days with no verified order — `DORMANT_AFTER_DAYS`. The brief said three months. "Never ordered" is kept as a separate third state, not folded into dormant. |
| 16 | What does the inbound manager's flow look like? | **Unanswered.** Inbound currently gets the same prospect pipeline as outreach, with no market restriction. The brief named the role and not the flow, so this is a placeholder that works rather than a design. |
| 17 | Can one firm have several logins? | Still not self-serve — `partner_user` has no insert policy. An admin can now issue a *replacement* password from the console, which covers the case that actually came up (a firm that cannot get in), but not a second seat. |
| 18 | Is a referred client's cart still open? | **Derived, and conservatively.** Nothing in the sync says. The newest `cart_add` counts as converted once an `order_placed` event or a dated `referral_order` row lands at or after it; otherwise it reads as open. A producer can overrule it outright with `payload.cart_status`. Erring towards "open" is deliberate — a wrongly-open cart costs an awkward phone call, a wrongly-closed one costs the sale nobody chased. `docs/referrals.md`. |

## PRD v1.1 §17 — the twenty open decisions, and what was assumed

§17 lists twenty decisions still open, several of which gate money. The build
could not wait for all twenty. Every default is in **one file**,
`lib/domain/programme.ts`, so changing one is a one-line edit and a deploy rather
than a search. Anything a partner can see is labelled as an assumption on screen:
a partner told "the rate above ₹10 L is being confirmed" will ask; one shown an
invented rate will plan against it.

| § | Decision | Owner | Default here |
|---|---|---|---|
| 1 | Go-live date, and the partial first month | Head of B2B | **`GO_LIVE = 2026-07-01`.** Start of the quarter the PRD was written in, which makes the first quarterly period a whole calendar quarter as §15 asks. **Changing this moves money** — every order before it stops counting. |
| 2 | Active/Inactive threshold | Head of B2B | 120 days (`INACTIVE_AFTER_DAYS`), the PRD's own proposal. The console's older 90-day reactivation list is left alone: it answers a different question (who should a KAM ring). |
| 3 | Period basis: order vs invoice vs delivery date | Head of B2B + Finance | **Order date**, §10.4's recommendation. Invoice date would shift month-end orders into the next slab and change who reaches a milestone. |
| 4 | Monthly slabs above ₹10,00,000 | Business | **Nothing is applied.** `positionIn()` returns `above` and the screen says the rate is being confirmed. Applying the top slab's rate invents a payout; paying its ceiling short-changes the best partner on the platform. |
| 5 | Cashback on actual spend, or capped at the slab top | Business + Finance | **Rate on actual**, §10.4's stated assumption. Inside a band the two cannot differ; only the §17 d.4 case above exposes it, and that case refuses to compute. |
| 6 | Store-discount deduction: actual or slab maximum | Business + Finance | **Actual availed**, per §10.4's wording. See §9 below for what happens when it is not sent. |
| 7 | Settlement instrument | Finance | Not built. `LedgerStatus` already carries `settled`, so adding a settlement view is a screen and not a schema change. |
| 8 | Gift catalogue and trip eligibility terms | Business + Marketing | Not built. The terms page says gifts are arranged by Material Depot and the dashboard tracks status. |
| 9 | Is per-order coupon data available from commerce today? | Engineering | **Assumed no, and handled.** `discount_availed` is nullable, null means unknown, and the net cashback figure is **withheld** with the reason on screen. §18's fallback is gross cashback with the gap stated, never a silent approximation. |
| 10 | TDS 194R and GST on cashback and gifts | Finance + Legal | Not computed. The terms page states the exposure; the ledger has room for gross/TDS/net when finance decides. |
| 11 | Attribution window length | Head of B2B | 365 days (`ATTRIBUTION_WINDOW_DAYS`), and `referral.attribution_expires_on` is nullable — a referral approved before this is settled gets an open-ended window rather than a silently closed one. |
| 12 | Split credit between two partners | Head of B2B | **Not supported** (`SPLIT_CREDIT = false`), matching the PRD. The sync already reports a two-firm phone match as `ambiguous` rather than guessing. |
| 13 | Pre-existing customers claimed at cutover | Head of B2B + Legal | Reason code `EXISTING_CUSTOMER` exists and an admin decides per referral. No automatic rule. |
| 14 | End-client consent mechanism and copy | Legal | **Decided, 2026-09-17: no gate.** Every order already carries the client's consent to be shared with the referring firm, so the aggregate-only view and its copy were removed rather than rewritten — `docs/referrals.md`. |
| 15 | Are partner cart additions suggestions or direct writes? | Head of B2B | **Suggestions** (`CART_ADDITIONS_ARE`), the PRD's recommendation. Not built yet either way. |
| 16 | Palette SKU-mapping coverage | Palette team | Out of scope here. |
| 17 | Portfolio editorial standards | Marketing | Appendix B's portfolio codes are wired into the console's reject flow. |
| 18 | Does partner-visible revenue include GST and freight? | Finance | **No** (`REVENUE_EXCLUDES_GST_AND_FREIGHT`), matching §6.2's definition of Attributed Revenue. Nothing in the sync distinguishes them today, so this is a label on an assumption rather than an implemented split. |
| 19 | Store-side footfall capture reliability | Retail Ops | Out of scope here, and still the biggest risk to this product — `docs/referrals.md` has why the journey view is empty without it. |
| 20 | KAM capacity caps and territories | Head of B2B | Not built. §2.5's Phase-1 requirement that pincode be **captured** is done (`partner.pincode`), which is what makes Phase 2 config rather than a rebuild. |

## Known gaps, named rather than faked

- **The catalogue is unreachable** from this deployment. Verified live: the
  outer wall is Cloudflare bot protection on `api.materialdepot.com` rejecting
  datacentre egress, with Django's CSRF check behind it. Two owners, two fixes,
  in that order — `docs/catalogue.md`. The product picker says which wall it hit
  and offers manual entry.
- **Referral data has no producer yet — but one is now designed.**
  `/api/sync/referrals` is the contract and it works; nothing is pushing to it,
  so the referral timeline is empty and says so. The producer belongs in the
  CRM, not here: `materialdepot-crm` `docs/b2b/partner-bridge.md` (2026-09-14)
  holds the push contract, the exact-phone matching rule, and the one endpoint
  this app still owes — `POST /api/sync/partners`, plus migration `003` adding
  `partner.md_client_id unique` so a CRM client row and a partner row are
  linked rather than name-matched. That design also records why **this app must
  never call Django** for it. The CRM holds 26 architect/interior-design firms
  with valid phones that could be provisioned today; this project holds one, the
  demo seed.
- **Palette boards are linked, not embedded.** "Visualise in Palette" opens
  palette in a new tab with the right scene. Saving a rendered scene back onto a
  board (palette has `/api/upload` and a Save button) would need palette to
  round-trip a board id.
- **No client-facing view.** An architect can export the quote PDF; there is no
  link a client can open to approve a board themselves. That is the obvious next
  module and needs a share-token table.
- **Nothing renders the published portfolios.** This app holds the submissions
  and the review state. Whatever builds the partners page on materialdepot.com
  reads `portfolio_item where status = 'published'`; that consumer does not exist
  yet — `docs/portfolio.md`.
- **Nothing sends a notification, and the settings tab for it is gone.**
  §13.4's preferences would have been stored and honoured by nobody, because
  there is no mail or WhatsApp transport on this deployment — so on
  instruction, 2026-09-17, the Notifications tab and its read/write code were
  removed rather than left as a promise the product was not keeping.
  `notification_pref` stays in the schema for whenever a sender exists —
  `docs/settings.md`.
- **The staff side of escalations is one screen short.**
  `set_escalation_status()` exists, is tested, and refuses a partner and an
  out-of-market KAM. No console page calls it — today a KAM moves a ticket from
  the SQL editor. `docs/escalations.md`.
- **No analytics vendor is connected.** The wrapper, the taxonomy and the QA
  queue are built; no Mixpanel token and no Clarity id are set, so `track()`
  queues to `window.__mdEvents` and nothing leaves the browser. Deliberate —
  `docs/analytics.md`.
- **No email, anywhere.** Credentials are shown once to an admin to send by hand,
  and nothing notifies a partner when an order is verified or a project is
  published — they see it in their account history next time they look. Both are
  named in the UI rather than faked.
- **The CRM does not know about any of this yet.** `partner.md_client_id` exists
  and is unique, ready for the bridge in `materialdepot-crm`
  `docs/b2b/partner-bridge.md`, and nothing sets it. The 26 architect and
  interior-design firms the CRM already holds still have to be onboarded through
  the form by hand.
- **No image upload.** `board.cover_url` and `board_item.image_url` accept URLs;
  nothing uploads to Supabase Storage yet, so covers only appear for catalogue
  products.
