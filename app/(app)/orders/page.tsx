import Link from 'next/link'
import { listEscalations, listReferralOrders, listReferrals } from '@/lib/data/queries'
import { maturity, type LedgerOrder } from '@/lib/domain/ledger'
import { todayIST } from '@/lib/domain/periods'
import { PageHead } from '@/components/shell/PageHead'
import { isRejected, OrderStatus } from '@/components/partner/LiveOrders'
import { Card, Empty, Problem, Table, Td, Th } from '@/components/ui'
import { date, inr } from '@/lib/format'

/**
 * Order tracking. Reached from the Overview's "Live orders" panel and from a
 * client's own page — not a seventh sidebar tab, because `components/shell/
 * nav.ts` is deliberately six items and this is a drill-down on Clients data,
 * not a new module.
 *
 * **What this page can show today, and what it cannot yet.** Every row here
 * is `referral_order` as Material Depot's CRM has synced it — `docs/
 * referrals.md`'s push contract — which carries an order's value, its own
 * free-text `status` and, once the producer sends one, a `delivered_on` date.
 * It does **not** carry live procurement/logistics telemetry (a carrier, a
 * dispatch scan, an ETA), and this app has no connection to
 * `procurement.materialdepot.com` for that: as of 2026-09-17 that hostname
 * does not resolve at all from this deployment, the way `api.materialdepot.
 * com` did before someone allowlisted it (`docs/catalogue.md`). Wiring real
 * live tracking in needs that host's actual API contract — ask Material
 * Depot's engineering team for it rather than guessing one, the same
 * `docs/catalogue.md` lesson.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const today = todayIST()

  const referrals = await listReferrals()
  if (!referrals.ok) {
    return (
      <>
        <PageHead title="Order tracking" />
        <div className="px-4 py-5 md:px-6">
          <Problem title="Your clients could not be loaded" detail={referrals.error} />
        </div>
      </>
    )
  }

  const ids = referrals.data.map((r) => r.id)
  const [orders, escalations] = await Promise.all([listReferralOrders(ids), listEscalations()])
  const nameOf = new Map(referrals.data.map((r) => [r.id, r.client_name]))

  const openByOrder = new Map<string, number>()
  if (escalations.ok) {
    for (const e of escalations.data) {
      if (e.order_id && ['open', 'acknowledged', 'in_progress', 'reopened'].includes(e.status)) {
        openByOrder.set(e.order_id, (openByOrder.get(e.order_id) ?? 0) + 1)
      }
    }
  }

  if (!orders.ok) {
    return (
      <>
        <PageHead title="Order tracking" />
        <div className="px-4 py-5 md:px-6">
          <Problem title="Orders could not be loaded" detail={orders.error} />
        </div>
      </>
    )
  }

  const all: LedgerOrder[] = orders.data
    .map((o) => ({ ...o, open_escalations: openByOrder.get(o.id) ?? 0 }))
    .sort((a, b) => (b.ordered_on ?? '').localeCompare(a.ordered_on ?? ''))

  const view = filter === 'delivered' ? 'delivered' : filter === 'all' ? 'all' : 'live'
  // A rejected order (an admin-declined duplicate, a wrong attribution) is
  // settled, not "in flight" — `delivered_on` on one of these is never
  // coming. It surfaces only under "All", with its reason, not silently
  // dropped (`components/partner/LiveOrders.tsx`'s `OrderStatus`).
  const rows =
    view === 'all'
      ? all
      : all.filter((o) => !isRejected(o) && (maturity(o, today).state !== 'matured') === (view === 'live'))

  return (
    <>
      <PageHead
        title="Order tracking"
        hint="Every order placed for a client you referred, and where it stands with Material Depot."
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink-faint">
          This is Material Depot's own order status, synced from the CRM — not live logistics tracking. A
          direct feed from Material Depot's procurement system is not connected yet.
        </div>

        <div className="flex gap-1.5">
          {(
            [
              ['live', 'In flight'],
              ['delivered', 'Delivered'],
              ['all', 'All'],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === 'live' ? '/orders' : `/orders?filter=${key}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                view === key ? 'border-brand-line bg-brand-soft text-brand' : 'border-line text-ink-soft hover:bg-raised'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <Card>
          {rows.length === 0 ? (
            <Empty
              title={view === 'delivered' ? 'Nothing delivered yet' : view === 'all' ? 'No orders yet' : 'Nothing in flight'}
              body="Orders placed for your referred clients will show up here as Material Depot syncs them."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Order</Th>
                  <Th>Store</Th>
                  <Th>Placed</Th>
                  <Th className="text-right">Value</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <Td className="max-w-[160px] truncate">
                      <Link href={`/referrals?client=${o.referral_id}`} className="hover:underline">
                        {nameOf.get(o.referral_id) ?? 'Unknown client'}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs text-ink-soft" title={o.md_enq_id}>
                      {o.md_enq_id}
                    </Td>
                    <Td className="text-ink-soft">{o.store ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-ink-soft">{date(o.ordered_on)}</Td>
                    <Td className="tnum text-right">{inr(o.order_value)}</Td>
                    <Td>
                      <OrderStatus order={o} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
