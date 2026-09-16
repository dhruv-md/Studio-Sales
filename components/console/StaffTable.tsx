'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus } from 'lucide-react'
import {
  Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select, Table, Td, Th, type Tone,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { CredentialsIssued } from './CredentialsIssued'
import { CredentialPeek } from './CredentialPeek'
import {
  createStaffMember, readIssuedCredential, resetStaffPassword, updateStaffMember,
  type IssuedCredentials,
} from '@/lib/data/console-actions'
import { MARKETS, marketLabel } from '@/lib/domain/markets'
import type { StaffRole, StaffUser } from '@/lib/domain/types'
import { date } from '@/lib/format'

const ROLE: Record<StaffRole, { label: string; tone: Tone; blurb: string }> = {
  admin:    { label: 'Admin',    tone: 'brand',   blurb: 'Verifies orders and onboarding forms, issues logins, sees every market.' },
  kam:      { label: 'KAM',      tone: 'good',    blurb: 'Looks after the firms in their market once they are on the platform.' },
  outreach: { label: 'Outreach', tone: 'info',    blurb: 'Works the list of firms in their market who are not with us yet.' },
  inbound:  { label: 'Inbound',  tone: 'neutral', blurb: 'Handles firms who came to us, across every market.' },
}

/**
 * The team, and who can see what.
 *
 * Market is the whole segregation: a staff member with a market set sees only
 * that market's firms, prospects and onboarding forms. A blank market means
 * every market, which is right for an admin and for the inbound desk and wrong
 * for almost everyone else — so the form says so rather than leaving it as an
 * innocent-looking empty dropdown.
 */
export function StaffTable({ team, meId, error }: { team: StaffUser[]; meId: string; error?: string | null }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [creds, setCreds] = useState<IssuedCredentials | null>(null)
  const [peek, setPeek] = useState<StaffUser | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setProblem(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) return setProblem(res.error)
      after?.()
      router.refresh()
    })
  }

  function add(form: FormData) {
    setProblem(null)
    start(async () => {
      const res = await createStaffMember({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? ''),
        role: String(form.get('role') ?? 'outreach') as StaffRole,
        market: String(form.get('market') ?? '') || null,
        photo_url: String(form.get('photo_url') ?? '') || null,
      })
      if (!res.ok) return setProblem(res.error)
      setAdding(false)
      setCreds(res.data)
      router.refresh()
    })
  }

  return (
    <>
      {problem ? <div className="mb-4"><Problem title="That did not go through" detail={problem} /></div> : null}
      {error ? <div className="mb-4"><Problem title="The team did not load" detail={error} /></div> : null}

      <Card>
        <CardHead
          title={`${team.length} on the B2B team`}
          hint="Market decides what each person sees. Blank means every market."
          action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add somebody</Button>}
        />
        {team.length === 0 ? (
          <Empty title="Nobody yet" body="Add the first KAM or outreach manager." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Role</Th><Th>Market</Th><Th>Contact</Th><Th>Photo</Th><Th>Added</Th><Th>Active</Th></tr>
            </thead>
            <tbody>
              {team.map((s) => {
                const me = s.user_id === meId
                return (
                  <tr key={s.user_id} className={s.active ? '' : 'opacity-50'}>
                    <Td className="font-medium">
                      {/* The name is the way in to their login. There is no
                          other row-level detail behind it, so a whole detail
                          page would be a page with one card on it. */}
                      <button
                        type="button"
                        onClick={() => setPeek(s)}
                        className="text-left font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-brand"
                        title={`See the login we issued ${s.name}`}
                      >
                        {s.name}
                      </button>
                      {me ? <span className="ml-1.5 text-[11px] font-normal text-ink-faint">(you)</span> : null}
                    </Td>
                    <Td>
                      <Select
                        value={s.role}
                        disabled={me || pending}
                        title={me ? 'You cannot change your own role' : ROLE[s.role].blurb}
                        onChange={(e) => run(() => updateStaffMember(s.user_id, { role: e.target.value as StaffRole }))}
                        className="h-8 w-auto text-xs"
                      >
                        {(Object.keys(ROLE) as StaffRole[]).map((r) => (
                          <option key={r} value={r}>{ROLE[r].label}</option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <Select
                        value={s.market ?? ''}
                        disabled={pending}
                        onChange={(e) => run(() => updateStaffMember(s.user_id, { market: e.target.value || null }))}
                        className="h-8 w-auto text-xs"
                      >
                        <option value="">Every market</option>
                        {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </Select>
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      <span className="block truncate">{s.email ?? '—'}</span>
                      <span className="tnum block text-ink-faint">{s.phone ?? '—'}</span>
                    </Td>
                    <Td>
                      <Input
                        key={s.photo_url ?? ''}
                        defaultValue={s.photo_url ?? ''}
                        placeholder="Photo URL"
                        disabled={pending}
                        className="h-8 w-36 text-xs"
                        onBlur={(e) => {
                          const next = e.target.value.trim() || null
                          if (next === (s.photo_url ?? null)) return
                          run(() => updateStaffMember(s.user_id, { photo_url: next }))
                        }}
                      />
                    </Td>
                    <Td className="text-xs text-ink-faint">{date(s.created_at)}</Td>
                    <Td>
                      {me ? (
                        <Badge tone="good">Active</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => updateStaffMember(s.user_id, { active: !s.active }))}
                        >
                          {s.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-line px-4 py-2.5">
          <ul className="space-y-0.5 text-[11px] leading-relaxed text-ink-faint">
            {(Object.keys(ROLE) as StaffRole[]).map((r) => (
              <li key={r}><strong className="text-ink-soft">{ROLE[r].label}</strong> — {ROLE[r].blurb}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Tap a name to see the login we issued them. It is readable until they change their own password, at which
            point it is erased and cannot be recovered by anybody here.
          </p>
        </div>
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add somebody to the team"
        hint="This creates their login. The password is shown once, for you to send them."
      >
        <form action={add} className="space-y-3">
          <Field label="Name" required>
            <Input name="name" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" required hint="Their login.">
              <Input type="email" name="email" required />
            </Field>
            <Field label="Mobile" hint="Partners see this on their KAM card.">
              <Input name="phone" inputMode="numeric" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" required>
              <Select name="role" defaultValue="outreach">
                {(Object.keys(ROLE) as StaffRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE[r].label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Market" hint="Blank = every market. Right for an admin, wrong for most KAMs.">
              <Select name="market" defaultValue="">
                <option value="">Every market</option>
                {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Photo URL" hint="Optional. Shown on a partner's KAM card so they know who they are calling.">
            <Input name="photo_url" placeholder="https://…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <UserPlus size={14} /> {pending ? 'Creating…' : 'Create the login'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={creds !== null}
        onClose={() => setCreds(null)}
        title="Login created"
        hint={creds ? `For ${creds.firmName}` : undefined}
      >
        {creds ? <CredentialsIssued creds={creds} onDone={() => setCreds(null)} /> : null}
      </Modal>

      <Modal
        open={peek !== null}
        onClose={() => setPeek(null)}
        title={peek ? `${peek.name}’s login` : 'Login'}
        hint={peek ? ROLE[peek.role].label + (peek.email ? ` · ${peek.email}` : '') : undefined}
      >
        {peek ? (
          <CredentialPeek
            load={() => readIssuedCredential(peek.user_id)}
            who={peek.name}
            resetting={pending}
            onReset={
              peek.user_id === meId
                ? undefined
                : () =>
                    start(async () => {
                      setProblem(null)
                      const res = await resetStaffPassword(peek.user_id)
                      // Close either way: the message belongs on the page, not
                      // behind the modal that is still covering it.
                      setPeek(null)
                      if (!res.ok) return setProblem(res.error)
                      setCreds(res.data)
                      router.refresh()
                    })
            }
          />
        ) : null}
      </Modal>
    </>
  )
}
