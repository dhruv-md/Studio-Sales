'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Input, Problem, Textarea } from '@/components/ui'
import { scheduleVisit } from '@/lib/data/actions'
import { INTEREST_CATEGORIES } from '@/lib/domain/categories'

/**
 * "Schedule another visit" for a client already referred. Deliberately does
 * not re-ask their name, number or city — that is on the referral already,
 * and this is only ever opened from that client's own page.
 */
export function ScheduleVisitForm({
  referralId,
  onDone,
  onCancel,
}: {
  referralId: string
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setError(null)
    start(async () => {
      const res = await scheduleVisit({
        referral_id: referralId,
        ec_name: String(form.get('ec_name') ?? ''),
        scheduled_on: String(form.get('scheduled_on') ?? ''),
        scheduled_time: String(form.get('scheduled_time') ?? ''),
        categories,
        requirements: String(form.get('requirements') ?? ''),
      })
      if (!res.ok) return setError(res.error)
      onDone()
      router.refresh()
    })
  }

  return (
    <form action={submit} className="space-y-3">
      {error ? <Problem title="Could not save" detail={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="EC expected to visit">
          <Input name="ec_name" autoComplete="off" />
        </Field>
        <Field label="Date" required>
          <Input name="scheduled_on" type="date" required />
        </Field>
        <Field label="Time" required>
          <Input name="scheduled_time" type="time" required />
        </Field>
      </div>

      <Field label="Categories interested in" hint="For this visit — tick anything that applies.">
        <div className="flex flex-wrap gap-1.5">
          {INTEREST_CATEGORIES.map((c) => {
            const on = categories.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategories((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                ].join(' ')}
              >
                {c}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Description of requirements">
        <Textarea name="requirements" rows={3} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Schedule the visit'}
        </Button>
      </div>
    </form>
  )
}
