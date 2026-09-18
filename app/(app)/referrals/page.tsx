import Link from 'next/link'
import {
  listEscalations, listReferralEvents, listReferralOrders, listReferralPhones,
  listReferrals, listVisitRequests,
} from '@/lib/data/queries'
import { ReferralsView } from '@/components/referrals/ReferralsView'
import { PageHead } from '@/components/shell/PageHead'
import { Problem, Stat } from '@/components/ui'
import { eligible, standing, type LedgerOrder } from '@/lib/domain/ledger'
import { monthStanding } from '@/lib/domain/ledger'
import { monthKey, todayIST } from '@/lib/domain/periods'
import { GO_LIVE } from '@/lib/domain/programme'
import { MILESTONE_LABEL } from '@/lib/domain/slabs'
import { inr, inrShort } from '@/lib/format'

/**
 * Clients — PRD §9. "The operational heart of the dashboard."
 *
 * One row per client the firm referred, their whole journey behind the name,
 * what is in their cart, what they ordered and what each order is doing for the
 * rewards. `docs/referrals.md` has why the unit is the client and not the event.
 */
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; new?: string }>
}) {
  // `?client=<referral id>` opens straight onto that client; `?new=1` opens the
  // referral form, so a call to action anywhere in the app can land on it.
  const { client, new: openNew } = await searchParams
  const today = todayIST()

  const referrals = await listReferrals()

  if (!referrals.ok) {
    return (
      <>
        <PageHead title="Clients" />
        <div className="px-4 py-5 md:px-6">
          <Problem title="Your clients could not be loaded" detail={referrals.error} />
        </div>
      </>
    )
  }

  const ids = referrals.data.map((r) => r.id)
  const [events, orders, escalations, visits, phones] = await Promise.all([
    listReferralEvents(ids, 500),
    listReferralOrders(ids),
    listEscalations(),
    listVisitRequests(ids),
    listReferralPhones(ids),
  ])

  // An open escalation holds an order's maturation (§10.5). A failed read is
  // NOT counted as zero — see the note on the Rewards page. The escalations are
  // still fetched for this even though the Clients screen no longer shows an
  // escalations card, because a held order must still read as held.
  const openByOrder = new Map<string, number>()
  if (escalations.ok) {
    for (const e of escalations.data) {
      if (e.order_id && ['open', 'acknowledged', 'in_progress', 'reopened'].includes(e.status)) {
        openByOrder.set(e.order_id, (openByOrder.get(e.order_id) ?? 0) + 1)
      }
    }
  }
  const all: LedgerOrder[] = orders.ok
    ? orders.data.map((o) => ({ ...o, open_escalations: openByOrder.get(o.id) ?? 0 }))
    : []

  const counted = all.filter((o) => standing(o, today, GO_LIVE).state === 'counted')
  const countedValue = counted.reduce((s, o) => s + (Number(o.order_value) || 0), 0)
  const accruing = eligible(all, today, GO_LIVE).length - counted.length
  const pending = all.filter((o) => o.approval_status === 'pending')
  const month = monthStanding(all, monthKey(today), today)

  return (
    <>
      <PageHead
        title="Clients"
        hint="Clients you have sent to Material Depot. You see where they went, what is in their cart, and what they ordered."
      />
      <div className="space-y-5 px-4 py-5 md:px-6">
        {!orders.ok ? <Problem title="Order values are missing" detail={orders.error} /> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Referred clients"
            value={referrals.data.length}
            hint={`${all.length} order${all.length === 1 ? '' : 's'} between them`}
          />
          <Stat
            label="Counting towards rewards"
            value={inr(countedValue)}
            hint={
              accruing || pending.length
                ? [
                    accruing ? `${accruing} still maturing` : null,
                    pending.length ? `${pending.length} being checked` : null,
                  ].filter(Boolean).join(' · ')
                : 'Verified and past the 7-day window'
            }
            tone="good"
          />
          <Stat
            label="This month’s slab"
            value={month.slab ? month.slab.bandLabel.split('–')[0].trim() + '+' : month.belowEntry ? 'Not reached' : '—'}
            hint={
              month.gap > 0 && month.next ? (
                <>
                  {inrShort(month.gap)} more for{' '}
                  {month.next.milestone ? MILESTONE_LABEL[month.next.milestone] : 'the next slab'} ·{' '}
                  <Link href="/rewards" className="text-brand hover:underline">see the ladder</Link>
                </>
              ) : (
                <Link href="/rewards" className="text-brand hover:underline">see the ladder</Link>
              )
            }
          />
        </div>

        <ReferralsView
          referrals={referrals.data}
          events={events.ok ? events.data : []}
          orders={all}
          eventsError={events.ok ? null : events.error}
          initialOpenId={client ?? null}
          openNew={openNew === '1'}
          visits={visits.ok ? visits.data : []}
          visitsError={visits.ok ? null : visits.error}
          phones={phones.ok ? phones.data : []}
          phonesError={phones.ok ? null : phones.error}
          today={today}
        />
      </div>
    </>
  )
}
