import { AlertTriangle, Clock, Gift, Info, TrendingUp } from 'lucide-react'
import type { PeriodStanding } from '@/lib/domain/ledger'
import {
  MILESTONE_ICON, MILESTONE_LABEL, MILESTONE_PHRASE, MONTHLY_SLABS, QUARTERLY_SLABS, type Slab,
} from '@/lib/domain/slabs'
import { daysLeftIn, todayIST } from '@/lib/domain/periods'
import { Badge, Card, Progress } from '@/components/ui'
import { inr, inrShort, pct } from '@/lib/format'

/**
 * "This month" and "This quarter" — PRD §10.5.1 and §10.5.2.
 *
 * The one thing this screen must never do is show a number a partner cannot
 * reconcile. So every figure on it is accompanied by what it is made of: the
 * slab, the rate, the spend it was applied to, and what has already been taken
 * at the till. §10.5.1 asks for "a breakdown showing what is already realised at
 * store versus what is accruing as cashback and gift", and that is the honest
 * framing of a programme where most of the value never reaches the ledger.
 */
export function SlabProgress({
  standing,
  kind,
  today = todayIST(),
}: {
  standing: PeriodStanding
  kind: 'month' | 'quarter'
  today?: string
}) {
  const { cashback, slab, next, gap, period } = standing
  const left = daysLeftIn(period, today)
  const noun = kind === 'month' ? 'month' : 'quarter'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            This {noun} · {period.label}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {kind === 'month'
              ? 'The incentive programme runs on calendar months. It resets on the 1st.'
              : 'Runs alongside the monthly programme on the same spend. The two are additive, not either/or.'}
          </p>
        </div>
        <Badge tone={left === 0 ? 'neutral' : left <= 5 ? 'warn' : 'info'}>
          <Clock size={11} />
          {left === 0 ? `${noun} closed` : `${left} day${left === 1 ? '' : 's'} left`}
        </Badge>
      </div>

      <div className="px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
              Counting towards this {noun}
            </div>
            <div className="tnum mt-0.5 font-display text-[30px] leading-none font-semibold text-ink">
              {inr(standing.spend)}
            </div>
            <div className="mt-1 text-xs text-ink-faint">
              {standing.orders.length} order{standing.orders.length === 1 ? '' : 's'}
              {standing.maturingCount > 0 ? (
                <>
                  {' · '}
                  <span className="text-warn">
                    {inrShort(standing.provisionalSpend)} still maturing
                  </span>
                </>
              ) : standing.orders.length ? (
                ' · all confirmed'
              ) : null}
            </div>
          </div>
          <SlabChip slab={slab} belowEntry={standing.belowEntry} above={standing.aboveLadder} />
        </div>

        <div className="mt-4">
          <Ladder standing={standing} />
        </div>

        {/* The gap, in rupees, as a sentence. §10.5.1's example is
            "₹68,000 more to reach 3% cashback and the Silver Coin" — the number
            AND what it buys, because a bare gap is a target with no reward. */}
        {next && gap > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">
            <TrendingUp size={15} className="mt-0.5 shrink-0 text-brand" />
            <span>
              <strong className="tnum font-semibold">{inr(gap)} more</strong> this {noun} reaches{' '}
              {next.cashbackPct > 0 ? `${pct(next.cashbackPct, next.cashbackPct % 1 ? 1 : 0)} cashback` : next.reward}
              {next.milestone ? ` and ${MILESTONE_PHRASE[next.milestone]}` : ''}
              {next.giftValue > 0 && !next.milestone ? ` and a ${inr(next.giftValue)} gift` : ''}.
            </span>
          </p>
        ) : null}

        {standing.belowEntry ? (
          // §10.2: "Spend below ₹50,000 in a month earns nothing under this
          // programme. The dashboard must say so plainly rather than showing an
          // empty rewards tab."
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink-soft">
            <Info size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            <span>
              {kind === 'month' ? (
                <>
                  The monthly programme starts at ₹50,001. Below that there is no cashback and no gift — the retail
                  discount your clients take at the till still applies.
                </>
              ) : (
                <>
                  The quarterly programme starts at ₹25,00,001 and pays an experience rather than cashback. Below that
                  it pays nothing — your monthly cashback and gifts are unaffected and carry on as normal.
                </>
              )}
            </span>
          </p>
        ) : null}

        {standing.aboveLadder ? (
          // §17 decision 4. Showing a rate here would be inventing one.
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-ink">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
            <span>
              You are past the top published slab. Rates above {inr(1000000)} a month have not been set yet — your key
              account manager will confirm what this {noun} earns rather than us showing you a figure we would have to
              change.
            </span>
          </p>
        ) : null}
      </div>

      {slab && !standing.aboveLadder ? <Breakdown standing={standing} kind={kind} /> : null}
    </Card>
  )
}

function SlabChip({ slab, belowEntry, above }: { slab: Slab | null; belowEntry: boolean; above: boolean }) {
  if (above && slab) {
    return (
      <div className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-right">
        <div className="text-[11px] font-medium text-warn uppercase">Above the ladder</div>
        <div className="font-display text-sm font-semibold text-ink">Rate being confirmed</div>
      </div>
    )
  }
  if (!slab) {
    return (
      <div className="rounded-lg border border-line bg-raised px-3 py-2 text-right">
        <div className="text-[11px] font-medium text-ink-faint uppercase">Slab</div>
        <div className="font-display text-sm font-semibold text-ink-soft">
          {belowEntry ? 'Not reached yet' : '—'}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-brand-line bg-brand-soft px-3 py-2 text-right">
      <div className="text-[11px] font-medium text-brand uppercase">Slab reached</div>
      <div className="font-display text-sm font-semibold text-ink">{slab.bandLabel}</div>
      {slab.milestone ? (
        <div className="mt-0.5 text-xs text-ink-soft">
          {MILESTONE_ICON[slab.milestone]} {MILESTONE_LABEL[slab.milestone]}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The whole ladder as one bar, with every band marked.
 *
 * Not a bar for the current band only. §18's mitigation for "monthly slab resets
 * demotivate mid-sized partners" is to make the effort visible, and a partner
 * who can see that the next two bands are close together behaves differently
 * from one who can only see the next one.
 */
function Ladder({ standing }: { standing: PeriodStanding }) {
  const { slab, spend } = standing
  const bands = standing.period.kind === 'month' ? MONTHLY_SLABS : QUARTERLY_SLABS
  // The quarterly ladder's top band is open-ended, so the bar is scaled to its
  // FLOOR rather than to a ceiling that does not exist. A partner past it is
  // pinned at 100%, which is the truthful rendering of "off the top".
  const top = bands[bands.length - 1]?.ceiling ?? bands[bands.length - 1]?.floor ?? 0
  const filled = top > 0 ? Math.min(100, (spend / top) * 100) : 0

  return (
    <div>
      <Progress pct={filled} tone={slab?.milestone === 'gold_coin' ? 'gold' : slab?.milestone === 'silver_coin' ? 'silver' : 'brand'} />
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {bands.map((b) => {
          const reached = spend >= b.floor
          const current = slab?.id === b.id
          return (
            <div
              key={b.id}
              className={[
                'rounded-lg border px-2 py-1.5 text-[11px] leading-tight transition',
                current
                  ? 'border-brand bg-brand-soft text-ink'
                  : reached
                    ? 'border-good-soft bg-good-soft text-ink'
                    : 'border-line bg-surface text-ink-faint',
              ].join(' ')}
            >
              <div className="font-medium">{b.bandLabel}</div>
              <div className="mt-0.5">
                {b.cashbackPct > 0 ? `${pct(b.cashbackPct, b.cashbackPct % 1 ? 1 : 0)} cashback` : b.reward}
                {b.milestone ? ` · ${MILESTONE_ICON[b.milestone]}` : b.giftValue > 0 ? ` · ${inrShort(b.giftValue)} gift` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * §10.5.1's breakdown, and the place the governing formula is shown rather than
 * hidden:
 *
 *     Net cashback = (slab rate × qualifying spend) − store discount availed
 *
 * The "unknown discount" branch is the important one. §10.4 makes per-order
 * coupon capture a hard Phase 1 dependency and §18 says the fallback is gross
 * cashback WITH the gap stated — never a silent approximation. So when the
 * discount data is missing, the net figure is withheld and the reason is on
 * screen, rather than a net figure being quietly computed as if no discount had
 * been taken.
 */
function Breakdown({ standing, kind }: { standing: PeriodStanding; kind: 'month' | 'quarter' }) {
  const c = standing.cashback
  const slab = c.slab
  if (!slab) return null
  const noun = kind === 'month' ? 'month' : 'quarter'

  return (
    <div className="border-t border-line bg-raised px-4 py-3">
      <h3 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        How this {noun} adds up
      </h3>

      {kind === 'month' ? (
        <dl className="mt-2 space-y-1.5 text-sm">
          <Line
            label={`Cashback · ${pct(slab.cashbackPct, slab.cashbackPct % 1 ? 1 : 0)} of ${inr(c.spend)}`}
            value={inr(c.gross)}
          />
          <Line
            label="Less the store discount your clients already took"
            value={c.discountKnown ? `− ${inr(c.discountAvailed)}` : 'not yet known'}
            tone={c.discountKnown ? undefined : 'warn'}
          />
          <div className="!mt-2 flex items-baseline justify-between border-t border-line pt-2">
            <dt className="text-sm font-semibold text-ink">Net cashback</dt>
            <dd className="tnum font-display text-base font-semibold text-good">
              {c.net === null ? '—' : inr(c.net)}
            </dd>
          </div>
        </dl>
      ) : null}

      {c.giftValue > 0 ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
          <Gift size={15} className="mt-0.5 shrink-0 text-brand" />
          <span>
            <strong className="text-ink">{inr(c.giftValue)}</strong> in gift value
            {slab.milestone ? ` — ${MILESTONE_PHRASE[slab.milestone]}` : ''}
            {kind === 'month' ? (
              <span className="text-ink-faint">
                {' '}
                · fixed for this slab, so it does not grow with spend inside the band
              </span>
            ) : (
              <span className="text-ink-faint"> · {slab.reward}</span>
            )}
          </span>
        </p>
      ) : null}

      {!c.discountKnown ? (
        <p className="mt-2 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-xs leading-relaxed text-ink-soft">
          <strong className="text-warn">We cannot state your net cashback yet.</strong>{' '}
          {c.ordersMissingDiscount} of this {noun}&rsquo;s orders have not come through with the coupon that was applied
          at the till, and the net figure is the cashback less exactly that. The gross figure above is real; the
          deduction is the part we are missing. Your key account manager is chasing it, and we would rather show you a
          gap than a number we would have to take back.
        </p>
      ) : null}

      {standing.maturingCount > 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          <strong className="text-ink-soft">Provisional.</strong> An order counts 7 days after it is delivered, so
          nothing is settled while there is still time for a return. {standing.maturingCount} order
          {standing.maturingCount === 1 ? '' : 's'} in this {noun}
          {standing.maturingCount === 1 ? ' is' : ' are'} still inside that window.
        </p>
      ) : null}
    </div>
  )
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`tnum shrink-0 font-medium ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
