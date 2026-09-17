/**
 * Attribution, maturation and the reward ledger — PRD §6.3, §10.4, §15.
 *
 * This is the file that decides what a partner gets paid, so every rule in it is
 * one the PRD states explicitly, and every uncertainty is carried out as a state
 * rather than resolved into a number.
 *
 * The chain, in order, because the order is load-bearing:
 *
 *   approved by an admin   →   on or after go-live   →   assigned to a period
 *        (§6.3.4)                   (§15)                     (§10.4)
 *        →   7 days past delivery with no open escalation      →   counted
 *                            (§6.2, §10.4)
 *
 * A figure is PROVISIONAL until every order in its period has matured (§10.4's
 * two-stage ledger), and `CLAUDE.md` house rule 4 applies throughout: nothing
 * here is stored. A stored reward total has two independent ways to go stale — a
 * new order and a corrected order value — and an architect who sees two figures
 * for their own money stops trusting all of them.
 */

import { ORDER_NOT_COUNTED, explain } from './reasons.ts'
import { GO_LIVE, MATURATION_DAYS } from './programme.ts'
import {
  addDays, dayOf, diffDays, monthKey, period, periodKeyOf, quarterKey, todayIST, trailingMonths,
  type Period, type PeriodKey, type PeriodKind,
} from './periods.ts'
import { cashbackFor, MONTHLY_SLABS, QUARTERLY_SLABS, positionIn, type Cashback, type Milestone, type Slab } from './slabs.ts'
import type { ReferralOrder } from './types'

/**
 * A referred order, plus the columns `005_studio.sql` adds.
 *
 * Every added field is OPTIONAL on purpose. `queries.ts` reads `select('*')`, so
 * on a deployment where 005 has not been pasted yet these arrive as `undefined`
 * rather than throwing — and `undefined` is handled as "we do not know",
 * everywhere, rather than as zero or false. That is the difference between a
 * dashboard that degrades and one that quietly understates somebody's cashback.
 */
export type LedgerOrder = ReferralOrder & {
  delivered_on?: string | null
  coupon_code?: string | null
  discount_availed?: number | null
  /**
   * An Appendix B code. Typed as `string` and not as the union, because this
   * value arrives from Postgres and — more to the point — from the CRM, which
   * can add a code without this repo being redeployed. `explain()` renders an
   * unrecognised one as a readable sentence rather than as nothing at all; an
   * order shown as not counted with no explanation is the dispute the codes
   * exist to prevent.
   */
  not_counted_reason?: string | null
  is_self?: boolean | null
  open_escalations?: number
}

// ------------------------------------------------------------ one order

export type Maturity =
  /** past delivery + 7 days, nothing open against it */
  | { state: 'matured'; on: string; daysLeft: 0 }
  /** delivered, still inside the 7 days */
  | { state: 'maturing'; on: string; daysLeft: number }
  /** an escalation is open — §10.5 blocks maturation until it closes */
  | { state: 'held'; on: string | null; daysLeft: number | null }
  /** not delivered yet, or Material Depot has not told us when it was */
  | { state: 'unknown'; on: null; daysLeft: null }

/**
 * When an order becomes reward-eligible.
 *
 * `unknown` is a first-class answer and it is the common one today: nothing in
 * the referral sync carries a delivery date yet (`docs/referrals.md`). Guessing
 * from `ordered_on` would date maturation from the wrong event and pay a month
 * early; guessing `matured` would pay for an order that could still be returned.
 * So it says it does not know, and the screen says "awaiting a delivery date
 * from us" rather than showing a countdown to a made-up day.
 */
export function maturity(o: LedgerOrder, today: string = todayIST()): Maturity {
  const delivered = dayOf(o.delivered_on)
  const on = delivered ? addDays(delivered, MATURATION_DAYS) : null

  if ((o.open_escalations ?? 0) > 0) {
    return { state: 'held', on, daysLeft: on ? Math.max(0, diffDays(today, on)) : null }
  }
  if (!on) return { state: 'unknown', on: null, daysLeft: null }
  if (today >= on) return { state: 'matured', on, daysLeft: 0 }
  return { state: 'maturing', on, daysLeft: diffDays(today, on) }
}

export type Standing =
  /** approved, on or after go-live, and matured — real money */
  | { state: 'counted'; reason: null }
  /** approved and in-programme, but not yet matured */
  | { state: 'accruing'; reason: 'NOT_MATURED' | 'OPEN_ESCALATION' | null }
  /** placed before the programme started (§15) */
  | { state: 'pre_programme'; reason: 'PRE_GO_LIVE' }
  /** still with a Material Depot admin */
  | { state: 'pending'; reason: null }
  /** an admin decided it does not count, with a code */
  | { state: 'excluded'; reason: string }

/**
 * What this one order is doing for the partner, right now.
 *
 * Go-live is checked BEFORE approval status on purpose. An order from May is not
 * "waiting on an admin" — it is out of the programme, permanently, and telling a
 * partner it is pending would set up exactly the month-one dispute §18 rates as
 * High likelihood and High impact: "partners expect pre-go-live business to
 * count".
 */
export function standing(o: LedgerOrder, today: string = todayIST(), goLive: string = GO_LIVE): Standing {
  const day = dayOf(o.ordered_on)
  if (day && day < goLive) return { state: 'pre_programme', reason: 'PRE_GO_LIVE' }
  if (o.not_counted_reason) return { state: 'excluded', reason: o.not_counted_reason }
  if (o.approval_status === 'rejected') return { state: 'excluded', reason: 'CLIENT_NOT_ATTRIBUTED' }
  if (o.approval_status !== 'approved') return { state: 'pending', reason: null }

  const m = maturity(o, today)
  if (m.state === 'matured') return { state: 'counted', reason: null }
  if (m.state === 'held') return { state: 'accruing', reason: 'OPEN_ESCALATION' }
  if (m.state === 'maturing') return { state: 'accruing', reason: 'NOT_MATURED' }
  return { state: 'accruing', reason: null }
}

export function standingSentence(s: Standing): string | null {
  return explain(ORDER_NOT_COUNTED, s.reason)
}

/**
 * Orders that are in the programme at all: approved, on or after go-live, not
 * excluded by an admin. Includes the ones still maturing — they are what makes a
 * period's figure provisional rather than absent.
 */
export function eligible(orders: LedgerOrder[], today = todayIST(), goLive = GO_LIVE): LedgerOrder[] {
  return orders.filter((o) => {
    const s = standing(o, today, goLive)
    return s.state === 'counted' || s.state === 'accruing'
  })
}

/** Orders shown in a journey but carrying no reward value — §15. */
export function preProgramme(orders: LedgerOrder[], goLive = GO_LIVE): LedgerOrder[] {
  return orders.filter((o) => standing(o, todayIST(), goLive).state === 'pre_programme')
}

const value = (o: LedgerOrder) => Number(o.order_value) || 0

// ---------------------------------------------------------------- a period

export type PeriodStanding = {
  period: Period
  orders: LedgerOrder[]
  /** every eligible order's value, matured or not — what the slab is set on */
  spend: number
  /** the matured subset. Equal to `spend` once the period is fully confirmed. */
  confirmedSpend: number
  /** eligible but not yet matured */
  provisionalSpend: number
  /** how many orders are still maturing */
  maturingCount: number
  /** no order in the period is still maturing — §10.4's CONFIRMED state */
  confirmed: boolean
  /** the period has closed on the calendar but orders are still maturing */
  closedButProvisional: boolean
  cashback: Cashback
  slab: Slab | null
  next: Slab | null
  /** rupees to the next slab; 0 at the top or when there is no next */
  gap: number
  milestone: Milestone | null
  /** under the entry threshold — earns nothing, and §10.2 says to say so */
  belowEntry: boolean
  /** past the top published band — §17 decision 4, rates not yet defined */
  aboveLadder: boolean
}

/**
 * One month or one quarter, rolled up.
 *
 * The slab is determined on the FULL eligible spend, not on the matured subset.
 * §10.4 says the slab is determined at period close on total attributed spend,
 * and then the two-stage ledger converts provisional entries to confirmed. Doing
 * it the other way — setting the slab on matured spend only — would drop a
 * partner a band for a fortnight and then silently promote them, which reads as
 * the dashboard changing its mind about money.
 */
export function periodStanding(
  orders: LedgerOrder[],
  key: PeriodKey,
  kind: PeriodKind,
  today: string = todayIST(),
  goLive: string = GO_LIVE,
): PeriodStanding {
  const p = period(key, kind)
  const mine = eligible(orders, today, goLive).filter((o) => {
    const day = dayOf(o.ordered_on)
    return day !== null && periodKeyOf(day, kind) === key
  })

  const spend = mine.reduce((s, o) => s + value(o), 0)
  const matured = mine.filter((o) => maturity(o, today).state === 'matured')
  const confirmedSpend = matured.reduce((s, o) => s + value(o), 0)
  const maturingCount = mine.length - matured.length

  const ladder = kind === 'month' ? MONTHLY_SLABS : QUARTERLY_SLABS
  const pos = positionIn(spend, ladder)
  const cashback = cashbackFor(spend, ladder, discountOn(mine))

  return {
    period: p,
    orders: mine,
    spend,
    confirmedSpend,
    provisionalSpend: spend - confirmedSpend,
    maturingCount,
    confirmed: mine.length > 0 && maturingCount === 0,
    closedButProvisional: today > p.to && maturingCount > 0,
    cashback,
    slab: pos.slab,
    next: pos.next,
    gap: pos.gap,
    milestone: pos.slab?.milestone ?? null,
    belowEntry: pos.kind === 'below',
    aboveLadder: pos.kind === 'above',
  }
}

/**
 * The store discount actually availed across a set of orders, and how many of
 * them could not tell us (§10.4's hard integration dependency).
 *
 * A `null` discount on an order is NOT a zero discount. Summing it as zero is
 * the silent approximation §18 rules out, and it would overstate net cashback
 * for every partner on the platform in the direction that costs Material Depot
 * money on settlement day.
 */
export function discountOn(orders: LedgerOrder[]): { availed: number; ordersMissing: number } {
  let availed = 0
  let ordersMissing = 0
  for (const o of orders) {
    const d = o.discount_availed
    if (d === null || d === undefined) ordersMissing++
    else availed += Number(d) || 0
  }
  return { availed, ordersMissing }
}

export const monthStanding = (orders: LedgerOrder[], key = monthKey(todayIST()), today = todayIST()) =>
  periodStanding(orders, key, 'month', today)

export const quarterStanding = (orders: LedgerOrder[], key = quarterKey(todayIST()), today = todayIST()) =>
  periodStanding(orders, key, 'quarter', today)

// ----------------------------------------------------------- the coin wall

/**
 * §10.5.3 — "Because coins are earned per month, show a calendar strip of the
 * trailing 12 months with the coin earned in each."
 *
 * This is the honest representation of a monthly programme, and §18's mitigation
 * for the risk that monthly resets demotivate a mid-sized partner: effort stays
 * visibly cumulative on the strip even though the slab resets on the 1st.
 */
export type CoinMonth = {
  period: Period
  spend: number
  milestone: Milestone | null
  slab: Slab | null
  confirmed: boolean
  /** the month has not finished yet */
  open: boolean
  /** entirely before go-live — the strip greys it rather than showing a zero */
  preProgramme: boolean
}

export function coinWall(
  orders: LedgerOrder[],
  today: string = todayIST(),
  months = 12,
  goLive: string = GO_LIVE,
): CoinMonth[] {
  const thisMonth = monthKey(today)
  return trailingMonths(thisMonth, months).map((p) => {
    const st = periodStanding(orders, p.key, 'month', today, goLive)
    return {
      period: p,
      spend: st.spend,
      milestone: st.milestone,
      slab: st.slab,
      confirmed: st.confirmed,
      open: p.to >= today,
      preProgramme: p.to < goLive,
    }
  })
}

// -------------------------------------------------------------- the ledger

/**
 * §10.5.4 — one row per accrual, with every figure that went into it.
 *
 * The PRD asks for the working, not the answer: order value, coupon and discount
 * availed, slab applied, cashback rate, gross cashback, store discount deducted,
 * net cashback, gift value, status, maturation date. A partner who can see the
 * arithmetic can check it, and one who can check it does not ring their KAM.
 */
export type LedgerStatus = 'provisional' | 'confirmed' | 'settled' | 'reversed' | 'excluded'

export type LedgerRow = {
  order: LedgerOrder
  clientName: string
  periodKey: PeriodKey
  periodLabel: string
  orderedOn: string | null
  value: number
  couponCode: string | null
  /** `null` means unknown, never zero — see `discountOn` */
  discountAvailed: number | null
  slab: Slab | null
  cashbackPct: number | null
  grossCashback: number | null
  netCashback: number | null
  giftValue: number
  maturity: Maturity
  standing: Standing
  status: LedgerStatus
  /** the partner-facing sentence when this row earns nothing */
  note: string | null
}

/**
 * Per-order ledger rows, newest first.
 *
 * Cashback is attributed to an order at the slab rate the order's PERIOD
 * reached, which is why this takes the whole order set and not one order: the
 * same ₹1,20,000 order earns 2% in a month where the firm did ₹1.5 L and 4% in a
 * month where they did ₹6 L. Computing it per order in isolation would be wrong
 * in a way that is very hard to spot on one row and obvious on a statement.
 */
export function ledgerRows(
  orders: LedgerOrder[],
  nameOf: (o: LedgerOrder) => string,
  today: string = todayIST(),
  goLive: string = GO_LIVE,
): LedgerRow[] {
  const byPeriod = new Map<PeriodKey, PeriodStanding>()
  const standingOf = (key: PeriodKey) => {
    let s = byPeriod.get(key)
    if (!s) {
      s = periodStanding(orders, key, 'month', today, goLive)
      byPeriod.set(key, s)
    }
    return s
  }

  return [...orders]
    .sort((a, b) => (dayOf(b.ordered_on) ?? '').localeCompare(dayOf(a.ordered_on) ?? ''))
    .map((o): LedgerRow => {
      const day = dayOf(o.ordered_on)
      const key = day ? monthKey(day) : monthKey(today)
      const st = standingOf(key)
      const stand = standing(o, today, goLive)
      const mat = maturity(o, today)
      const v = value(o)
      const inProgramme = stand.state === 'counted' || stand.state === 'accruing'
      const slab = inProgramme ? st.slab : null
      const rate = slab && !st.aboveLadder ? slab.cashbackPct : null
      const gross = rate === null ? null : Math.round(v * (rate / 100))
      const discount = o.discount_availed === null || o.discount_availed === undefined ? null : Number(o.discount_availed)

      return {
        order: o,
        clientName: nameOf(o),
        periodKey: key,
        periodLabel: period(key, 'month').label,
        orderedOn: day,
        value: v,
        couponCode: o.coupon_code ?? null,
        discountAvailed: discount,
        slab,
        cashbackPct: rate,
        grossCashback: gross,
        // Net is only stated when the discount on THIS order is known. The
        // period total handles the unknown case once, loudly; restating it per
        // row as a zero would put a wrong number in front of the partner.
        netCashback: gross === null || discount === null ? null : Math.max(0, gross - discount),
        // The gift is per PERIOD, not per order, so it is not divided across
        // rows — it is shown once against the period.
        giftValue: 0,
        maturity: mat,
        standing: stand,
        status:
          stand.state === 'counted' ? 'confirmed'
          : stand.state === 'accruing' ? 'provisional'
          : stand.state === 'pending' ? 'provisional'
          : 'excluded',
        note: standingSentence(stand),
      }
    })
}

// ------------------------------------------------- what the Overview needs

/**
 * §8.2.4's funnel: Referred → Visited store → Cart created → Ordered, with the
 * conversion percentage between each pair.
 *
 * Counted on CLIENTS, not on events. Twenty logged arrivals for one visit is a
 * documented property of Material Depot's field apps (`docs/referrals.md`), so a
 * funnel counting events would show more store visits than referrals and read as
 * broken. Each stage counts distinct referred clients who reached it.
 */
export type FunnelStage = { key: string; label: string; count: number; pctOfPrevious: number | null; pctOfTop: number }

export function funnel(stages: { key: string; label: string; count: number }[]): FunnelStage[] {
  const top = stages[0]?.count ?? 0
  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1].count
    return {
      ...s,
      pctOfPrevious: prev === null ? null : prev === 0 ? 0 : Math.round((s.count / prev) * 100),
      pctOfTop: top === 0 ? 0 : Math.round((s.count / top) * 100),
    }
  })
}
