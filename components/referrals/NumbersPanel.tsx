'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import type { ReferralPhone } from '@/lib/domain/types'
import { Badge, Button, Input, Problem, Select } from '@/components/ui'
import { addReferralPhone, removeReferralPhone } from '@/lib/data/actions'

const LABEL: Record<ReferralPhone['label'], string> = {
  client: 'Their number',
  partner: 'Partner’s number',
  additional: 'Additional',
}

/**
 * A client does not always order through the number they were referred on —
 * sometimes it is their partner's, sometimes another number entirely. An
 * APPROVED number here is read when matching carts and orders back to this
 * client, not just `referral.md_phone`. These are numbers the firm itself
 * typed in, so — unlike the client's primary number elsewhere on this page —
 * they are shown in full rather than masked.
 *
 * 008_phone_review.sql: a number a firm adds arrives `pending` and does not
 * count for that matching until a Material Depot admin approves it in
 * `/console/approvals`. `client` is the exception — it is the number the
 * referral itself was made on, already trusted, so it is always `approved`.
 */
export function NumbersPanel({ referralId, phones }: { referralId: string; phones: ReferralPhone[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState<'partner' | 'additional'>('additional')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function add() {
    setError(null)
    start(async () => {
      const res = await addReferralPhone(referralId, phone, label)
      if (!res.ok) return setError(res.error)
      setPhone('')
      setAdding(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    start(async () => {
      const res = await removeReferralPhone(id)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  return (
    <div className="px-4 py-3">
      {error ? <div className="mb-2"><Problem title="Could not save" detail={error} /></div> : null}
      <ul className="space-y-1.5">
        {phones.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="tnum text-ink">{p.phone}</span>
            <span className="flex items-center gap-1.5">
              <Badge tone={p.label === 'client' ? 'brand' : 'neutral'}>{LABEL[p.label]}</Badge>
              {p.status === 'pending' ? (
                <Badge tone="warn">Awaiting approval</Badge>
              ) : p.status === 'rejected' ? (
                <Badge tone="bad">Not approved</Badge>
              ) : null}
              {p.label !== 'client' ? (
                <button
                  onClick={() => remove(p.id)}
                  disabled={pending}
                  className="rounded p-1 text-ink-faint transition hover:bg-bad-soft hover:text-bad"
                  aria-label={`Remove ${p.phone}`}
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="9876543210"
            className="h-8 text-xs"
          />
          <Select value={label} onChange={(e) => setLabel(e.target.value as typeof label)} className="h-8 w-auto text-xs">
            <option value="additional">Additional</option>
            <option value="partner">Partner’s number</option>
          </Select>
          <Button size="sm" variant="primary" onClick={add} disabled={pending || phone.length < 10}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(null) }}>Cancel</Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <Plus size={12} /> Add a number
        </button>
      )}
    </div>
  )
}
