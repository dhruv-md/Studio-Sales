'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, MessageSquarePlus, Save } from 'lucide-react'
import {
  Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select, Stat, Table, Td, Textarea, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { EngagementBadge, TierBadge } from './Standing'
import { CredentialsIssued } from './CredentialsIssued'
import { CredentialPeek } from './CredentialPeek'
import { OrderApprovalBadge } from '@/components/referrals/OrderApproval'
import {
  logActivity, provisionTeamInvite, readPartnerCredential, rejectTeamInvite, resetPartnerPassword,
  updatePartnerAdminFields, type IssuedCredentials,
} from '@/lib/data/console-actions'
import type { PartnerStanding } from '@/lib/domain/tiering'
import { DORMANT_AFTER_DAYS } from '@/lib/domain/tiering'
import type {
  Partner, PartnerActivity, PartnerTeamInvite, PortfolioItem, Referral, ReferralOrder, RewardClaim, RewardTier,
  StaffUser,
} from '@/lib/domain/types'
import { MARKETS, marketLabel } from '@/lib/domain/markets'
import { date, dateTime, inr, inrShort } from '@/lib/format'

/**
 * One firm, from Material Depot's side.
 *
 * Shows the relationship and nothing else: who they are, who looks after them,
 * what their referred clients have bought, what they have earned, what work they
 * have given us, and everything we have done with them. There is no tab here for
 * their projects, their quotes or their margins, and there cannot be — staff
 * have no read policy on those tables at all.
 */
export function PartnerDetail({
  partner,
  standing,
  referrals,
  orders,
  claims,
  tiers,
  activity,
  portfolio,
  team,
  teamInvites,
  isAdmin,
  problems,
}: {
  partner: Partner
  standing: PartnerStanding
  referrals: Referral[]
  orders: ReferralOrder[]
  claims: RewardClaim[]
  tiers: RewardTier[]
  activity: PartnerActivity[]
  portfolio: PortfolioItem[]
  team: StaffUser[]
  teamInvites: PartnerTeamInvite[]
  isAdmin: boolean
  problems: string[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [noteOpen, setNoteOpen] = useState(false)
  const [creds, setCreds] = useState<IssuedCredentials | null>(null)
  const [peeking, setPeeking] = useState(false)

  const nameOf = (id: string | null) => team.find((s) => s.user_id === id)?.name ?? null
  const clientOf = (refId: string) => referrals.find((r) => r.id === refId)?.client_name ?? '—'
  const earned = tiers.filter((t) => standing.approvedValue >= Number(t.threshold))

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error)
      after?.()
      router.refresh()
    })
  }

  return (
    <>
      {error ? <div className="mb-4"><Problem title="That did not save" detail={error} /></div> : null}
      {problems.length ? (
        <div className="mb-4">
          <Problem title="Some of this page could not load" detail={problems.join(' · ')} />
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Verified business"
          value={inrShort(standing.approvedValue)}
          hint={`${standing.orderCount} order${standing.orderCount === 1 ? '' : 's'} from ${referrals.length} referred client${referrals.length === 1 ? '' : 's'}`}
          tone="good"
        />
        <Stat
          label="Waiting on an admin"
          value={standing.pendingCount ? inrShort(standing.pendingValue) : '—'}
          hint={standing.pendingCount ? `${standing.pendingCount} order${standing.pendingCount === 1 ? '' : 's'} to verify` : 'Nothing outstanding'}
          tone={standing.pendingCount ? 'brand' : undefined}
        />
        <Stat
          label="Last order"
          value={standing.lastOrderOn ? date(standing.lastOrderOn) : 'Never'}
          hint={
            standing.engagement === 'dormant'
              ? `${standing.daysSinceOrder} days ago — past the ${DORMANT_AFTER_DAYS}-day mark`
              : standing.engagement === 'never_ordered'
                ? 'Onboarded, but nothing has come through'
                : `${standing.daysSinceOrder} days ago`
          }
          tone={standing.engagement === 'dormant' ? 'bad' : undefined}
        />
        <Stat label="Milestones earned" value={`${earned.length} / ${tiers.length}`} hint="Cumulative, lifetime" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card>
            <CardHead
              title={partner.firm_name}
              hint={`${partner.contact_name} · ${partner.phone}`}
              action={
                <div className="flex gap-1.5">
                  <TierBadge standing={standing} />
                  <EngagementBadge standing={standing} />
                </div>
              }
            />
            <dl className="divide-y divide-line text-sm">
              {([
                ['Email', partner.email],
                ['City', partner.city],
                ['GSTIN', partner.gst],
                ['Type', partner.firm_type.replace('_', ' ')],
                ['Onboarded', `${date(partner.onboarded_on)} · ${partner.onboarding_source.replace('_', ' ')}`],
                ['Brought in by', nameOf(partner.onboarded_by)],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2">
                  <dt className="w-28 shrink-0 text-xs text-ink-faint">{k}</dt>
                  <dd className="min-w-0 flex-1 truncate text-ink">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHead
              title="Material Depot settings"
              hint={isAdmin ? 'Only an admin can change these — the database refuses everyone else, the firm included.' : 'Admin only. The firm cannot change these either.'}
            />
            <form
              action={(form) =>
                run(() =>
                  updatePartnerAdminFields(partner.id, {
                    market: String(form.get('market') ?? '') || null,
                    kam_user_id: String(form.get('kam') ?? '') || null,
                    workspace_enabled: form.get('workspace') === 'on',
                    internal_note: String(form.get('internal_note') ?? ''),
                  }),
                )
              }
              className="space-y-3 px-4 py-3.5"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Market">
                  <Select name="market" defaultValue={partner.market ?? ''} disabled={!isAdmin}>
                    <option value="">Unassigned</option>
                    {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Key account manager">
                  <Select name="kam" defaultValue={partner.kam_user_id ?? ''} disabled={!isAdmin}>
                    <option value="">Nobody</option>
                    {team.filter((s) => s.active && (s.role === 'kam' || s.role === 'admin')).map((s) => (
                      <option key={s.user_id} value={s.user_id}>{s.name}{s.market ? ` · ${marketLabel(s.market)}` : ''}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <label className="flex items-start gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5">
                <input
                  type="checkbox"
                  name="workspace"
                  defaultChecked={partner.workspace_enabled}
                  disabled={!isAdmin}
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                />
                <span className="text-xs leading-relaxed text-ink-soft">
                  <strong className="text-ink">Project workspace</strong> — design boards, client quotes,
                  procurement and project P&amp;L. Off by default. Turn it on when the firm asks; nothing they
                  put in it is readable by anyone at Material Depot, including you.
                </span>
              </label>
              <Field label="Internal note" hint="Never shown to the firm.">
                <Textarea name="internal_note" rows={3} defaultValue={partner.internal_note ?? ''} disabled={!isAdmin} />
              </Field>
              {isAdmin ? (
                <div className="flex flex-wrap justify-between gap-2">
                  {/* Look first, issue second. Issuing invalidates whatever the
                      firm was already sent, and since 006_credentials.sql the
                      one we sent is usually still readable — so the repair for
                      "they never got the message" is a copy, not a reset. */}
                  <Button type="button" onClick={() => setPeeking(true)}>
                    <KeyRound size={14} /> Their login
                  </Button>
                  <Button type="submit" variant="primary" disabled={pending}>
                    <Save size={14} /> {pending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              ) : null}
            </form>
          </Card>

          <Card>
            <CardHead title="Their work" hint="What they have sent us for the site" />
            {portfolio.length === 0 ? (
              <Empty title="Nothing submitted" body="They have not sent us any projects yet." />
            ) : (
              <ul className="divide-y divide-line">
                {portfolio.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{p.title}</p>
                      <p className="truncate text-[11px] text-ink-faint">{p.city ?? '—'} · {p.project_type ?? '—'}</p>
                    </div>
                    <Badge tone={p.status === 'published' ? 'good' : p.status === 'submitted' ? 'warn' : 'neutral'}>
                      {p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isAdmin ? <TeamRequests invites={teamInvites} onError={setError} /> : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead
              title="What their clients have bought"
              hint="Only verified orders count towards their rewards"
            />
            {orders.length === 0 ? (
              <Empty
                title="No orders yet"
                body={
                  referrals.length
                    ? 'They have referred clients, but nothing has been ordered yet.'
                    : 'They have not referred anybody yet — which is usually the thing to talk to them about.'
                }
              />
            ) : (
              <Table className="min-w-[560px]">
                <thead>
                  <tr><Th>Order</Th><Th>Client</Th><Th>Placed</Th><Th>State</Th><Th className="text-right">Value</Th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <Td className="font-mono text-[11px]" title={o.md_enq_id}>{o.md_enq_id}</Td>
                      <Td className="text-xs">{clientOf(o.referral_id)}</Td>
                      <Td className="text-xs text-ink-soft">{date(o.ordered_on)}</Td>
                      <Td><OrderApprovalBadge status={o.approval_status} /></Td>
                      <Td className="tnum text-right text-xs font-medium">{inr(o.order_value)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {standing.pendingCount ? (
              <p className="border-t border-line px-4 py-2 text-[11px] text-ink-faint">
                {inr(standing.pendingValue)} is waiting on an admin and is not in their total yet —
                verify it under <strong>Verify</strong>.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHead title="Rewards" hint="Derived from verified orders, never stored" />
            {tiers.length === 0 ? (
              <Empty title="No ladder configured" body="reward_tier is empty." />
            ) : (
              <ul className="divide-y divide-line">
                {tiers.map((t) => {
                  const unlocked = standing.approvedValue >= Number(t.threshold)
                  const claim = claims.find((c) => c.tier_id === t.id)
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${unlocked ? 'font-medium text-ink' : 'text-ink-faint'}`}>{t.label}</p>
                        <p className="text-[11px] text-ink-faint">{inr(t.threshold)}</p>
                      </div>
                      {unlocked ? (
                        <Badge tone={claim?.status === 'fulfilled' ? 'good' : 'warn'}>
                          {claim?.status === 'fulfilled' ? 'Handed over' : claim?.status === 'claimed' ? 'Claimed' : 'Owed'}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-ink-faint">{inrShort(Number(t.threshold) - standing.approvedValue)} away</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead
              title="History"
              hint="Rows marked internal are not visible to the firm"
              action={<Button size="sm" onClick={() => setNoteOpen(true)}><MessageSquarePlus size={13} /> Add a note</Button>}
            />
            {activity.length === 0 ? (
              <Empty title="Nothing logged" body="Onboarding, verified orders and anything published shows up here." />
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{a.title}</p>
                        {a.detail ? <p className="text-xs text-ink-soft">{a.detail}</p> : null}
                        <p className="tnum mt-0.5 text-[11px] text-ink-faint">
                          {dateTime(a.occurred_at)}
                          {a.by_user ? ` · ${nameOf(a.by_user) ?? 'someone no longer on the team'}` : ''}
                        </p>
                      </div>
                      {!a.visible_to_partner ? <Badge>Internal</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add to this firm's history">
        <form
          action={(form) =>
            run(
              () =>
                logActivity({
                  partnerId: partner.id,
                  kind: String(form.get('kind') ?? 'note'),
                  title: String(form.get('title') ?? ''),
                  detail: String(form.get('detail') ?? ''),
                  visibleToPartner: form.get('visible') === 'on',
                }),
              () => setNoteOpen(false),
            )
          }
          className="space-y-3"
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="What happened" required>
              <Input name="title" required placeholder="Called about the next project cycle" />
            </Field>
            <Field label="Kind">
              <Select name="kind" defaultValue="note">
                <option value="note">Note</option>
                <option value="reactivation">Reactivation call</option>
                <option value="meeting">Meeting</option>
                <option value="reward">Reward</option>
              </Select>
            </Field>
          </div>
          <Field label="More">
            <Textarea name="detail" rows={3} />
          </Field>
          <label className="flex items-start gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5">
            <input type="checkbox" name="visible" className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            <span className="text-xs leading-relaxed text-ink-soft">
              <strong className="text-ink">Show this to the firm.</strong> Off by default — most of what a
              KAM writes here is for the KAM. Tick it for something the partner should see in their own
              account history.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={creds !== null} onClose={() => setCreds(null)} title="New password issued">
        {creds ? <CredentialsIssued creds={creds} onDone={() => setCreds(null)} /> : null}
      </Modal>

      <Modal
        open={peeking}
        onClose={() => setPeeking(false)}
        title={`${partner.firm_name}\u2019s login`}
        hint={partner.email ?? undefined}
      >
        {peeking ? (
          <CredentialPeek
            load={() => readPartnerCredential(partner.id)}
            who={partner.firm_name}
            resetting={pending}
            onReset={() =>
              start(async () => {
                setError(null)
                const res = await resetPartnerPassword(partner.id)
                setPeeking(false)
                if (!res.ok) return setError(res.error)
                setCreds(res.data)
              })
            }
          />
        ) : null}
      </Modal>
    </>
  )
}

const TEAM_INVITE_ROLE_LABEL: Record<PartnerTeamInvite['role'], string> = {
  design_team: 'Design team',
  procurement: 'Procurement',
}

/**
 * Approve creates a real login — `provisionTeamInvite()` does the same
 * generate-password / create-user / seal-and-retain dance `Firms → Issue
 * login` does, just against this firm's existing `partner_id` instead of a
 * new one. Reject needs a reason, same as declining a referral: a firm should
 * never read "declined" with nothing to act on.
 */
function TeamRequests({ invites, onError }: { invites: PartnerTeamInvite[]; onError: (e: string | null) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [creds, setCreds] = useState<IssuedCredentials | null>(null)
  const [rejecting, setRejecting] = useState<PartnerTeamInvite | null>(null)
  const [note, setNote] = useState('')

  const open = invites.filter((i) => i.status === 'requested')
  const decided = invites.filter((i) => i.status !== 'requested')

  function approve(id: string) {
    onError(null)
    start(async () => {
      const res = await provisionTeamInvite(id)
      if (!res.ok) return onError(res.error)
      setCreds(res.data)
      router.refresh()
    })
  }

  function reject() {
    if (!rejecting) return
    onError(null)
    start(async () => {
      const res = await rejectTeamInvite(rejecting.id, note)
      if (!res.ok) return onError(res.error)
      setRejecting(null)
      setNote('')
      router.refresh()
    })
  }

  if (!invites.length) return null

  return (
    <Card>
      <CardHead title="Team requests" hint="A teammate this firm has asked us to provision a login for" />
      {open.length === 0 ? (
        <Empty title="Nothing waiting" body="No open requests from this firm." />
      ) : (
        <ul className="divide-y divide-line">
          {open.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{inv.name} <span className="text-ink-faint">· {inv.email}</span></p>
                <p className="text-[11px] text-ink-faint">{TEAM_INVITE_ROLE_LABEL[inv.role]} · asked {date(inv.requested_at)}</p>
              </div>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => approve(inv.id)}>Approve</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(inv)}>Decline</Button>
            </li>
          ))}
        </ul>
      )}
      {decided.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {decided.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 px-4 py-2 text-xs text-ink-faint">
              <span className="flex-1 truncate">{inv.name} · {TEAM_INVITE_ROLE_LABEL[inv.role]}</span>
              <Badge tone={inv.status === 'approved' ? 'good' : 'bad'}>{inv.status}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <Modal open={creds !== null} onClose={() => setCreds(null)} title="Login created" hint={creds ? `For ${creds.firmName}` : undefined}>
        {creds ? <CredentialsIssued creds={creds} onDone={() => setCreds(null)} /> : null}
      </Modal>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Decline this request">
        <div className="space-y-3">
          <Field label="Why" required hint="The firm sees this note.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" disabled={pending || !note.trim()} onClick={reject}>Decline</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
