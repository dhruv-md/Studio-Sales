/**
 * The programme's open decisions, as one file of defaults — PRD §17.
 *
 * Twenty decisions in that table are still open, and several of them gate money.
 * The build could not wait for all twenty, so each one below is a DEFAULT with
 * the PRD's own recommendation where it made one, gathered here rather than
 * scattered as literals through the code. Changing one is a one-line edit and a
 * deploy, and `docs/open-questions.md` records who owns each.
 *
 * The defaults that are visible to a partner are labelled as assumptions in the
 * UI. A partner who is told "the rate above ₹10 L is being confirmed" will ask;
 * a partner shown an invented rate will plan against it.
 */

/**
 * §17 decision 1 — go-live date. **ASSUMED.**
 *
 * §15 is unambiguous about the consequence: only orders placed ON OR AFTER this
 * date are eligible for attribution, slab computation and incentives, and no
 * historical order is backfilled. Earlier orders may still be shown in the
 * client journey, labelled Pre-programme, carrying zero reward value.
 *
 * 1 July 2026 is the start of the quarter in which the programme was specified,
 * which makes the first quarterly period a whole calendar quarter as §15 asks.
 * It is a placeholder for a date the Head of B2B owns. Changing it moves money:
 * every order before it stops counting.
 */
export const GO_LIVE = '2026-07-01'

/** §6.2 / §10.4 — an order is reward-eligible 7 days after DELIVERY, provided
 *  no escalation against it is open. Changed from 30 to 7 on instruction,
 *  2026-09-17 — `docs/rewards.md`. */
export const MATURATION_DAYS = 7

/**
 * §17 decision 3 — period assignment basis. **ASSUMED: order date.**
 * §10.4 recommends it; the alternative, invoice date, shifts month-end orders
 * into the next slab period and changes who reaches a milestone.
 */
export const PERIOD_BASIS: 'order_date' | 'invoice_date' | 'delivery_date' = 'order_date'

/** §2.3 / §17 decision 2 — no attributed order in this many days makes a firm
 *  Inactive. The PRD proposes 120; the console's older reactivation list used
 *  90 and is left alone, because it answers a different question (who should a
 *  KAM ring) from this one (is this firm's dashboard dormant). */
export const INACTIVE_AFTER_DAYS = 120

/** §17 decision 11 — attribution window length. **ASSUMED: 365 days from
 *  approval, renewed by any attributed order.** The PRD leaves it open and
 *  names "blocks attribution service" as the impact; a window of zero would
 *  silently stop crediting a firm, so the default is generous and visible. */
export const ATTRIBUTION_WINDOW_DAYS = 365

/** §9.2 — the referral SLA clock. */
export const REFERRAL_SLA_HOURS = 48

/** §9.4 — an unacknowledged escalation auto-escalates to Admin after this. */
export const ESCALATION_ACK_HOURS = 24

/** §17 decision 15 — partner cart additions. **Suggestions**, which is the
 *  PRD's own recommendation: a partner silently editing a customer's cart is
 *  the version nobody would defend to the customer. */
export const CART_ADDITIONS_ARE: 'suggestions' | 'direct' = 'suggestions'

/** §17 decision 12 — split credit between two partners. Not supported in v1;
 *  an admin reassigns whole attribution. `docs/referrals.md` already reports a
 *  two-firm phone match as `ambiguous` rather than guessing, which is the same
 *  rule seen from the sync's side. */
export const SPLIT_CREDIT = false

/** §17 decision 18 — does revenue shown to a partner include GST and freight?
 *  **ASSUMED: no**, matching §6.2's definition of Attributed Revenue as "net
 *  order value after cancellations and returns, excluding GST and delivery". */
export const REVENUE_EXCLUDES_GST_AND_FREIGHT = true
