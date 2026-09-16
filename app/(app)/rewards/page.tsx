import Link from 'next/link'
import { listEscalations, listReferralOrders, listReferrals } from '@/lib/data/queries'
import {
  coinWall, ledgerRows, monthStanding, quarterStanding, type LedgerOrder,
} from '@/lib/domain/ledger'
import { GO_LIVE } from '@/lib/domain/programme'
import { PROGRAMME_VERSION } from '@/lib/domain/slabs'
import { monthKey, quarterKey, todayIST } from '@/lib/domain/periods'
import { SlabProgress } from '@/components/rewards/SlabProgress'
import { CoinWall } from '@/components/rewards/CoinWall'
import { ProgrammeTerms, RewardLedger } from '@/components/rewards/RewardLedger'
import { RewardCompare } from '@/components/rewards/RewardCompare'
import { PageHead } from '@/components/shell/PageHead'
import { Card, Problem, Stat } from '@/components/ui'
import { inr, inrShort } from '@/lib/format'

/**
 * Rewards — PRD §10.
 *
 * This module was a lifetime, cumulative six-rung ladder. The approved incentive
 * structure in §10 is not that: it is two parallel slab programmes on calendar
 * periods, with cashback as a rate on actual spend, a fixed gift per slab, a
 * 30-day maturation window and a provisional-then-confirmed ledger. The old
 * ladder is not a simplification of this one, it is a different promise, so it
 * has been replaced rather than dressed up. `reward_tier` and `reward_claim`
 * stay in the schema and in the console — they are the record of coins Material
 * Depot has physically handed over — and `docs/rewards.md` says which is which.
 *
 * Four sub-tabs, per the §7 information architecture, driven by a search param
 * so the whole page stays a server component and each tab is linkable.
 */
const TABS = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'ledger', label: 'Statement' },
  { key: 'compare', label: 'Compare' },
  { key: 'terms', label: 'Programme terms' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const active: TabKey = (TABS.find((t) => t.key === tab)?.key ?? 'month') as TabKey

  const referrals = await listReferrals()
  if (!referrals.ok) {
    return (
      <Shell active={active}>
        <Problem title="We could not load your clients" detail={referrals.error} />
      </Shell>
    )
  }

  const ids = referrals.data.map((r) => r.id)
  const [orders, escalations] = await Promise.all([listReferralOrders(ids), listEscalations()])

  if (!orders.ok) {
    return (
      <Shell active={active}>
        <Problem title="We could not load your referred orders" detail={orders.error} />
      </Shell>
    )
  }

  // An OPEN escalation against an order holds that order's maturation (§10.5).
  // If the escalations read FAILED we say so rather than counting zero: treating
  // an unreadable escalation table as "nothing is open" would mature an order
  // that should be held, which is money out of the door on a query error.
  const escalationsBroken = !escalations.ok
  const openByOrder = new Map<string, number>()
  if (escalations.ok) {
    for (const e of escalations.data) {
      if (!e.order_id) continue
      if (['open', 'acknowledged', 'in_progress', 'reopened'].includes(e.status)) {
        openByOrder.set(e.order_id, (openByOrder.get(e.order_id) ?? 0) + 1)
      }
    }
  }

  const ledgerOrders: LedgerOrder[] = orders.data.map((o) => ({
    ...o,
    open_escalations: openByOrder.get(o.id) ?? 0,
  }))

  const today = todayIST()
  const month = monthStanding(ledgerOrders, monthKey(today), today)
  const quarter = quarterStanding(ledgerOrders, quarterKey(today), today)
  const wall = coinWall(ledgerOrders, today)
  const nameOf = new Map(referrals.data.map((r) => [r.id, r.client_name]))
  const rows = ledgerRows(ledgerOrders, (o) => nameOf.get(o.referral_id) ?? 'A client', today)

  const confirmedCashback = rows
    .filter((r) => r.status === 'confirmed' && r.netCashback !== null)
    .reduce((s, r) => s + (r.netCashback ?? 0), 0)
  // CONFIRMED months only. This summed every month on the wall, which put the
  // current month's provisional gift under a heading that says "confirmed" —
  // the exact thing §10.4 forbids ("never show a provisional number without the
  // label"), in the one place a partner reads as settled.
  const yearGifts = wall.filter((m) => m.confirmed).reduce((s, m) => s + (m.slab?.giftValue ?? 0), 0)

  return (
    <Shell active={active}>
      {escalationsBroken ? (
        <Problem
          title="We could not check your open escalations"
          detail="An order with an open escalation against it is held back from maturing. That check failed, so a figure below may include an order that is actually on hold. Everything else on this page is accurate."
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="This month so far"
          value={inr(month.spend)}
          hint={month.slab ? month.slab.bandLabel : month.belowEntry ? 'Below the ₹50,001 entry' : '—'}
          tone="brand"
        />
        <Stat
          label={month.cashback.discountKnown ? 'Net cashback this month' : 'Gross cashback this month'}
          value={month.cashback.discountKnown ? inr(month.cashback.net ?? 0) : inr(month.cashback.gross)}
          hint={
            month.cashback.discountKnown
              ? 'After the store discount already taken'
              : 'Before a deduction we are still waiting on'
          }
          tone={month.cashback.discountKnown ? 'good' : 'brand'}
        />
        <Stat
          label="Gift value this month"
          value={month.cashback.giftValue ? inr(month.cashback.giftValue) : '—'}
          hint={month.milestone ? 'Fixed for the slab you reached' : 'Reach ₹1,00,001 for the first gift'}
        />
        <Stat
          label="Confirmed this year"
          value={inrShort(confirmedCashback)}
          hint={
            yearGifts
              ? `plus ${inrShort(yearGifts)} in gifts. Past the 30-day window and ready to settle.`
              : 'Cashback past the 30-day window. Nothing has confirmed yet.'
          }
          tone="good"
        />
      </div>

      <div className="mt-5 space-y-5">
        {active === 'month' ? (
          <>
            <SlabProgress standing={month} kind="month" today={today} />
            <CoinWall months={wall} />
          </>
        ) : null}

        {active === 'quarter' ? (
          <>
            <SlabProgress standing={quarter} kind="quarter" today={today} />
            <Card className="border-0 bg-transparent px-1 py-1">
              <p className="text-xs leading-relaxed text-ink-faint">
                The quarterly programme runs on the same orders as the monthly one — reaching a quarterly slab does not
                cost you anything monthly, and reaching a monthly slab does not use anything up. They are added
                together.
              </p>
            </Card>
          </>
        ) : null}

        {active === 'ledger' ? <RewardLedger rows={rows} /> : null}

        {active === 'compare' ? <RewardCompare /> : null}

        {active === 'terms' ? <ProgrammeTerms goLive={GO_LIVE} version={PROGRAMME_VERSION} /> : null}
      </div>
    </Shell>
  )
}

function Shell({ children, active }: { children: React.ReactNode; active: TabKey }) {
  return (
    <>
      <PageHead
        title="Rewards"
        hint="Two programmes on the same spend — a monthly slab that pays cashback and a gift, and a quarterly one that pays an experience. Both reset with the calendar."
      />
      <div className="border-b border-line px-4 md:px-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/rewards?tab=${t.key}`}
              className={[
                'border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition',
                active === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-soft hover:border-line-strong hover:text-ink',
              ].join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="px-4 py-5 md:px-6">{children}</div>
    </>
  )
}
