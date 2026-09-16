import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/data/session'
import {
  getPartner, listActivityFor, listClaimsFor, listEventsFor, listOrdersFor, listPortfolioFor,
  listReferralsFor, listStaff,
} from '@/lib/data/console-queries'
import { listRewardTiers } from '@/lib/data/queries'
import { PartnerAsSeen } from '@/components/console/PartnerAsSeen'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'
import type { MyKam } from '@/lib/domain/types'

/**
 * A firm's own dashboard, opened from the console.
 *
 * ## Why there is no new permission here
 *
 * Every table this page reads — `partner`, `referral`, `referral_order`,
 * `referral_event`, `reward_tier`, `reward_claim`, `partner_activity`,
 * `portfolio_item` — already has a staff SELECT policy from `004_roles_rls.sql`,
 * scoped by `app_staff_sees_partner()`. Nothing was added to the database for
 * this, and nothing should be: an admin has `market = null` so
 * `app_covers_market()` is true for every firm, which is what "all the partner
 * dashboards" means, and a KAM opening the same URL for a firm outside their
 * market gets a 404 out of the same policy that already guards the firm page.
 *
 * The line this page does NOT cross is the one in `docs/roles.md`: staff see
 * the relationship, never the work. There is no read of `client`, `project`,
 * `project_area`, `board`, `board_item`, `quote`, `quote_line`,
 * `procurement_item` or `finance_entry` here, and a policy that made one
 * possible would throw away the reason a designer trusts this app with their
 * pricing at all.
 *
 * ## Read-only, and not an impersonation
 *
 * This renders the firm's data under the STAFF member's own session. Nobody is
 * signed in as the partner, no token is swapped, and every write action is
 * simply absent from the page rather than disabled — so a bug here cannot post
 * anything as the firm, and the audit trail keeps saying who was really looking.
 */
export default async function PartnerAsSeenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [staff, partner] = await Promise.all([requireStaff(), getPartner(id)])

  if (!staff.ok) {
    return (
      <>
        <PageHead title="Their dashboard" />
        <div className="px-4 py-5 md:px-6"><Problem title="You cannot open this" detail={staff.error} /></div>
      </>
    )
  }
  if (!partner.ok) {
    return (
      <>
        <PageHead title="Their dashboard" />
        <div className="px-4 py-5 md:px-6"><Problem title="This firm could not be loaded" detail={partner.error} /></div>
      </>
    )
  }
  // Nothing back from an RLS-scoped read is "not yours to see", which for a
  // staff member out of market is the same answer as "does not exist".
  if (!partner.data) notFound()
  const firm = partner.data

  const [referrals, claims, tiers, activity, portfolio, team] = await Promise.all([
    listReferralsFor(id), listClaimsFor(id), listRewardTiers(), listActivityFor(id),
    listPortfolioFor(id), listStaff(),
  ])

  const refIds = referrals.ok ? referrals.data.map((r) => r.id) : []
  const [orders, events] = await Promise.all([listOrdersFor(refIds), listEventsFor(refIds)])

  // What `my_kam()` would hand this firm, rebuilt from the row staff can read.
  // The `active` check is not decoration: the function joins `staff_user s on
  // … and s.active`, so a firm whose KAM has left sees "nobody is assigned to
  // your account yet" — and a mirror that showed a name their screen does not
  // is a mirror nobody can trust to read down the phone.
  const kamRow = firm.kam_user_id
    ? (team.ok ? team.data : []).find((s) => s.user_id === firm.kam_user_id && s.active)
    : undefined
  const kam: MyKam | null = kamRow
    ? { name: kamRow.name, phone: kamRow.phone, email: kamRow.email, market: kamRow.market, photo_url: kamRow.photo_url }
    : null

  const problems = [
    !referrals.ok ? referrals.error : null,
    !orders.ok ? orders.error : null,
    !events.ok ? events.error : null,
    !claims.ok ? claims.error : null,
    !tiers.ok ? tiers.error : null,
    !activity.ok ? activity.error : null,
    !portfolio.ok ? portfolio.error : null,
    !team.ok ? `Could not load the team, so their Material Depot contact is not shown: ${team.error}` : null,
  ].filter((v): v is string => Boolean(v))

  return (
    <>
      <PageHead
        title={`${firm.firm_name} — their dashboard`}
        hint="What this firm sees when they sign in. Read-only, and nothing internal."
        crumbs={[
          { href: '/console/partners', label: 'Firms' },
          { href: `/console/partners/${firm.id}`, label: firm.firm_name },
          { label: 'Their dashboard' },
        ]}
      />
      <div className="px-4 py-5 md:px-6">
        <PartnerAsSeen
          partner={firm}
          kam={kam}
          referrals={referrals.ok ? referrals.data : []}
          orders={orders.ok ? orders.data : []}
          events={events.ok ? events.data : []}
          tiers={tiers.ok ? tiers.data : []}
          claims={claims.ok ? claims.data : []}
          activity={activity.ok ? activity.data : []}
          portfolio={portfolio.ok ? portfolio.data : []}
          problems={problems}
        />
      </div>
    </>
  )
}
