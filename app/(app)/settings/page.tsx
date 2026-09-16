import Link from 'next/link'
import { UsersRound } from 'lucide-react'
import { currentSession, myKam } from '@/lib/data/session'
import { listNotificationPrefs, listTeamInvites } from '@/lib/data/queries'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { ThemePicker } from '@/components/settings/ThemePicker'
import { NotificationPrefs } from '@/components/settings/NotificationPrefs'
import { TeamInvites } from '@/components/settings/TeamInvites'
import { ChangePassword } from '@/components/account/ChangePassword'
import { KamCard } from '@/components/partner/KamCard'
import { PageHead } from '@/components/shell/PageHead'
import { Badge, Card, CardHead, Problem } from '@/components/ui'
import type { PartnerTeamInvite } from '@/lib/domain/types'

/**
 * About / Settings — PRD §13.
 *
 * Five sections, in the §7 information architecture's order: company profile,
 * team and GSTINs, theme, notifications, KAM contact.
 *
 * Two of them are deliberately read-only, and saying so on screen is the point
 * rather than a shortcoming:
 *
 * - **Team** (§13.2). "The Owner raises a request to add a user or change a
 *   designation; Admin approves and provisions." `partner_user` has no insert
 *   policy for a firm, by design — a self-serve seat would be a login to a
 *   supplier's system that the supplier did not issue. So this is a request,
 *   and it says who to ask.
 *
 * - **GSTIN** (§13.1). Adding one changes which orders roll up into the reward
 *   base, so it goes through an admin. On the profile form above.
 *
 * **Sign-in** is the fifth, and it is not in §13. Every partner login on this
 * platform begins as a password a Material Depot admin generated and sent over
 * WhatsApp, and since `006_credentials.sql` the console keeps that password
 * until it is changed. There was nowhere in the partner app to change it. A
 * retention with no exit is not a retention, it is a copy.
 */
const TABS = [
  { key: 'profile', label: 'Studio' },
  { key: 'team', label: 'Team & GST' },
  { key: 'theme', label: 'Appearance' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'signin', label: 'Sign-in' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const active: TabKey = (TABS.find((t) => t.key === tab)?.key ?? 'profile') as TabKey

  const [session, kam, prefs, invites] = await Promise.all([
    currentSession(), myKam(), listNotificationPrefs(), listTeamInvites(),
  ])

  if (!session.ok) {
    return (
      <Shell active={active}>
        <Problem title="We could not load your settings" detail={session.error} />
      </Shell>
    )
  }
  if (!session.data) {
    return (
      <Shell active={active}>
        <Problem title="You are not signed in" />
      </Shell>
    )
  }

  const { partner, email } = session.data

  return (
    <Shell active={active}>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {active === 'profile' ? <ProfileForm partner={partner} /> : null}
          {active === 'theme' ? <ThemePicker partner={partner} /> : null}
          {active === 'notifications' ? (
            prefs.ok ? (
              <NotificationPrefs pref={prefs.data} />
            ) : (
              <Problem title="We could not load your notification settings" detail={prefs.error} />
            )
          ) : null}
          {active === 'team' ? (
            <Team
              partner={partner}
              email={email}
              invites={invites.ok ? invites.data : []}
              invitesError={invites.ok ? null : invites.error}
            />
          ) : null}
          {active === 'signin' ? (
            <ChangePassword hint="Your login was created by Material Depot and the password was generated for you. Changing it here is what stops anyone there being able to read it." />
          ) : null}
        </div>

        <div className="space-y-5">
          <KamCard kam={kam.ok ? kam.data : null} error={kam.ok ? null : kam.error} />
          <Card>
            <CardHead title="How we use what you put here" hint="Plain version" />
            <div className="space-y-2.5 px-4 py-3 text-xs leading-relaxed text-ink-soft">
              <p>
                Your studio profile and your published work go on materialdepot.com. Nothing else here does.
              </p>
              <p>
                Material Depot staff can see your firm, the clients you referred us, and what those clients bought from
                us. They cannot see your own client list, your projects, your quotes or your margins — there is no
                policy anywhere in this system that would let them.
              </p>
              <p>
                Reference images you upload to a project inform what we stock, aggregated and anonymised. We never show
                one firm&rsquo;s references to another.{' '}
                <Link href="/rewards?tab=terms" className="text-brand hover:underline">
                  The programme terms
                </Link>{' '}
                cover the rest.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

function Team({
  partner, email, invites, invitesError,
}: {
  partner: { firm_name: string; gst: string | null; phone: string }
  email: string | null
  invites: PartnerTeamInvite[]
  invitesError?: string | null
}) {
  return (
    <>
      <Card>
        <CardHead
          title="Who can get in"
          hint="You, plus anyone Material Depot has issued a login to on your behalf."
        />
        <div className="px-4 pt-4">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-raised px-3 py-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <UsersRound size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{email ?? partner.phone}</p>
              <p className="text-xs text-ink-faint">You · full access</p>
            </div>
            <Badge tone="good" className="ml-auto">Active</Badge>
          </div>
        </div>

        {/* §13.2 as a real request now, not just instructions: `partner_user`
            still has no insert policy for a firm and never will — a self-serve
            seat would be a login into Material Depot's systems the firm did
            not ask us to issue — but a firm can file the request itself and
            see where it has got to, instead of a phone call that leaves no
            record. */}
        {invitesError ? (
          <div className="px-4 pb-4"><Problem title="Your team requests could not be loaded" detail={invitesError} /></div>
        ) : (
          <TeamInvites invites={invites} />
        )}
      </Card>

      <Card>
        <CardHead
          title="Billing entities"
          hint="Orders on any GST linked to your firm roll up together for your rewards"
        />
        <div className="px-4 py-4">
          {partner.gst ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2.5">
              <div>
                <p className="tnum text-sm font-medium text-ink">{partner.gst}</p>
                <p className="text-xs text-ink-faint">{partner.firm_name}</p>
              </div>
              <Badge tone="good">Linked</Badge>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No GST on file yet.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            If your practice bills through more than one entity, tell your key account manager and we will link them.
            Everything billed on a linked GST counts towards the same slab, while the invoices stay entity-specific.
            Linking is done by us because it changes what counts towards your rewards.
          </p>
        </div>
      </Card>
    </>
  )
}

function Shell({ children, active }: { children: React.ReactNode; active: TabKey }) {
  return (
    <>
      <PageHead title="Settings" hint="Your studio, who can get in, and how this thing looks and talks to you." />
      <div className="border-b border-line px-4 md:px-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/settings?tab=${t.key}`}
              className={[
                'border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition',
                active === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-soft hover:border-line-strong hover:text-ink',
              ].join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="px-4 py-5 md:px-6">{children}</div>
    </>
  )
}
