import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Referral } from '@/lib/domain/types'
import { maturity, type LedgerOrder } from '@/lib/domain/ledger'
import { explain, ORDER_NOT_COUNTED } from '@/lib/domain/reasons'
import { Badge, Card, CardHead, Empty, Problem, Table, Td, Th, type Tone } from '@/components/ui'
import { date, inr } from '@/lib/format'

/**
 * §8's Overview has no home for "what is still moving" — every card on the
 * page is either a period total or a client list. This is neither: it is
 * every order across every client that Material Depot has not yet told us a
 * delivery date for.
 *
 * "Not yet delivered" reuses `maturity()` rather than inventing a second
 * definition of it. The ledger already carries the three ways an order can be
 * short of delivered — `unknown` (no date sent), `maturing` (delivered,
 * inside the escalation window) and `held` (an escalation is open) — and
 * `docs/referrals.md` records that on production today `delivered_on` is
 * null for every order, because the CRM producer that fills it in does not
 * exist yet. So this panel is expected to show most of the book, honestly,
 * rather than a mostly-empty list that looks broken.
 */
export function LiveOrders({
  orders,
  referrals,
  error,
  limit = 8,
  linkBase = '/orders',
}: {
  orders: LedgerOrder[]
  referrals: Pick<Referral, 'id' | 'client_name'>[]
  /** Set when the orders read itself failed — an empty list here must never
   *  be read as "nothing in flight" (CLAUDE.md house rule 1). */
  error?: string | null
  limit?: number
  linkBase?: string
}) {
  const nameOf = new Map(referrals.map((r) => [r.id, r.client_name]))
  const live = orders
    .filter((o) => !isRejected(o) && maturity(o).state !== 'matured')
    .sort((a, b) => (b.ordered_on ?? '').localeCompare(a.ordered_on ?? ''))

  return (
    <Card>
      <CardHead
        title="Live orders"
        hint="Placed for your clients, not yet delivered"
        action={
          <Link href={linkBase} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Track all orders <ArrowRight size={12} />
          </Link>
        }
      />
      {error ? (
        <div className="p-4">
          <Problem title="Live orders could not load" detail={error} />
        </div>
      ) : live.length === 0 ? (
        <Empty
          title="Nothing in flight"
          body="Every order Material Depot has sent us a delivery date for has arrived. New orders show up here the moment they are placed."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Order</Th>
                <Th>Placed</Th>
                <Th className="text-right">Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {live.slice(0, limit).map((o) => (
                <tr key={o.id}>
                  <Td className="max-w-[140px] truncate">
                    <Link href={`/referrals?client=${o.referral_id}`} className="hover:underline">
                      {nameOf.get(o.referral_id) ?? 'Unknown client'}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs text-ink-soft" title={o.md_enq_id}>
                    {o.md_enq_id}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-soft">{date(o.ordered_on)}</Td>
                  <Td className="tnum text-right">{inr(o.order_value)}</Td>
                  <Td>
                    <OrderStatus order={o} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {live.length > limit ? (
            <div className="border-t border-line px-4 py-2 text-right">
              <Link href={linkBase} className="text-xs font-medium text-brand hover:underline">
                {live.length - limit} more in flight →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

/**
 * One order's status, in the order a partner actually needs to know it:
 * whether an admin has declined it outright, then whether we have even
 * checked it, then whether anything is blocking delivery, then what Material
 * Depot's own feed last called it. `approval_status` and `maturity()` are
 * structured facts this app already trusts; `order.status` is a free-text
 * string from a fourth system (`docs/referrals.md`) and is shown as a
 * caption underneath rather than driving the badge's colour — this app has
 * no fixed vocabulary for it to match against.
 *
 * `rejected` is checked FIRST and returns early. A declined order (a
 * duplicate sync, a wrong attribution) has `delivered_on` null forever — it
 * is never coming back round to "delivered" — so falling through to
 * `maturity()` for one, as an earlier version of this component did, renders
 * "Awaiting a delivery date" against an order that is not awaiting anything.
 * The reason comes from the same Appendix B codes the rewards ledger already
 * uses (`lib/domain/reasons.ts`), not a new vocabulary.
 */
export function OrderStatus({ order }: { order: LedgerOrder }) {
  if (order.approval_status === 'rejected') {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge tone="bad">Not counted</Badge>
        <span className="text-[11px] text-ink-faint">{explain(ORDER_NOT_COUNTED, order.not_counted_reason)}</span>
      </div>
    )
  }

  const m = maturity(order)
  const tone: Tone =
    order.approval_status === 'pending'
      ? 'neutral'
      : m.state === 'held'
        ? 'bad'
        : m.state === 'matured' || m.state === 'maturing'
          ? 'good'
          : 'warn'
  const label =
    order.approval_status === 'pending'
      ? 'Being checked'
      : m.state === 'held'
        ? 'Escalation open'
        : m.state === 'matured' || m.state === 'maturing'
          ? `Delivered ${date(m.on)}`
          : 'Awaiting a delivery date'

  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={tone}>{label}</Badge>
      {order.status ? <span className="text-[11px] text-ink-faint">{order.status}</span> : null}
    </div>
  )
}

/** An order an admin has declined is settled, not "in flight" — it belongs
 *  neither in the live-orders panel nor the delivered bucket. */
export function isRejected(order: LedgerOrder) {
  return order.approval_status === 'rejected'
}
