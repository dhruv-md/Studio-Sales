'use client'

import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import {
  MILESTONE_ICON, MILESTONE_LABEL, MONTHLY_SLABS, QUARTERLY_SLABS, cashbackFor, positionIn, type Slab,
} from '@/lib/domain/slabs'
import { Badge, Card, CardHead, Field, Input, Table, Td, Th } from '@/components/ui'
import { inr, inrShort } from '@/lib/format'

/**
 * "Compare that for different amounts of sales" — a calculator plus the full
 * ladder side by side, so a partner can grab one number ("if we do this much
 * business, this is what we get back") without doing the arithmetic
 * themselves.
 *
 * Every figure here goes through the same `positionIn()` / `cashbackFor()` the
 * real Rewards tabs use, on a hypothetical spend instead of the partner's
 * actual one this period — so it can never quietly drift from what the real
 * ladder pays out. This is presentation only; nothing here writes anything or
 * changes a real accrual.
 */
export function RewardCompare() {
  const [monthlySpend, setMonthlySpend] = useState(200_000)
  const [quarterlySpend, setQuarterlySpend] = useState(3_000_000)

  const monthly = useMemo(
    () => cashbackFor(monthlySpend, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 }),
    [monthlySpend],
  )
  const monthlyPos = useMemo(() => positionIn(monthlySpend, MONTHLY_SLABS), [monthlySpend])
  const quarterlyPos = useMemo(() => positionIn(quarterlySpend, QUARTERLY_SLABS), [quarterlySpend])
  const quarterlySlab = quarterlyPos.kind === 'in' || quarterlyPos.kind === 'above' ? quarterlyPos.slab : null

  return (
    <div className="space-y-5">
      <Card>
        <CardHead
          title="If you did this much business with us"
          hint="Type a hypothetical month and quarter to see what each would pay — no order of yours is used here."
        />
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label="A month's referred, verified sales">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={monthlySpend}
                onChange={(e) => setMonthlySpend(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            {monthlyPos.kind === 'below' ? (
              <p className="text-sm text-ink-soft">
                Below ₹{new Intl.NumberFormat('en-IN').format(monthlyPos.next.floor)} — nothing earned yet this month.
              </p>
            ) : monthlyPos.kind === 'above' ? (
              <p className="text-sm text-ink-soft">
                Past the published ladder. The rate above ₹10,00,000 a month is still being confirmed, so nothing is
                shown rather than a guessed number.
              </p>
            ) : (
              <div className="space-y-1 text-sm">
                <Row label="Slab" value={monthly.slab?.bandLabel ?? '—'} />
                <Row label="Cashback" value={`${monthly.slab?.cashbackPct ?? 0}% · ${inr(monthly.gross)}`} tone="good" />
                <Row label="Gift" value={monthly.giftValue ? inr(monthly.giftValue) : 'None at this slab'} />
                {monthly.milestone ? (
                  <Row label="Also unlocks" value={`${MILESTONE_ICON[monthly.milestone]} ${MILESTONE_LABEL[monthly.milestone]}`} />
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Field label="A quarter's referred, verified sales">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={10_000}
                value={quarterlySpend}
                onChange={(e) => setQuarterlySpend(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            {quarterlyPos.kind === 'below' ? (
              <p className="text-sm text-ink-soft">
                Below ₹{new Intl.NumberFormat('en-IN').format(quarterlyPos.next.floor)} — the quarterly experience
                rewards start above that.
              </p>
            ) : (
              <div className="space-y-1 text-sm">
                <Row label="Slab" value={quarterlySlab?.bandLabel ?? '—'} />
                <Row label="Reward" value={quarterlySlab?.reward ?? '—'} tone="good" />
                <Row label="Worth roughly" value={quarterlySlab ? inr(quarterlySlab.giftValue) : '—'} />
              </div>
            )}
          </div>
        </div>
        <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
          <Calculator size={12} /> Calculated from the same published rates as the rest of this page — nothing here is
          a separate promise.
        </p>
      </Card>

      <LadderTable title="The monthly ladder" hint="Cashback + a fixed gift, resets on the 1st." slabs={MONTHLY_SLABS} highlight={monthlyPos.kind === 'in' || monthlyPos.kind === 'above' ? monthlyPos.slab.id : null} />
      <LadderTable title="The quarterly ladder" hint="On top of the monthly programme — the two add together." slabs={QUARTERLY_SLABS} highlight={quarterlySlab?.id ?? null} />
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-faint">{label}</span>
      <span className={tone === 'good' ? 'font-semibold text-good' : 'font-medium text-ink'}>{value}</span>
    </div>
  )
}

function LadderTable({ title, hint, slabs, highlight }: { title: string; hint: string; slabs: Slab[]; highlight: number | null }) {
  return (
    <Card>
      <CardHead title={title} hint={hint} />
      <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <thead>
            <tr>
              <Th>Band</Th>
              <Th className="text-right">Cashback</Th>
              <Th className="text-right">Gift</Th>
              <Th>What you get</Th>
              <Th className="text-right">Max at the top</Th>
            </tr>
          </thead>
          <tbody>
            {slabs.map((s) => (
              <tr key={s.id} className={s.id === highlight ? 'bg-brand-soft/40' : undefined}>
                <Td className="font-medium">
                  {s.bandLabel}
                  {s.id === highlight ? <Badge tone="brand" className="ml-2">Your figure</Badge> : null}
                </Td>
                <Td className="tnum text-right">{s.cashbackPct}%</Td>
                <Td className="tnum text-right">{s.giftValue ? inrShort(s.giftValue) : '—'}</Td>
                <Td className="text-ink-soft">{s.reward}</Td>
                <Td className="tnum text-right">{s.maxAdvantage !== null ? inrShort(s.maxAdvantage) : 'Open-ended'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  )
}
