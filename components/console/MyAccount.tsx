'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Info, Save } from 'lucide-react'
import { Badge, Button, Card, CardHead, Field, Input, Problem } from '@/components/ui'
import { updateMyStaffProfile } from '@/lib/data/account-actions'
import { marketLabel } from '@/lib/domain/markets'
import type { StaffUser } from '@/lib/domain/types'

const ROLE_LABEL: Record<StaffUser['role'], string> = {
  admin: 'Admin',
  kam: 'Key account manager',
  outreach: 'Outreach',
  inbound: 'Inbound',
}

/**
 * Your own details, on the console's Settings page.
 *
 * Name and mobile are yours to change. **Role, market and email are not**, and
 * they are on screen as facts rather than hidden, because the question they
 * answer — "why can I not see the Hyderabad firms?" — is asked far more often
 * than it is acted on. Both are what decides who you can see, so both go through
 * an admin on the Team page; a self-service market box would be a self-service
 * widening of your own access.
 */
export function MyAccount({ me, email }: { me: StaffUser; email: string | null }) {
  const router = useRouter()
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function save(form: FormData) {
    setProblem(null)
    setSaved(false)
    start(async () => {
      const res = await updateMyStaffProfile({
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
      })
      if (!res.ok) return setProblem(res.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHead title="You" hint="Your name and mobile are what a partner sees on their KAM card." />
      <form action={save} className="space-y-3 px-4 py-4">
        {problem ? <Problem title="Not saved" detail={problem} /> : null}
        {saved ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-good-soft bg-good-soft px-3 py-2.5 text-sm font-medium text-good">
            <Check size={15} /> Saved.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input name="name" defaultValue={me.name} required />
          </Field>
          <Field label="Mobile" hint="Ten digits. Partners can see this.">
            <Input name="phone" inputMode="numeric" defaultValue={me.phone ?? ''} />
          </Field>
        </div>

        <dl className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
          <Fact label="Sign-in email" value={email ?? me.email ?? '—'} mono />
          <Fact label="Role" value={<Badge tone="brand">{ROLE_LABEL[me.role]}</Badge>} />
          <Fact label="Market" value={marketLabel(me.market)} />
        </dl>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Your role and market decide whose firms and whose prospects you can see, so an admin changes them from{' '}
            <strong className="text-ink-soft">Team</strong> — not you, from here. Your email is the login itself and
            changing it is a support action.
          </span>
        </p>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            <Save size={14} /> {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className={`min-w-0 truncate text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
