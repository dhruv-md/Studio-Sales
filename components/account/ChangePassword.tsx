'use client'

import { useState, useTransition } from 'react'
import { Check, KeyRound, ShieldCheck } from 'lucide-react'
import { Button, Card, CardHead, Field, Input, Problem } from '@/components/ui'
import { changeMyPassword } from '@/lib/data/account-actions'

/**
 * Change your own password. Used by both apps — the partner's Settings and the
 * console's — which is why it sits in its own folder rather than in
 * `components/console/`, a folder `app/(app)/` is not allowed to import from.
 *
 * Every login on this platform starts as a password somebody else generated and
 * sent over WhatsApp. Until this existed there was no way to stop being that
 * person, and the console now keeps that first password until it is changed —
 * so this form is the thing that ends the retention, not a convenience.
 */
export function ChangePassword({
  hint = 'You were sent a password when your login was created. Changing it here is what stops Material Depot being able to read it.',
}: {
  hint?: string
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setProblem(null)
    setDone(false)
    start(async () => {
      const res = await changeMyPassword({
        current: String(form.get('current') ?? ''),
        next: String(form.get('next') ?? ''),
        confirm: String(form.get('confirm') ?? ''),
      })
      if (!res.ok) return setProblem(res.error)
      setDone(true)
    })
  }

  return (
    <Card>
      <CardHead title="Your password" hint={hint} />
      <form action={submit} className="space-y-3 px-4 py-4">
        {problem ? <Problem title="It was not changed" detail={problem} /> : null}
        {done ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-good-soft bg-good-soft px-3 py-2.5 text-sm font-medium text-good">
            <Check size={15} /> Done. Your new password works from the next time you sign in.
          </p>
        ) : null}

        <Field label="Your current password" required>
          <Input type="password" name="current" autoComplete="current-password" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" required hint="At least 10 characters.">
            <Input type="password" name="next" autoComplete="new-password" minLength={10} required />
          </Field>
          <Field label="Type it again" required>
            <Input type="password" name="confirm" autoComplete="new-password" minLength={10} required />
          </Field>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          <span>
            We ask for the current one because an unlocked laptop should not be enough to lock you out of your own
            account.
          </span>
        </p>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            <KeyRound size={14} /> {pending ? 'Changing…' : 'Change my password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
