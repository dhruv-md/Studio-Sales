'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Lock, Plus, Search, Trash2, UserPlus } from 'lucide-react'
import type {
  Escalation, EscalationComment, Referral, ReferralEvent, ReferralPhone, VisitRequest,
} from '@/lib/domain/types'
import {
  Badge, Button, Card, CardHead, Empty, Input, Problem, Select, Table, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ReferralFeed } from './ReferralFeed'
import { CartPanel } from './CartPanel'
import { ReferClientForm } from './ReferClientForm'
import { ScheduleVisitForm } from './ScheduleVisitForm'
import { VisitLog } from './VisitLog'
import { NumbersPanel } from './NumbersPanel'
import { MaskedPhone } from './MaskedPhone'
import { ClientOrders, OrdersFooter } from './ClientOrders'
import { Escalations } from './Escalations'
import { summariseClients } from '@/lib/domain/referrals'
import { CONSENT_COPY, consentOf, itemisedVisible, valueBand } from '@/lib/domain/privacy'
import { standing, type LedgerOrder } from '@/lib/domain/ledger'
import { GO_LIVE } from '@/lib/domain/programme'
import { deleteReferral } from '@/lib/data/actions'
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
  escalations, escalationComments, escalationsError, visits, visitsError, phones, phonesError, today,
}: {
  referrals: Referral[]
  events: ReferralEvent[]
  orders: LedgerOrder[]
  eventsError?: string | null
  /** `?client=<referral id>`, so the dashboard can link straight to one. */
  initialOpenId?: string | null
  /** `?new=1`, so a call to action anywhere can open the form. */
  openNew?: boolean
  escalations: Escalation[]
  escalationComments: EscalationComment[]
  escalationsError?: string | null
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
  // §9.1's filters, search and sort.
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('client', id)
    else url.searchParams.delete('client')
    window.history.replaceState(null, '', url.toString())
  }


  // §9.1 — search by name or phone, filter by status, sort. Searching the phone
  // works on the FULL number even though the list shows a masked one: an
  // architect typing a number they already have is not a privacy event, and
  // making them reveal first to find someone would be security theatre.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = referrals.filter((r) => {
      if (statusFilter && (r.status ?? 'submitted') !== statusFilter) return false
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
  }, [referrals, query, statusFilter, sort, stats])

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
    const consent = consentOf(open)
    const itemised = itemisedVisible(consent)
    const myEscalations = escalations.filter((e) => e.referral_id === open.id)
    const counted = myOrders.filter((o) => standing(o, today, GO_LIVE).state === 'counted')
    const countedValue = counted.reduce((sum, o) => sum + (Number(o.order_value) || 0), 0)

    return (
      <>
        <button
          onClick={() => openClient(null)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-brand"
        >
          <ArrowLeft size={14} /> All clients
        </button>

        {/* §14.5 — without confirmed consent a partner sees aggregate facts
            only: visited yes/no, ordered yes/no, a value BAND. The banner says
            which state this client is in rather than the page quietly showing
            less than it did for the client above. */}
        {!itemised ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-line bg-raised px-4 py-3">
            <Lock size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            <p className="text-xs leading-relaxed text-ink-soft">
              <strong className="text-ink">{CONSENT_COPY[consent].label}.</strong> {CONSENT_COPY[consent].detail}
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <Card>
              <CardHead
                title={open.client_name}
                hint={
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <MaskedPhone referralId={open.id} phone={open.md_phone} surface="client_detail" />
                    <span>· referred {date(open.referred_on)}</span>
                    {open.city || open.locality ? <span>· {[open.locality, open.city].filter(Boolean).join(', ')}</span> : null}
                    {open.attribution_expires_on ? (
                      <span>· credited to you until {date(open.attribution_expires_on)}</span>
                    ) : null}
                  </span>
                }
                action={
                  <div className="flex items-center gap-1.5">
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
                }
              />
              {itemised ? (
                <ReferralFeed
                  events={mine}
                  names={names}
                  error={eventsError}
                  emptyBody="Nothing has come through for them yet. Store visits, the products they looked at, their cart and any order will appear here."
                />
              ) : (
                <AggregateOnly
                  visited={mine.some((e) => e.event_type === 'store_visit')}
                  orders={myOrders.length}
                  band={valueBand(countedValue)}
                />
              )}
            </Card>

            <Card>
              <CardHead
                title="What they have bought"
                hint="Every order, and what each one is doing for your rewards"
              />
              {itemised ? (
                <>
                  <ClientOrders orders={myOrders} today={today} />
                  <OrdersFooter orders={myOrders} today={today} goLive={GO_LIVE} />
                </>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-soft">
                  {myOrders.length
                    ? `${myOrders.length} order${myOrders.length === 1 ? '' : 's'} so far, ${countedValue ? `${valueBand(countedValue).toLowerCase()} of it counting towards your rewards` : 'none of it counting towards your rewards yet'}. We can show you the detail once this client confirms they are happy for us to.`
                    : 'No orders yet.'}
                </p>
              )}
              <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                <span className="text-xs font-medium text-ink-soft">Counting towards your rewards</span>
                <span className="tnum text-sm font-semibold text-good">
                  {itemised ? inr(countedValue) : valueBand(countedValue)}
                </span>
              </div>
            </Card>

            <Escalations
              escalations={myEscalations}
              comments={escalationComments}
              orders={myOrders}
              referralId={open.id}
              error={escalationsError}
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHead title="Visits" hint="Every store visit scheduled for this client" />
              {visitsError ? (
                <div className="px-4 py-3"><Problem title="Visits could not be loaded" detail={visitsError} /></div>
              ) : (
                <VisitLog visits={visits.filter((v) => v.referral_id === open.id)} />
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

            <Card>
              <CardHead title="In their cart" hint="The last cart we saw at a Material Depot store" />
              {itemised ? (
                <CartPanel cart={s?.cart ?? { state: 'none' }} />
              ) : (
                <p className="px-4 py-4 text-sm text-ink-soft">
                  {s?.cart.state === 'open'
                    ? 'They have something in a cart. We can show you what once they confirm they are happy for us to.'
                    : 'Nothing in a cart that we can tell you about.'}
                </p>
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
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  track(EV.client_filter_applied, { kind: 'status', value: e.target.value || 'all' })
                }}
                className="h-8 w-auto text-xs"
              >
                <option value="">Any status</option>
                <option value="submitted">Waiting on us</option>
                <option value="approved">Approved</option>
                <option value="active">Active</option>
                <option value="rejected">Not accepted</option>
              </Select>
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
              <Empty title="Nothing matches" body="Try a different search, or clear the status filter." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Phone</Th>
                    <Th>Status</Th>
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
                    const itemised = itemisedVisible(consentOf(r))
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
                        <Td><ReferralStatusChip status={r.status} reason={r.rejection_reason} /></Td>
                        <Td className="text-xs text-ink-soft">{date(r.referred_on)}</Td>
                        <Td className="text-xs text-ink-soft">{st?.lastSeen ? relative(st.lastSeen) : '—'}</Td>
                        <Td className="tnum text-right text-xs">
                          {st?.cart.state === 'open' ? (
                            <span className="font-semibold text-brand">
                              {itemised && st.cart.cart.value !== null ? inrShort(st.cart.cart.value) : 'open'}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                        <Td className="tnum text-right text-xs">{st?.orders.length ?? 0}</Td>
                        <Td className="tnum text-right text-xs font-semibold">
                          {countedValue ? (
                            <span className="text-good">{itemised ? inrShort(countedValue) : valueBand(countedValue)}</span>
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

/**
 * §6.4's referral status machine, as a chip.
 *
 * `submitted` is the common state and it is labelled "Waiting on us", not
 * "Pending" — a partner reading "pending" assumes they have something left to
 * do. They do not; we do, within 48 hours.
 */
function ReferralStatusChip({ status, reason }: { status?: string; reason?: string | null }) {
  const s = status ?? 'submitted'
  const map: Record<string, { label: string; tone: 'neutral' | 'good' | 'warn' | 'info' | 'bad' }> = {
    submitted: { label: 'Waiting on us', tone: 'info' },
    under_review: { label: 'Being checked', tone: 'info' },
    approved: { label: 'Approved', tone: 'good' },
    active: { label: 'Active', tone: 'good' },
    rejected: { label: 'Not accepted', tone: 'bad' },
    duplicate: { label: 'Already referred', tone: 'warn' },
    dormant: { label: 'Gone quiet', tone: 'neutral' },
    expired: { label: 'Expired', tone: 'neutral' },
  }
  const m = map[s] ?? { label: s, tone: 'neutral' as const }
  return <span title={reason ?? undefined}><Badge tone={m.tone}>{m.label}</Badge></span>
}

/**
 * §14.5's "no consent → limited view": visited yes/no, ordered yes/no, an order
 * value band. No itemised carts, no timeline.
 *
 * Rendered as three plain facts rather than as a greyed-out version of the real
 * timeline. A blurred screen invites a partner to try to read through it; three
 * sentences make it clear that the detail is not being withheld from them
 * personally, it has not been agreed to yet.
 */
function AggregateOnly({ visited, orders, band }: { visited: boolean; orders: number; band: string }) {
  return (
    <dl className="space-y-2 px-4 py-4 text-sm">
      <Detail label="Been into a store" value={visited ? 'Yes' : 'Not yet'} />
      <Detail label="Placed an order" value={orders ? `Yes · ${orders}` : 'Not yet'} />
      <Detail label="Counting towards your rewards" value={band} />
    </dl>
  )
}
