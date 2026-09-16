'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ExternalLink, Globe, ShieldCheck, X } from 'lucide-react'
import {
  Badge, Button, Card, CardHead, Empty, Field, Problem, Select, Table, Td, Textarea, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { approveOrderAndNotify, reviewOrder, reviewPortfolio } from '@/lib/data/console-actions'
import type { OrderWithOwner, PortfolioWithFirm } from '@/lib/data/console-queries'
import {
  codeLabel, ORDER_NOT_COUNTED_CODES, PORTFOLIO_REJECTION_CODES, type OrderNotCounted,
} from '@/lib/domain/reasons'
import { date, inr } from '@/lib/format'
import { marketLabel } from '@/lib/domain/markets'

type Tab = 'orders' | 'portfolio'

/**
 * The admin's verification desk.
 *
 * Two queues, one screen, because they are the same job: something a partner has
 * put in front of Material Depot that needs a person to say yes to. An order is
 * the one that costs money — it is what the reward ladder is computed from — so
 * it is first and it is the default tab.
 *
 * Rejecting always asks for a reason. An unexplained rejection turns into a
 * phone call to a KAM who has no idea either.
 */
export function ApprovalQueue({
  orders,
  portfolio,
  canDecide,
  ordersError,
  portfolioError,
}: {
  orders: OrderWithOwner[]
  portfolio: PortfolioWithFirm[]
  canDecide: boolean
  ordersError?: string | null
  portfolioError?: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('orders')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [rejecting, setRejecting] = useState<
    { kind: Tab; id: string; label: string } | null
  >(null)

  const pendingOrders = orders.filter((o) => o.approval_status === 'pending')
  const decidedOrders = orders.filter((o) => o.approval_status !== 'pending').slice(0, 25)
  const pendingWork = portfolio.filter((p) => p.status === 'submitted')
  const publishedWork = portfolio.filter((p) => p.status === 'published').slice(0, 25)

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error)
      done?.()
      router.refresh()
    })
  }

  function reject(note: string, code: string) {
    if (!rejecting) return
    const { kind, id } = rejecting
    run(
      () =>
        kind === 'orders'
          ? reviewOrder(id, 'rejected', note, code as OrderNotCounted)
          : reviewPortfolio(id, 'rejected', `${codeLabel(code)}. ${note}`.trim()),
      () => setRejecting(null),
    )
  }

  return (
    <>
      {error ? <div className="mb-4"><Problem title="That did not go through" detail={error} /></div> : null}
      {!canDecide ? (
        <div className="mb-4 rounded-[var(--radius-card)] border border-info-soft bg-info-soft px-4 py-3 text-sm text-ink-soft">
          You can see what is waiting, but only an admin can verify it. The database enforces that too —
          the approve button would be refused, not just hidden.
        </div>
      ) : null}

      <div className="mb-4 flex gap-1 rounded-lg bg-raised p-1">
        {([
          ['orders', `Orders (${pendingOrders.length})`],
          ['portfolio', `Portfolio (${pendingWork.length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`h-8 flex-1 rounded-md text-sm font-medium transition ${
              tab === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? (
        <div className="space-y-5">
          <Card>
            <CardHead
              title="Orders waiting to be verified"
              hint="Placed by a referred client. Nothing counts towards a partner's rewards until it is approved here."
            />
            {ordersError ? (
              <div className="p-4"><Problem title="Orders did not load" detail={ordersError} /></div>
            ) : pendingOrders.length === 0 ? (
              <Empty title="Nothing waiting" body="Every referred order has been looked at." />
            ) : (
              <ul className="divide-y divide-line">
                {pendingOrders.map((o) => {
                  const firm = o.referral?.partner
                  return (
                    <li key={o.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">
                          <span className="font-semibold">{o.referral?.client_name ?? 'An unnamed client'}</span>
                          {' placed an order '}
                          {o.store ? <>at {o.store} </> : null}
                          <span className="text-ink-soft">
                            — referred by{' '}
                            {firm ? (
                              <Link href={`/console/partners/${firm.id}`} className="font-medium text-brand hover:underline">
                                {firm.firm_name}
                              </Link>
                            ) : (
                              'a firm that is no longer on the platform'
                            )}
                          </span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-faint">
                          {/* Full length, never truncated. A shortened ENQ id is
                              not a shorter number, it is a different one. */}
                          <span className="font-mono" title={o.md_enq_id}>{o.md_enq_id}</span>
                          <span>·</span>
                          <span>{date(o.ordered_on)}</span>
                          {o.status ? <><span>·</span><span>{o.status}</span></> : null}
                          {firm?.market ? <><span>·</span><span>{marketLabel(firm.market)}</span></> : null}
                          {o.referral?.md_phone ? <><span>·</span><span className="tnum">{o.referral.md_phone}</span></> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tnum font-display text-[15px] font-semibold text-ink">
                          {inr(o.order_value)}
                        </span>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!canDecide || pending}
                          onClick={() =>
                            run(() =>
                              firm
                                ? approveOrderAndNotify(
                                    o.id,
                                    firm.id,
                                    `Order ${o.md_enq_id} verified`,
                                    null,
                                  )
                                : reviewOrder(o.id, 'approved'),
                            )
                          }
                        >
                          <Check size={13} /> Verify
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canDecide || pending}
                          onClick={() => setRejecting({ kind: 'orders', id: o.id, label: o.md_enq_id })}
                        >
                          <X size={13} /> Reject
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {decidedOrders.length ? (
            <Card>
              <CardHead title="Recently decided" hint="The last 25" />
              <Table>
                <thead>
                  <tr><Th>Order</Th><Th>Firm</Th><Th>Client</Th><Th>Decision</Th><Th className="text-right">Value</Th></tr>
                </thead>
                <tbody>
                  {decidedOrders.map((o) => (
                    <tr key={o.id}>
                      <Td className="font-mono text-xs" title={o.md_enq_id}>{o.md_enq_id}</Td>
                      <Td className="text-xs">{o.referral?.partner?.firm_name ?? '—'}</Td>
                      <Td className="text-xs text-ink-soft">{o.referral?.client_name ?? '—'}</Td>
                      <Td>
                        <Badge tone={o.approval_status === 'approved' ? 'good' : 'bad'}>
                          {o.approval_status === 'approved' ? 'Verified' : 'Rejected'}
                        </Badge>
                        {o.review_note ? (
                          <span className="ml-2 text-[11px] text-ink-faint">{o.review_note}</span>
                        ) : null}
                      </Td>
                      <Td className="tnum text-right text-xs font-medium">{inr(o.order_value)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHead
              title="Work waiting to go on the site"
              hint="Submitted by a partner for materialdepot.com. Publishing makes it public."
            />
            {portfolioError ? (
              <div className="p-4"><Problem title="Portfolio did not load" detail={portfolioError} /></div>
            ) : pendingWork.length === 0 ? (
              <Empty title="Nothing waiting" body="No partner has work sitting with us." />
            ) : (
              <ul className="divide-y divide-line">
                {pendingWork.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{p.title}</p>
                      <p className="text-xs text-ink-soft">
                        {p.partner ? (
                          <Link href={`/console/partners/${p.partner.id}`} className="font-medium text-brand hover:underline">
                            {p.partner.firm_name}
                          </Link>
                        ) : '—'}
                        {p.city ? ` · ${p.city}` : ''}
                        {p.project_type ? ` · ${p.project_type}` : ''}
                        {p.rough_cost ? ` · ${inr(p.rough_cost)}` : ''}
                      </p>
                      {p.summary ? <p className="mt-1 text-sm text-ink-soft">{p.summary}</p> : null}
                      {p.inspiration ? (
                        <p className="mt-1 text-xs text-ink-faint"><strong className="text-ink-soft">Inspiration:</strong> {p.inspiration}</p>
                      ) : null}
                      {p.aspects_covered?.length ? (
                        <p className="mt-1 text-[11px] text-ink-faint">Covers: {p.aspects_covered.join(', ')}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-x-3">
                        {p.cover_url ? (
                          <a
                            href={p.cover_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                          >
                            <ExternalLink size={11} /> Cover image
                          </a>
                        ) : (
                          <p className="text-[11px] text-ink-faint">No cover image supplied.</p>
                        )}
                        {p.drive_link ? (
                          <a
                            href={p.drive_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                          >
                            <ExternalLink size={11} /> Drive folder
                          </a>
                        ) : null}
                      </div>
                      {p.credits ? <p className="text-[11px] text-ink-faint">Credits: {p.credits}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!canDecide || pending}
                        onClick={() => run(() => reviewPortfolio(p.id, 'published'))}
                      >
                        <Globe size={13} /> Publish
                      </Button>
                      <Button
                        size="sm"
                        disabled={!canDecide || pending}
                        onClick={() => setRejecting({ kind: 'portfolio', id: p.id, label: p.title })}
                      >
                        <X size={13} /> Send back
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {publishedWork.length ? (
            <Card>
              <CardHead title="Live on the site" hint="Published partner work" />
              <ul className="divide-y divide-line">
                {publishedWork.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{p.title}</p>
                      <p className="truncate text-[11px] text-ink-faint">
                        {p.partner?.firm_name ?? '—'} · published {date(p.reviewed_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canDecide || pending}
                      onClick={() => run(() => reviewPortfolio(p.id, 'rejected', 'Taken down by Material Depot.'))}
                    >
                      Take down
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting?.kind === 'orders' ? 'Do not count this order' : 'Send this back to the partner'}
        hint={rejecting?.label}
      >
        <form
          action={(form) => reject(String(form.get('note') ?? ''), String(form.get('code') ?? 'OTHER'))}
          className="space-y-3"
        >
          {/* PRD Appendix B. The code is picked from a list rather than typed,
              because the partner is shown a sentence derived from it — and six
              hand-typed phrasings of "already attributed" is what two firms
              comparing notes would find. The database refuses a decline with no
              code, so this cannot be skipped by a bug in this form. */}
          <Field
            label="Reason"
            required
            hint="The partner is shown a plain-language version of this against the order."
          >
            <Select name="code" defaultValue={rejecting?.kind === 'orders' ? 'CLIENT_NOT_ATTRIBUTED' : 'INCOMPLETE_DETAILS'} required>
              {(rejecting?.kind === 'orders' ? ORDER_NOT_COUNTED_CODES : PORTFOLIO_REJECTION_CODES).map((c) => (
                <option key={c} value={c}>{codeLabel(c)}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Anything to add"
            hint={
              rejecting?.kind === 'orders'
                ? 'Optional, and shown to the partner after the reason. Their KAM needs to be able to explain it.'
                : 'The partner sees this word for word, and it is what they act on.'
            }
          >
            <Textarea name="note" rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={pending}>
              <ShieldCheck size={14} /> {pending ? 'Saving…' : 'Save the decision'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
