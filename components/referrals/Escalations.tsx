'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, MessageSquare, Plus, X } from 'lucide-react'
import type { Escalation, EscalationComment, ReferralOrder } from '@/lib/domain/types'
import { Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select, Textarea, type Tone } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { Uploader } from '@/components/shell/Uploader'
import { commentOnEscalation, raiseEscalation, reopenEscalation } from '@/lib/data/actions'
import { EV, track } from '@/lib/analytics/track'
import { dateTime, relative } from '@/lib/format'

/**
 * §9.4 — escalations.
 *
 * **An open escalation holds that order's maturation.** §10.5 says so, and a
 * partner who raises a ticket about a short delivery and then finds their
 * cashback delayed with no warning reads it as a punishment for complaining. So
 * the form says it up front, on the way in.
 *
 * **The image attachment** goes through the same `app/api/upload/route.ts`
 * door as everything else — session-checked, then written with the service
 * role to `studio-media`. §9.4 also specifies PDFs up to 5, which this single
 * image field does not attempt; a partner with more to show still sends the
 * rest to their key account manager.
 */
const CATEGORIES = [
  { key: 'delivery_delay', label: 'Delivery is late' },
  { key: 'quality_damage', label: 'Quality or damage' },
  { key: 'wrong_item', label: 'Wrong item supplied' },
  { key: 'billing_gst', label: 'Billing or GST' },
  { key: 'other', label: 'Something else' },
] as const

const TONE: Record<Escalation['status'], Tone> = {
  open: 'warn',
  acknowledged: 'info',
  in_progress: 'info',
  resolved: 'good',
  closed: 'neutral',
  reopened: 'bad',
}

const LABEL: Record<Escalation['status'], string> = {
  open: 'Raised',
  acknowledged: 'Acknowledged',
  in_progress: 'Being worked on',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
}

export function Escalations({
  escalations,
  comments,
  orders,
  referralId,
  error,
}: {
  escalations: Escalation[]
  comments: EscalationComment[]
  orders: ReferralOrder[]
  referralId: string | null
  error?: string | null
}) {
  const router = useRouter()
  const [raising, setRaising] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setProblem(null)
    start(async () => {
      const res = await raiseEscalation({
        category: String(form.get('category') ?? 'other') as (typeof CATEGORIES)[number]['key'],
        subject: String(form.get('subject') ?? ''),
        description: String(form.get('description') ?? ''),
        referral_id: referralId,
        order_id: String(form.get('order_id') ?? '') || null,
        attachments: attachment ? [attachment] : [],
      })
      if (!res.ok) return setProblem(res.error)
      track(EV.escalation_raised, { category: String(form.get('category') ?? 'other'), has_order: Boolean(form.get('order_id')) })
      setRaising(false)
      setAttachment(null)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHead
        title="Escalations"
        hint="Anything that has gone wrong with an order. Goes to your key account manager, and to an admin if they have not acknowledged it within a day."
        action={
          <Button size="sm" onClick={() => setRaising(true)}>
            <Plus size={14} /> Raise one
          </Button>
        }
      />

      {error ? (
        <div className="p-4">
          <Problem title="We could not load your escalations" detail={error} />
        </div>
      ) : escalations.length === 0 ? (
        <Empty
          title="Nothing open"
          body="If a delivery is late, something arrived damaged or a bill looks wrong, raise it here and it is tracked with a response time rather than living in a WhatsApp thread."
        />
      ) : (
        <ul className="divide-y divide-line">
          {escalations.map((e) => (
            <Row
              key={e.id}
              e={e}
              comments={comments.filter((c) => c.escalation_id === e.id)}
              open={openId === e.id}
              onToggle={() => setOpenId(openId === e.id ? null : e.id)}
              onDone={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      <Modal
        open={raising}
        onClose={() => {
          setRaising(false)
          setAttachment(null)
        }}
        title="Raise an escalation"
        hint="The more specific the better — this goes straight to the people who can fix it."
      >
        {problem ? <div className="mb-3"><Problem title="Could not raise it" detail={problem} /></div> : null}
        <form action={submit} className="space-y-3">
          <Field label="What is wrong" required>
            <Select name="category" defaultValue="delivery_delay">
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </Select>
          </Field>

          {orders.length ? (
            <Field label="Which order" hint="Linking it means we can see the invoice and the delivery without asking you.">
              <Select name="order_id" defaultValue="">
                <option value="">Not about one specific order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.md_enq_id}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Title" required hint="What you would say on the phone.">
            <Input name="subject" placeholder="Two boxes short on the bedroom flooring" />
          </Field>

          <Field label="Please describe your concern" required>
            <Textarea name="description" rows={4} />
          </Field>

          <Field label="Attach an image" hint="Optional — a photo of the damage or the delivery, for instance.">
            {attachment ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment} alt="" className="size-12 rounded-md border border-line object-cover" />
                <Button type="button" size="sm" variant="ghost" onClick={() => setAttachment(null)}>
                  <X size={13} /> Remove
                </Button>
              </div>
            ) : (
              <Uploader accept="image/*" label="Attach an image" onUploaded={setAttachment} onError={setProblem} />
            )}
          </Field>

          <p className="rounded-lg border border-line bg-raised px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
            <strong className="text-ink">Worth knowing.</strong> If this is about an order, that order stops maturing
            until the escalation is closed — it is not lost, it just does not count towards a reward while there is
            still a question over it.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { setRaising(false); setAttachment(null) }}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Sending…' : 'Raise it'}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

function Row({
  e, comments, open, onToggle, onDone,
}: {
  e: Escalation
  comments: EscalationComment[]
  open: boolean
  onToggle: () => void
  onDone: () => void
}) {
  const [reply, setReply] = useState('')
  const [why, setWhy] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const canReopen = e.status === 'resolved' || e.status === 'closed'

  return (
    <li>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-raised">
        <AlertCircle size={15} className={`mt-0.5 shrink-0 ${e.status === 'resolved' || e.status === 'closed' ? 'text-ink-faint' : 'text-warn'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{e.subject}</span>
          <span className="block text-xs text-ink-faint">
            Raised {relative(e.raised_at)}
            {e.acknowledged_at ? ` · acknowledged ${relative(e.acknowledged_at)}` : ' · not acknowledged yet'}
            {comments.length ? ` · ${comments.length} repl${comments.length === 1 ? 'y' : 'ies'}` : ''}
          </span>
        </span>
        <Badge tone={TONE[e.status]}>{LABEL[e.status]}</Badge>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-line bg-raised px-4 py-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">{e.description}</p>

          {e.attachments?.length ? (
            <div className="flex flex-wrap gap-2">
              {e.attachments.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Escalation attachment" className="size-16 rounded-md border border-line object-cover" />
                </a>
              ))}
            </div>
          ) : null}

          {/* §9.4: "Threaded comments visible to partner; internal notes
              hidden." There is no filter here — RLS does the hiding, and a
              filter in a component is one forgotten prop away from a leak. */}
          {comments.length ? (
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <p className="text-[11px] font-medium text-ink-faint">
                    {c.author_side === 'md' ? 'Material Depot' : 'You'} · {dateTime(c.created_at)}
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {problem ? <Problem title="That did not send" detail={problem} /> : null}

          {canReopen ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">
                {e.resolution_note ? <>Marked resolved: {e.resolution_note}</> : 'Marked resolved by Material Depot.'}{' '}
                If it is not, say why and it goes back to them.
              </p>
              <Textarea rows={2} value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="It is still two boxes short." />
              <Button
                size="sm"
                disabled={pending || !why.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await reopenEscalation(e.id, why)
                    if (!r.ok) return setProblem(r.error)
                    setWhy('')
                    onDone()
                  })
                }
              >
                Reopen it
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea rows={2} value={reply} onChange={(ev) => setReply(ev.target.value)} placeholder="Add to this thread…" />
              <Button
                size="sm"
                disabled={pending || !reply.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await commentOnEscalation(e.id, reply)
                    if (!r.ok) return setProblem(r.error)
                    setReply('')
                    onDone()
                  })
                }
              >
                <MessageSquare size={13} /> Send
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}
