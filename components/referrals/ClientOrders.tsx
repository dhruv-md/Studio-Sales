import { maturity, standing, standingSentence, type LedgerOrder } from '@/lib/domain/ledger'
import { Badge, Empty, Table, Td, Th, type Tone } from '@/components/ui'
import { date, inr } from '@/lib/format'

/**
 * §9.3C — the orders table on a client's record.
 *
 * "Order ID, Enquiry ID, date, value, GST entity billed, coupon applied and
 * discount availed, attribution status (Pending approval / Counted / Not counted
 * with reason), maturation status and date, fulfilment status, invoice link."
 *
 * The attribution column is the one that matters. A partner looking at ₹1,42,000
 * of their client's money that is not in their total wants one of three
 * sentences, and "—" is not one of them: it counts, it is being checked, or it
 * does not count and here is why. `standingSentence()` derives that from the
 * Appendix B reason code so the wording cannot drift between screens.
 */
export function ClientOrders({ orders, today }: { orders: LedgerOrder[]; today: string }) {
  if (!orders.length) {
    return <Empty title="No orders yet" body="Their orders will show here as they are placed, with what each one earned you." />
  }

  return (
    <Table className="min-w-[720px]">
      <thead>
        <tr>
          <Th>Enquiry</Th>
          <Th>Placed</Th>
          <Th>Store</Th>
          <Th>Coupon</Th>
          <Th>Counting?</Th>
          <Th>Matures</Th>
          <Th className="text-right">Value</Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const s = standing(o, today)
          const m = maturity(o, today)
          const counts = s.state === 'counted'
          return (
            <tr key={o.id} className={s.state === 'pre_programme' || s.state === 'excluded' ? 'opacity-70' : undefined}>
              {/* The enquiry id gets the room its real length needs. A truncated
                  ENQ… is not a shortened number, it is a different one to
                  anyone reading it off the screen. */}
              <Td className="font-mono text-[11px]" title={o.md_enq_id}>{o.md_enq_id}</Td>
              <Td className="text-xs whitespace-nowrap text-ink-soft">{date(o.ordered_on)}</Td>
              <Td className="text-xs text-ink-soft">{o.store ?? '—'}</Td>
              <Td className="font-mono text-[11px] text-ink-soft">
                {o.coupon_code ?? <span className="text-ink-faint">—</span>}
              </Td>
              <Td>
                <span title={standingSentence(s) ?? undefined}>
                  <Badge tone={TONE[s.state]}>{LABEL(s.state)}</Badge>
                </span>
              </Td>
              <Td className="text-xs whitespace-nowrap text-ink-soft">
                {m.state === 'matured'
                  ? date(m.on)
                  : m.state === 'maturing'
                    ? `${m.daysLeft}d to go`
                    : m.state === 'held'
                      ? 'held — escalation open'
                      : '—'}
              </Td>
              <Td className={`tnum text-right text-xs font-medium ${counts ? '' : 'text-ink-faint'}`}>
                {inr(o.order_value)}
              </Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

const TONE: Record<string, Tone> = {
  counted: 'good',
  accruing: 'warn',
  pending: 'info',
  pre_programme: 'neutral',
  excluded: 'neutral',
}

function LABEL(state: string) {
  switch (state) {
    case 'counted': return 'Counted'
    case 'accruing': return 'Maturing'
    case 'pending': return 'Being checked'
    case 'pre_programme': return 'Pre-programme'
    default: return 'Not counted'
  }
}

/**
 * The line under the table. Pre-programme orders are §15's most likely month-one
 * dispute, so if any of this client's orders are one, it is said in a sentence
 * rather than left to a grey chip.
 */
export function OrdersFooter({ orders, today, goLive }: { orders: LedgerOrder[]; today: string; goLive: string }) {
  const pre = orders.filter((o) => standing(o, today, goLive).state === 'pre_programme')
  const held = orders.filter((o) => maturity(o, today).state === 'held')
  const noDelivery = orders.filter(
    (o) => standing(o, today, goLive).state === 'accruing' && maturity(o, today).state === 'unknown',
  )
  if (!pre.length && !held.length && !noDelivery.length) return null

  return (
    <div className="space-y-1 border-t border-line px-4 py-2 text-[11px] leading-relaxed text-ink-faint">
      {pre.length ? (
        <p>
          {pre.length} order{pre.length === 1 ? ' was' : 's were'} placed before the incentive programme started on{' '}
          {date(goLive)}. {pre.length === 1 ? 'It is' : 'They are'} shown here because it is their history with us, and{' '}
          {pre.length === 1 ? 'it carries' : 'they carry'} no reward value.
        </p>
      ) : null}
      {held.length ? (
        <p>
          {held.length} order{held.length === 1 ? ' has' : 's have'} an open escalation, which holds{' '}
          {held.length === 1 ? 'it' : 'them'} back from maturing until it is closed.
        </p>
      ) : null}
      {noDelivery.length ? (
        <p>
          {noDelivery.length} order{noDelivery.length === 1 ? '' : 's'} {noDelivery.length === 1 ? 'is' : 'are'}{' '}
          verified and waiting on a delivery date from us — the 7-day clock starts from delivery, so we cannot show you
          a maturity date until we have one.
        </p>
      ) : null}
    </div>
  )
}
