'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Plus, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react'
import type {
  Referral, ReferralEvent, ReferralPhone, VisitRequest,
} from '@/lib/domain/types'
import {
  Button, Card, CardHead, Empty, Input, Problem, Select, Table, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ReferralFeed } from './ReferralFeed'
import { ReferClientForm } from './ReferClientForm'
import { ScheduleVisitForm } from './ScheduleVisitForm'
import { VisitLog } from './VisitLog'
import { NumbersPanel } from './NumbersPanel'
import { LiveCart } from './LiveCart'
import { MaskedPhone } from './MaskedPhone'
import { ClientOrders, OrdersFooter } from './ClientOrders'
import { OrderList, VisitList } from '@/components/snapshot/Sections'
import { summariseClients } from '@/lib/domain/referrals'
import { standing, type LedgerOrder } from '@/lib/domain/ledger'
import { GO_LIVE } from '@/lib/domain/programme'
import { clientCartOrderSnapshot, deleteReferral } from '@/lib/data/actions'
import type { SnapshotResult } from '@/lib/data/snapshot'
import { EV, track } from '@/lib/analytics/track'
import { date, inr, inrShort, relative } from '@/lib/format'

/**
 * Referrals: the clients an architect sent to Material Depot, and everything
 * those clients then did with us.
 *
 * Matching is on the exact ten-digit phone number and nothing else. That is why
 * the form refuses a number it cannot parse instead of storing it anyway: a
 * referral with a wrong number is a referral whose orders will never be
 * credited, and it would sit there looking fine.
 */
export function ReferralsView({
  referrals, events, orders, eventsError, initialOpenId, openNew,
  visits, visitsError, phones, phonesError, today,
}: {
  referrals: Referral[]
  events: ReferralEvent[]
  orders: LedgerOrder[]
  eventsError?: string | null
  /** `?client=<referral id>`, so the dashboard can link straight to one. */
  initialOpenId?: string | null
  /** `?new=1`, so a call to action anywhere can open the form. */
  openNew?: boolean
  visits: VisitRequest[]
  visitsError?: string | null
  phones: ReferralPhone[]
  phonesError?: string | null
  today: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(Boolean(openNew))
  const [schedulingVisit, setSchedulingVisit] = useState(false)
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // The live cart + order pull for the open client. Lifted here (rather than
  // living inside NumbersPanel) so its orders can land in this client's "What
  // they have bought" card, not in a separate live-orders section. Cleared
  // whenever a different client is opened.
  const [snap, setSnap] = useState<SnapshotResult[] | null>(null)
  const [snapError, setSnapError] = useState<string | null>(null)
  const [snapPending, startSnap] = useTransition()

  function pullSnapshot(referralId: string) {
    setSnapError(null)
    startSnap(async () => {
      const res = await clientCartOrderSnapshot(referralId)
      if (!res.ok) {
        setSnap(null)
        return setSnapError(res.error)
      }
      setSnap(res.data)
    })
  }

  // Auto-pull when a client is opened, so the live cart, orders and visits are
  // there without a click. The ref keeps it to one fetch per open — it does not
  // re-fire on every render, and React's dev double-mount does not double-hit
  // the external API. The Refresh button calls pullSnapshot directly to re-pull.
  const autoPulledFor = useRef<string | null>(null)
  useEffect(() => {
    if (openId && autoPulledFor.current !== openId) {
      autoPulledFor.current = openId
      pullSnapshot(openId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])
  // §9.1's filters, search and sort.
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'last_activity' | 'value' | 'referred'>('last_activity')

  const names = useMemo(() => new Map(referrals.map((r) => [r.id, r.client_name])), [referrals])

  // One rollup, shared with the dashboard's client list — a second copy of this
  // arithmetic here is how the two screens start disagreeing about one client.
  // The money inside it is `attributedSale`/`pendingSale`, which is what the
  // rewards ladder is computed from, so a per-client figure cannot drift from
  // the total it adds up to.
  const stats = useMemo(() => {
    const rows = summariseClients(referrals, events, orders)
    return new Map(rows.map((r) => [r.referral.id, r]))
  }, [referrals, events, orders])

  /**
   * Opening a client is addressable: `/referrals?client=<referral id>`, which
   * is what the dashboard links to. `history.replaceState` rather than
   * `router.replace` on purpose — this is the same route with the same data,
   * and a push would re-run the page's four queries to render a panel that is
   * already in memory. Back still leaves the page, which is what a browser
   * Back on a landing-page drill-in should do.
   */
  function openClient(id: string | null) {
    setOpenId(id)
    // Live data belongs to one client — never carry it across to the next.
    setSnap(null)
    setSnapError(null)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('client', id)
    else url.searchParams.delete('client')
    window.history.replaceState(null, '', url.toString())
  }


  // §9.1 — search by name or phone, sort. Searching the phone works on the
  // FULL number even though the list shows a masked one: an architect typing a
  // number they already have is not a privacy event, and making them reveal
  // first to find someone would be security theatre.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = referrals.filter((r) => {
      if (!q) return true
      return r.client_name.toLowerCase().includes(q) || r.md_phone.includes(q.replace(/\D/g, ''))
    })
    out = [...out].sort((a, b) => {
      if (sort === 'value') return (stats.get(b.id)?.approved ?? 0) - (stats.get(a.id)?.approved ?? 0)
      if (sort === 'referred') return b.referred_on.localeCompare(a.referred_on)
      const la = stats.get(a.id)?.lastSeen ?? a.referred_on
      const lb = stats.get(b.id)?.lastSeen ?? b.referred_on
      return String(lb).localeCompare(String(la))
    })
    return out
  }, [referrals, query, sort, stats])

  const open = referrals.find((r) => r.id === openId) ?? null

  function remove(id: string) {
    setError(null)
    start(async () => {
      const res = await deleteReferral(id)
      if (!res.ok) return setError(res.error)
      openClient(null)
      router.refresh()
    })
  }

  if (open) {
    const s = stats.get(open.id)
    const mine = s?.events ?? []
    const myOrders = (s?.orders ?? []) as LedgerOrder[]
    const counted = myOrders.filter((o) => standing(o, today, GO_LIVE).state === 'counted')
    const countedValue = counted.reduce((sum, o) => sum + (Number(o.order_value) || 0), 0)
    // Every live order across this client's linked numbers, pulled on demand,
    // each tagged with the number it belongs to so the aggregated list stays
    // legible (a pill shows the number per row).
    const liveOrders = (snap ?? []).flatMap((r) =>
      (r.orders?.items ?? []).map((order) => ({ order, phone: r.phone_number })),
    )
    // Live store visits across the client's numbers, tagged the same way.
    const liveVisits = (snap ?? []).flatMap((r) =>
      (r.visits?.items ?? []).map((visit) => ({ visit, phone: r.phone_number })),
    )

    return (
      <>
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            onClick={() => openClient(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-brand"
          >
            <ArrowLeft size={14} /> All clients
          </button>
          <Button size="sm" variant="secondary" onClick={() => pullSnapshot(open.id)} disabled={snapPending}>
            <RefreshCw size={13} className={snapPending ? 'animate-spin' : undefined} />
            {snapPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <Card>
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand ring-1 ring-brand-line ring-inset">
                    {open.client_name.trim().charAt(0).toUpperCase() || '—'}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{open.client_name}</h2>
                    <p className="mt-0.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                      <MaskedPhone referralId={open.id} phone={open.md_phone} surface="client_detail" />
                      <span>· referred {date(open.referred_on)}</span>
                      {open.city || open.locality ? <span>· {[open.locality, open.city].filter(Boolean).join(', ')}</span> : null}
                      {open.attribution_expires_on ? (
                        <span>· credited to you until {date(open.attribution_expires_on)}</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" onClick={() => setSchedulingVisit(true)}>
                    <CalendarPlus size={13} /> Schedule another visit
                  </Button>
                  <button
                    onClick={() => remove(open.id)}
                    disabled={pending}
                    className="rounded-md p-1.5 text-ink-faint transition hover:bg-bad-soft hover:text-bad"
                    title="Remove this referral"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <ReferralFeed
                events={mine}
                names={names}
                error={eventsError}
                emptyBody="Nothing has come through for them yet. Store visits, the products they looked at, their cart and any order will appear here."
              />
            </Card>

            <Card>
              <CardHead
                title="What they have bought"
                hint="Every order, and what each one is doing for your rewards"
              />
              {/* Its "No orders yet" empty state must not show when there are
                  live orders below — that would have the card deny and list
                  orders at once. Render the attributed table when there is one,
                  or the empty state only when there is nothing live either. */}
              {myOrders.length || !liveOrders.length ? (
                <ClientOrders orders={myOrders} today={today} />
              ) : null}
              <OrdersFooter orders={myOrders} today={today} goLive={GO_LIVE} />
              <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                <span className="text-xs font-medium text-ink-soft">Counting towards your rewards</span>
                <span className="tnum text-sm font-semibold text-good">{inr(countedValue)}</span>
              </div>
              {liveOrders.length ? (
                <div className="border-t border-line px-4 py-3">
                  {/* Live from Material Depot, across every linked number. Kept
                      visually apart from the table above because these carry no
                      attribution or maturation yet — they have not been verified
                      into the rewards ledger, and showing them as if they had
                      would misstate what is counting. */}
                  <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                    Live from Material Depot
                  </p>
                  <OrderList orders={liveOrders} />
                </div>
              ) : null}
            </Card>

            <Card>
              <CardHead
                title="Live cart"
                hint="Pulled live from Material Depot — pick a number to see its cart"
              />
              {snapError ? (
                <div className="px-4 py-3"><Problem title="Live lookup failed" detail={snapError} /></div>
              ) : snap ? (
                <LiveCart results={snap} />
              ) : snapPending ? (
                <p className="px-4 py-4 text-xs text-ink-faint">Checking Material Depot…</p>
              ) : (
                <p className="px-4 py-4 text-xs text-ink-faint">Use Refresh at the top to load the live cart.</p>
              )}
            </Card>

          </div>

          <div className="space-y-4">
            <Card>
              <CardHead title="Visits" hint="Every store visit scheduled for this client" />
              {visitsError ? (
                <div className="px-4 py-3"><Problem title="Visits could not be loaded" detail={visitsError} /></div>
              ) : (
                <>
                  {/* Suppress VisitLog's "No visits" empty state when live visits
                      are present — otherwise the card denies and lists visits at
                      once, the same trap the orders card had. */}
                  {visits.some((v) => v.referral_id === open.id) || !liveVisits.length ? (
                    <VisitLog visits={visits.filter((v) => v.referral_id === open.id)} />
                  ) : null}
                  {liveVisits.length ? (
                    <div className="border-t border-line px-4 py-3">
                      <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                        Live from Material Depot
                      </p>
                      <VisitList visits={liveVisits} />
                    </div>
                  ) : null}
                </>
              )}
            </Card>

            <Card>
              <CardHead title="Numbers linked to this client" hint="Carts and orders on any of these count for them" />
              {phonesError ? (
                <div className="px-4 py-3"><Problem title="Numbers could not be loaded" detail={phonesError} /></div>
              ) : (
                <NumbersPanel referralId={open.id} phones={phones.filter((p) => p.referral_id === open.id)} />
              )}
            </Card>

            {open.project_type || open.budget_band || open.timeline || open.categories?.length ? (
              <Card>
                <CardHead title="What you told us" hint="From the referral form" />
                <dl className="space-y-1.5 px-4 py-3 text-sm">
                  {open.project_type ? <Detail label="Project" value={open.project_type} /> : null}
                  {open.budget_band ? <Detail label="Budget" value={open.budget_band} /> : null}
                  {open.timeline ? <Detail label="Timeline" value={open.timeline} /> : null}
                  {open.categories?.length ? <Detail label="Looking for" value={open.categories.join(', ')} /> : null}
                </dl>
              </Card>
            ) : null}

            {open.notes ? (
              <Card>
                <CardHead title="Your note" />
                <p className="px-4 py-3 text-sm leading-relaxed text-ink-soft">{open.notes}</p>
              </Card>
            ) : null}
          </div>
        </div>

        <Modal
          open={schedulingVisit}
          onClose={() => setSchedulingVisit(false)}
          title={`Schedule a visit for ${open.client_name}`}
          hint="Their details are already on file — just what this visit is about."
        >
          <ScheduleVisitForm
            referralId={open.id}
            onDone={() => setSchedulingVisit(false)}
            onCancel={() => setSchedulingVisit(false)}
          />
        </Modal>
      </>
    )
  }


  return (
    <>
      {error ? <div className="mb-4"><Problem title="Something went wrong" detail={error} /></div> : null}

      <Card>
        <CardHead
          title={`${referrals.length} referred client${referrals.length === 1 ? '' : 's'}`}
          hint="Everything they do with us shows up here — and counts towards your rewards"
          action={<Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={15} /> Refer a client</Button>}
        />

        {referrals.length === 0 ? (
          <Empty
            icon={<UserPlus size={22} />}
            title="No referrals yet"
            body="Send a client to Material Depot and you will see when they visited which store, what they looked at, what is in their cart, and what they ordered. Every rupee of it counts towards your rewards."
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Refer your first client</Button>}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <div className="relative min-w-[180px] flex-1">
                <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (e.target.value.length === 3) track(EV.client_filter_applied, { kind: 'search' })
                  }}
                  placeholder="Search name or number"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="h-8 w-auto text-xs"
              >
                <option value="last_activity">Last activity</option>
                <option value="value">Order value</option>
                <option value="referred">Recently referred</option>
              </Select>
              {rows.length !== referrals.length ? (
                <span className="text-xs text-ink-faint">{rows.length} of {referrals.length}</span>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <Empty title="Nothing matches" body="Try a different search." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Phone</Th>
                    <Th>Referred</Th>
                    <Th>Last seen</Th>
                    <Th className="text-right">In cart</Th>
                    <Th className="text-right">Orders</Th>
                    <Th className="text-right">Counting</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = stats.get(r.id)
                    const counted = (st?.orders ?? []).filter(
                      (o) => standing(o as LedgerOrder, today, GO_LIVE).state === 'counted',
                    )
                    const countedValue = counted.reduce((sum, o) => sum + (Number(o.order_value) || 0), 0)
                    return (
                      <tr
                        key={r.id}
                        onClick={() => {
                          openClient(r.id)
                          track(EV.client_detail_viewed)
                        }}
                        className="cursor-pointer transition hover:bg-raised"
                      >
                        <Td className="font-medium">{r.client_name}</Td>
                        <Td className="text-xs" onClick={(e) => e.stopPropagation()}>
                          <MaskedPhone referralId={r.id} phone={r.md_phone} surface="client_list" />
                        </Td>
                        <Td className="text-xs text-ink-soft">{date(r.referred_on)}</Td>
                        <Td className="text-xs text-ink-soft">{st?.lastSeen ? relative(st.lastSeen) : '—'}</Td>
                        <Td className="tnum text-right text-xs">
                          {st?.cart.state === 'open' ? (
                            <span className="font-semibold text-brand">
                              {st.cart.cart.value !== null ? inrShort(st.cart.cart.value) : 'open'}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                        <Td className="tnum text-right text-xs">{st?.orders.length ?? 0}</Td>
                        <Td className="tnum text-right text-xs font-semibold">
                          {countedValue ? (
                            <span className="text-good">{inrShort(countedValue)}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Refer a client"
        hint="Their exact mobile number is what links their visits and orders back to you."
      >
        <ReferClientForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  )
}

