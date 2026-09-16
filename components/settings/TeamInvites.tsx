'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info, UserPlus } from 'lucide-react'
import type { PartnerTeamInvite, TeamInviteRole } from '@/lib/domain/types'
import { Badge, Button, Field, Input, Problem, Select, type Tone } from '@/components/ui'
import { requestTeamInvite } from '@/lib/data/actions'
import { date } from '@/lib/format'

const ROLE_LABEL: Record<TeamInviteRole, string> = { design_team: 'Design team', procurement: 'Procurement' }

const STATUS: Record<PartnerTeamInvite['status'], { label: string; tone: Tone }> = {
  requested: { label: 'Waiting on Material Depot', tone: 'info' },
  approved: { label: 'Login issued', tone: 'good' },
  rejected: { label: 'Declined', tone: 'bad' },
}

/**
 * §13.2's request, made real. `partner_user` still has no insert policy for a
 * firm and never will — a self-serve seat would be a login into Material
 * Depot's systems the firm did not ask us to issue. This just replaces "tell
 * your KAM" with a form that files the same request as a row an admin can
 * act on, instead of a phone call that leaves no record.
 */
export function TeamInvites({ invites }: { invites: PartnerTeamInvite[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setError(null)
    start(async () => {
      const res = await requestTeamInvite({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        role: String(form.get('role') ?? 'design_team') as TeamInviteRole,
      })
      if (!res.ok) return setError(res.error)
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <div className="px-4 py-4">
      {error ? <div className="mb-3"><Problem title="Could not send that" detail={error} /></div> : null}

      {invites.length ? (
        <ul className="mb-3 space-y-2">
          {invites.map((inv) => (
            <li key={inv.id} className="rounded-lg border border-line bg-raised px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{inv.name}</p>
                  <p className="text-xs text-ink-faint">
                    {inv.email} · {ROLE_LABEL[inv.role]} · asked {date(inv.requested_at)}
                  </p>
                </div>
                <Badge tone={STATUS[inv.status].tone}>{STATUS[inv.status].label}</Badge>
              </div>
              {inv.status === 'rejected' && inv.review_note ? (
                <p className="mt-1.5 text-xs text-ink-soft"><strong className="text-bad">Note:</strong> {inv.review_note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form action={submit} className="space-y-3 rounded-lg border border-line bg-raised p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Their name" required><Input name="name" required /></Field>
            <Field label="Their email" required hint="Becomes their login."><Input type="email" name="email" required /></Field>
          </div>
          <Field label="What they should be able to see">
            <Select name="role" defaultValue="design_team">
              <option value="design_team">Design team — projects and their own clients</option>
              <option value="procurement">Procurement — orders, GST and invoices</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Sending…' : 'Send the request'}</Button>
          </div>
        </form>
      ) : (
        <Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={14} /> Add someone</Button>
      )}

      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
        <Info size={13} className="mt-0.5 shrink-0 text-ink-faint" />
        <span>
          We create the login and send it to you; they change the password the first time they sign in. We issue
          logins rather than letting you create them because these are credentials into our systems, and the
          paperwork for that sits with us.
        </span>
      </p>
    </div>
  )
}
