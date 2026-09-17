import Link from 'next/link'
import type { LedgerRow } from '@/lib/domain/ledger'
import { Badge, Card, CardHead, Empty, Table, Td, Th, type Tone } from '@/components/ui'
import { date, inr, pct } from '@/lib/format'

/**
 * The ledger — PRD §10.5.4.
 *
 * "Every accrual and reversal as a row: period, date, order ID, client, order
 * value, coupon and discount availed, slab applied, cashback rate, gross
 * cashback, store discount deducted, net cashback, gift value, status,
 * maturation date."
 *
 * That is thirteen columns, and the instinct is to cut it to five. It is the
 * wrong instinct here. §10.7 says every entry is immutable and corrections are
 * new offsetting entries, §18 rates "reward numbers don't match finance" as
 * Critical, and the thing that makes a partner ring their KAM is not a big
 * number or a small one — it is a number with no working shown. A partner who
 * can follow the arithmetic checks it themselves.
 *
 * The one column that is deliberately NOT a number is the discount. A null
 * discount renders as "not sent", never as ₹0 — see `discountOn()` in
 * lib/domain/ledger.ts for why that distinction is worth a column.
 */
export function RewardLedger({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) {
    return (
      <Card>
        <CardHead title="Statement" hint="Every order, and exactly what it earned" />
        <Empty
          title="Nothing on the statement yet"
          body="Once a client you referred places an order and we have verified it, it appears here with the slab it counted towards and the cashback it earned."
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHead
        title="Statement"
        hint="Every order, the slab it counted towards, and the arithmetic behind the cashback. Nothing here is rounded for display."
      />
      <Table className="min-w-[1080px]">
        <thead>
          <tr>
            <Th>Month</Th>
            <Th>Order</Th>
            <Th>Client</Th>
            <Th>Placed</Th>
            <Th className="text-right">Order value</Th>
            <Th>Coupon</Th>
            <Th className="text-right">Discount taken</Th>
            <Th>Slab</Th>
            <Th className="text-right">Rate</Th>
            <Th className="text-right">Gross</Th>
            <Th className="text-right">Net cashback</Th>
            <Th>Matures</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.order.id} className={r.status === 'excluded' ? 'opacity-60' : undefined}>
              <Td className="whitespace-nowrap text-ink-soft">{r.periodLabel}</Td>
              <Td className="font-mono text-xs" title={r.order.md_enq_id}>
                {r.order.md_enq_id}
              </Td>
              <Td className="max-w-[160px] truncate" title={r.clientName}>
                {r.clientName}
              </Td>
              <Td className="whitespace-nowrap text-ink-soft">{date(r.orderedOn)}</Td>
              <Td className="tnum text-right font-medium">{inr(r.value)}</Td>
              <Td className="font-mono text-[11px] text-ink-soft">{r.couponCode ?? '—'}</Td>
              <Td className="tnum text-right">
                {r.discountAvailed === null ? (
                  // Not a zero. The whole net-cashback figure depends on this
                  // number, and a dash that means "we have not been told" is
                  // the only honest rendering of a missing one.
                  <span className="text-warn" title="Material Depot has not sent the coupon applied to this order yet, so the net figure cannot be worked out.">
                    not sent
                  </span>
                ) : (
                  inr(r.discountAvailed)
                )}
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{r.slab?.bandLabel ?? '—'}</Td>
              <Td className="tnum text-right text-ink-soft">
                {r.cashbackPct === null ? '—' : pct(r.cashbackPct, r.cashbackPct % 1 ? 1 : 0)}
              </Td>
              <Td className="tnum text-right text-ink-soft">{r.grossCashback === null ? '—' : inr(r.grossCashback)}</Td>
              <Td className="tnum text-right font-medium">
                {r.netCashback === null ? <span className="text-ink-faint">—</span> : inr(r.netCashback)}
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">
                {/* A row that counts towards nothing has no maturity date to
                    report. It said "awaiting delivery" against a pre-programme
                    order that was delivered in June, which reads as a promise
                    that it will eventually count. */}
                {r.status === 'excluded'
                  ? '—'
                  : r.maturity.state === 'matured'
                    ? date(r.maturity.on)
                    : r.maturity.state === 'maturing'
                      ? `${date(r.maturity.on)} · ${r.maturity.daysLeft}d`
                      : r.maturity.state === 'held'
                        ? 'on hold'
                        : 'awaiting delivery'}
              </Td>
              <Td>
                <StatusChip row={r} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="space-y-1 border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint">
        <p>
          <strong className="text-ink-soft">Provisional</strong> means the slab is set but the order has not matured —
          it counts 7 days after delivery, so a return has time to land first.{' '}
          <strong className="text-ink-soft">Confirmed</strong> means it has, and it is ready for settlement.
        </p>
        <p>
          Gift value sits against the month, not against an order, because it is a fixed amount for the slab reached
          rather than a share of any one sale. It is shown on the month above.
        </p>
      </div>
    </Card>
  )
}

function StatusChip({ row }: { row: LedgerRow }) {
  const TONE: Record<LedgerRow['status'], Tone> = {
    confirmed: 'good',
    provisional: 'warn',
    settled: 'good',
    reversed: 'bad',
    excluded: 'neutral',
  }
  const LABEL: Record<LedgerRow['status'], string> = {
    confirmed: 'Confirmed',
    provisional: row.standing.state === 'pending' ? 'Being checked' : 'Provisional',
    settled: 'Settled',
    reversed: 'Reversed',
    excluded: row.standing.state === 'pre_programme' ? 'Pre-programme' : 'Not counted',
  }
  return (
    <span title={row.note ?? undefined}>
      <Badge tone={TONE[row.status]}>{LABEL[row.status]}</Badge>
    </span>
  )
}

/**
 * §10.5.6 — "Plain-language explanation of what counts, what doesn't, the
 * 7-day maturation rule, the coupon deduction, the approval process, reversal
 * policy, tax treatment, and the dispute route. Versioned — partners see the
 * version applicable to their accrual period."
 *
 * Written as prose and not as a table of clauses on purpose. The audience is an
 * architect being asked to change where they buy, and the single most likely
 * month-one dispute (§18) is somebody expecting last quarter's business to
 * count. That is a sentence, not a clause.
 */
export function ProgrammeTerms({ goLive, version }: { goLive: string; version: string }) {
  return (
    <Card>
      <CardHead
        title="How the programme works"
        hint={`Version ${version}. These are the terms your current accruals are computed under.`}
      />
      <div className="space-y-4 px-4 py-4 text-sm leading-relaxed text-ink-soft">
        <Term title="What counts">
          Orders placed by clients you have referred to us, once a Material Depot admin has verified that the order
          belongs to you. Both things are needed: an order from one of your clients that has not been verified yet is
          shown to you, greyed, and counts towards nothing until it is.
        </Term>
        <Term title="When the programme started">
          {date(goLive)}. Only orders placed on or after that date earn anything. Business you did with us before it is
          real and you will see it in your client timelines, labelled <em>Pre-programme</em>, carrying no reward value.
          We would rather tell you that now than in an argument at the end of a good month.
        </Term>
        <Term title="The 7-day rule">
          An order counts 7 days after it is delivered. That window exists so a return or a damaged delivery is
          settled before anyone is paid on it. While an order is inside the window your month shows as{' '}
          <em>provisional</em>; when every order in a month has cleared it, the month is <em>confirmed</em>. If you
          raise an escalation against an order, that order stays provisional until the escalation is closed.
        </Term>
        <Term title="Cashback, and the deduction">
          Your slab is set by what your clients spent in the calendar month, across every GST entity linked to your
          firm. The cashback rate for that slab is applied to the actual spend, not to the top of the band. From it we
          deduct the additional store discount your clients already took at the till on those same orders — that value
          has already reached you, in the price they paid. If the discounts taken come to more than the cashback due,
          the cashback is zero. It never goes negative.
        </Term>
        <Term title="Gifts">
          A fixed amount for the slab you reach, not a percentage of what you spent. Reaching ₹2,10,000 in a month earns
          the same gift as reaching ₹4,90,000. Gifts and experiential rewards are arranged by Material Depot; the
          dashboard tracks where yours has got to.
        </Term>
        <Term title="If something is reversed">
          A cancellation or return before an order matures removes it and the month is recomputed, which can move you
          down a slab. After a reward has been settled, a reversal is written as a separate offsetting entry and
          adjusted in the next cycle. Nothing already on your statement is ever edited — corrections are new rows, so
          you can always see what changed.
        </Term>
        <Term title="Tax">
          Incentives to business partners in India may attract TDS under Section 194R, and gifts in kind carry GST
          implications. Your statement shows the gross reward, any TDS deducted and the net. Material Depot&rsquo;s
          finance team is the right route for anything specific to your entity.
        </Term>
        <Term title="If you disagree with something">
          Raise it with your key account manager, whose details are on your Overview. Attribution disputes go to a
          Material Depot admin for arbitration, and the decision and its reason are recorded against the order so you
          can see what was decided and why.
        </Term>
      </div>
    </Card>
  )
}

function Term({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1">{children}</p>
    </div>
  )
}
