import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { currentSession, myKam } from '@/lib/data/session'
import {
  listActivity, listEscalations, listPortfolio, listProjects, listReferralEvents,
  listReferralOrders, listReferrals,
} from '@/lib/data/queries'
import {
  coinWall, eligible, funnel, monthStanding, type LedgerOrder,
} from '@/lib/domain/ledger'
import { dayOf, monthKey, previousRange, resolveRange, todayIST, within, type RangeKey } from '@/lib/domain/periods'
import { MILESTONE_LABEL, MILESTONE_PHRASE } from '@/lib/domain/slabs'
import { PageHead } from '@/components/shell/PageHead'
import { ClientActivity } from '@/components/referrals/ClientActivity'
import { KamCard } from '@/components/partner/KamCard'
import { ActivityFeed } from '@/components/partner/ActivityFeed'
import { RangePicker } from '@/components/partner/RangePicker'
import { MetricCard } from '@/components/partner/MetricCard'
import { RevenueTrend } from '@/components/partner/RevenueTrend'
import { Funnel } from '@/components/partner/Funnel'
import { NextBestAction, type Nudge } from '@/components/partner/NextBestAction'
import { OnboardingChecklist } from '@/components/shell/OnboardingChecklist'
import { Badge, Button, Card, CardHead, Empty, Problem } from '@/components/ui'
import { inr, inrShort } from '@/lib/format'
import { STAGES } from '@/lib/domain/project'

/**
 * Overview — PRD §8.
 *
 * "Answer in five seconds: how much business have I done, what's moving, and who
 * do I call?"
 *
 * Everything on this page hangs off the date range control (§8.2.1), defaulting
 * to the current calendar month because that is the period the incentive
 * programme runs on. The previous cut of this page had no period at all, which
 * meant every figure was a lifetime total wearing no label — the exact ambiguity
 * §8.2.2 asks to be removed by putting the range in each card header.
 *
 * The middle of the page is still a list of the clients this firm referred
 * rather than a merged event stream, for the reason recorded in
 * `docs/referrals.md`: the stream is the shape a log file has, and the question
 * an architect has is per person.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range: rangeParam } = await searchParams
  const today = todayIST()
  const range = resolveRange((rangeParam as RangeKey) ?? 'this_month', today)
  const before = previousRange(range)

  const session = await currentSession()
  const partner = session.ok && session.data ? session.data.partner : null
  const firstName = partner ? partner.contact_name.split(' ')[0] : 'there'
  const workspace = partner?.workspace_enabled ?? false

  const [referrals, kam, activity, escalations, portfolio] = await Promise.all([
    listReferrals(), myKam(), listActivity(8), listEscalations(), listPortfolio(),
  ])

  const refIds = referrals.ok ? referrals.data.map((r) => r.id) : []
  const [orders, events, projects] = await Promise.all([
    listReferralOrders(refIds),
    // The whole history, not the newest handful: this page rolls events up PER
    // CLIENT, and the twelve most recent events across everybody would leave a
    // client whose cart is a month old looking like they had never been in.
    listReferralEvents(refIds),
    workspace ? listProjects() : Promise.resolve({ ok: true as const, data: [] }),
  ])

  const problems = [referrals, projects, portfolio].filter((r) => !r.ok) as { ok: false; error: string }[]

  // An open escalation holds an order's maturation (§10.5). A FAILED read is not
  // treated as "nothing open" — see the same note on the Rewards page.
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

  const counting = eligible(all, today)
  const inRange = counting.filter((o) => within(dayOf(o.ordered_on), range))
  const inPrevious = counting.filter((o) => within(dayOf(o.ordered_on), before))
  const revenue = inRange.reduce((s, o) => s + (Number(o.order_value) || 0), 0)
  const revenueBefore = inPrevious.reduce((s, o) => s + (Number(o.order_value) || 0), 0)

  const referredInRange = referrals.ok ? referrals.data.filter((r) => within(dayOf(r.referred_on), range)) : []
  const referredBefore = referrals.ok ? referrals.data.filter((r) => within(dayOf(r.referred_on), before)) : []

  const month = monthStanding(all, monthKey(today), today)
  const wall = coinWall(all, today)
  const ordersPerMonth = new Map<string, number>()
  for (const o of counting) {
    const d = dayOf(o.ordered_on)
    if (d) ordersPerMonth.set(monthKey(d), (ordersPerMonth.get(monthKey(d)) ?? 0) + 1)
  }

  // §8.2.4's funnel, on distinct CLIENTS. One client who walked in three times
  // is one client — see the note in components/partner/Funnel.tsx.
  const evs = events.ok ? events.data : []
  const inRangeEvents = evs.filter((e) => within(dayOf(e.occurred_at), range))
  const visited = new Set(inRangeEvents.filter((e) => e.event_type === 'store_visit').map((e) => e.referral_id))
  const carted = new Set(inRangeEvents.filter((e) => e.event_type === 'cart_add').map((e) => e.referral_id))
  const ordered = new Set(inRange.map((o) => o.referral_id))
  const stages = funnel([
    { key: 'referred', label: 'Referred', count: referredInRange.length },
    { key: 'visited', label: 'Visited a store', count: visited.size },
    { key: 'cart', label: 'Started a cart', count: carted.size },
    { key: 'ordered', label: 'Placed an order', count: ordered.size },
  ])

  const live = projects.ok ? projects.data.filter((p) => p.status === 'active') : []
  const nudges = nudgesFor({ month, referrals: referrals.ok ? referrals.data : [], events: evs, orders: all, portfolio: portfolio.ok ? portfolio.data : [], today })

  // §8.2.8 — a newly provisioned firm gets the checklist instead of zeroed cards.
  const isNew = referrals.ok && referrals.data.length === 0 && all.length === 0
  const steps = [
    {
      label: 'Complete your studio profile',
      done: Boolean(partner?.bio && partner?.city),
      href: '/settings',
      why: 'Your logo, city and a line about the practice — it is what appears beside your work on our site.',
    },
    {
      label: 'Refer your first client',
      done: (referrals.ok ? referrals.data.length : 0) > 0,
      href: '/referrals?new=1',
      why: 'Their store visits, cart and orders then show up against their name here.',
    },
    {
      label: 'Put a project in your portfolio',
      done: (portfolio.ok ? portfolio.data.length : 0) > 0,
      href: '/portfolio',
      why: 'Published work gets a page on materialdepot.com with your firm’s card on it.',
    },
  ]

  return (
    <>
      <PageHead
        title={`Good to see you, ${firstName}`}
        hint="What the clients you sent us have been doing, and where that has got you."
        action={
          <Link href="/referrals?new=1">
            <Button variant="primary"><Plus size={15} /> Refer a client</Button>
          </Link>
        }
      />

      <div className="space-y-5 px-4 py-5 md:px-6">
        {problems.length ? (
          <Problem title="Some of this page could not load" detail={problems.map((p) => p.error).join(' · ')} />
        ) : null}

        <RangePicker range={range} />

        {isNew ? (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <OnboardingChecklist steps={steps} />
            <KamCard kam={kam.ok ? kam.data : null} error={kam.ok ? null : kam.error} />
          </div>
        ) : null}

        <NextBestAction nudges={nudges} />

        {/* §8.2.2's metric cards. Every one has the range on it and goes
            somewhere — a number a partner cannot drill into is a number they
            have to ring somebody about.

            "Waiting on us" used to sit here as a fourth tile. Removed: with
            orders arriving pending far more often than not, a running count
            of "what Material Depot has not yet checked" read as a complaint
            about Material Depot rather than something useful to the
            partner — it is still visible per-order on the ledger, just not
            promoted to a headline number. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Revenue contributed"
            range={range.label}
            value={inrShort(revenue)}
            delta={{ now: revenue, before: revenueBefore, format: inrShort }}
            hint={`${inRange.length} verified order${inRange.length === 1 ? '' : 's'}`}
            href="/rewards?tab=ledger"
            tone="good"
          />
          <MetricCard
            label="Clients referred"
            range={range.label}
            value={referredInRange.length}
            delta={{ now: referredInRange.length, before: referredBefore.length }}
            hint={`${referrals.ok ? referrals.data.length : 0} in total`}
            href="/referrals"
          />
          <MetricCard
            label="This month’s slab"
            range={month.period.label}
            value={month.slab ? month.slab.bandLabel.split('–')[0].trim() + '+' : month.belowEntry ? 'Not reached' : '—'}
            hint={
              month.aboveLadder
                ? 'Above the published ladder — rate being confirmed'
                : month.gap > 0 && month.next
                  ? `${inrShort(month.gap)} more for ${month.next.milestone ? MILESTONE_LABEL[month.next.milestone] : 'the next slab'}`
                  : month.slab
                    ? 'Top of the ladder'
                    : `${inrShort(50001 - month.spend)} to start earning`
            }
            href="/rewards"
            tone="brand"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-5">
            <RevenueTrend months={wall} orderCounts={ordersPerMonth} />
            <ClientActivity
              referrals={referrals.ok ? referrals.data : []}
              events={evs}
              orders={all}
              eventsError={events.ok ? null : events.error}
              ordersError={orders.ok ? null : orders.error}
              hint="Tap a name for their visits, their cart and their orders"
              linkBase="/referrals?client="
              action={
                <Link href="/referrals" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  All clients <ArrowRight size={12} />
                </Link>
              }
              emptyBody="Tell us about a client and everything they do with us — store visits, what they looked at, what is in their cart, what they ordered — shows up against their name here."
              emptyAction={
                <Link href="/referrals?new=1" className="text-sm font-medium text-brand hover:underline">
                  Refer your first client →
                </Link>
              }
            />
          </div>

          <div className="space-y-5">
            {isNew ? null : <KamCard kam={kam.ok ? kam.data : null} error={kam.ok ? null : kam.error} />}
            <Funnel stages={stages} range={range.label} />
            <Card>
              <CardHead title="Your account with us" hint="What we have done, and when" />
              <ActivityFeed items={activity.ok ? activity.data : []} error={activity.ok ? null : activity.error} />
            </Card>
          </div>
        </div>

        {workspace ? (
          <Card>
            <CardHead
              title="Workspace projects on the board"
              hint="Where each one has got to"
              action={
                <Link href="/workspace/projects" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  All projects <ArrowRight size={12} />
                </Link>
              }
            />
            {!projects.ok ? (
              <div className="p-4"><Problem title="Projects did not load" detail={projects.error} /></div>
            ) : live.length === 0 ? (
              <Empty
                title="No active projects yet"
                body="Add your first client, then a project. Rooms, inspiration boards and the quote all hang off it."
                action={<Link href="/workspace/projects?new=1"><Button variant="primary"><Plus size={15} /> New project</Button></Link>}
              />
            ) : (
              <ul className="divide-y divide-line">
                {live.slice(0, 7).map((p) => {
                  const stage = STAGES.find((s) => s.key === p.stage)
                  return (
                    <li key={p.id}>
                      <Link href={`/workspace/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                          <p className="truncate text-xs text-ink-faint">
                            {p.city ?? p.site_address ?? 'No site address'}
                            {p.budget ? ` · budget ${inrShort(p.budget)}` : ''}
                          </p>
                        </div>
                        <Badge tone={p.stage === 'design' ? 'info' : p.stage === 'procurement' ? 'warn' : 'good'}>
                          {stage?.label ?? p.stage}
                        </Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <div className="px-4 py-4">
              <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                There is more here if you want it
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Design boards, client quotes with your own markup, a procurement list and a project P&amp;L are
                all built and switched off for your account. They are yours to turn on whenever you want them,
                and nobody at Material Depot can see what you put in them — not your clients, not your rates,
                not your margins. Ask your key account manager and we will enable it.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

/**
 * §8.2.7's rules. Kept here, next to the data, rather than in a service — each
 * one is two lines and they are only worth anything while they stay readable
 * beside the figures they are computed from.
 */
function nudgesFor({
  month, referrals, events, orders, portfolio, today,
}: {
  month: ReturnType<typeof monthStanding>
  referrals: { id: string; client_name: string; referred_on: string }[]
  events: { referral_id: string; occurred_at: string; event_type: string }[]
  orders: LedgerOrder[]
  portfolio: { status: string }[]
  today: string
}): Nudge[] {
  const out: Nudge[] = []

  // The money one goes first, always: it is the only nudge that is worth
  // something to the partner rather than to us.
  if (month.next && month.gap > 0 && !month.belowEntry) {
    out.push({
      id: 'slab',
      text: `${inr(month.gap)} more this month reaches ${month.next.cashbackPct}% cashback${month.next.milestone ? ` and ${MILESTONE_PHRASE[month.next.milestone]}` : ''}.`,
      href: '/rewards',
      cta: 'See the ladder',
    })
  } else if (month.belowEntry && month.spend > 0) {
    out.push({
      id: 'entry',
      text: `${inr(50001 - month.spend)} more this month starts earning cashback.`,
      href: '/rewards',
      cta: 'How it works',
    })
  }

  // Clients who have gone quiet. §8.2.7's own example.
  const lastSeen = new Map<string, string>()
  for (const e of events) {
    const d = dayOf(e.occurred_at)
    if (!d) continue
    const prev = lastSeen.get(e.referral_id)
    if (!prev || d > prev) lastSeen.set(e.referral_id, d)
  }
  const ordered = new Set(orders.map((o) => o.referral_id))
  const cutoff = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10)
  const quiet = referrals.filter((r) => !ordered.has(r.id) && (lastSeen.get(r.id) ?? r.referred_on) < cutoff)
  if (quiet.length) {
    out.push({
      id: 'quiet',
      text:
        quiet.length === 1
          ? `${quiet[0].client_name} has not been near a store in 30 days and has not ordered.`
          : `${quiet.length} referred clients have not been near a store in 30 days.`,
      href: '/referrals',
      cta: 'See who',
    })
  }

  const needsWork = portfolio.filter((p) => p.status === 'rejected').length
  if (needsWork) {
    out.push({
      id: 'portfolio',
      text: `${needsWork} portfolio project${needsWork === 1 ? '' : 's'} need${needsWork === 1 ? 's' : ''} changes before we can publish ${needsWork === 1 ? 'it' : 'them'}.`,
      href: '/portfolio',
      cta: 'Open portfolio',
    })
  }

  return out
}
