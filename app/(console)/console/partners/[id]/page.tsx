import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'
import { requireStaff } from '@/lib/data/session'
import {
  getPartner, listActivityFor, listClaimsFor, listOrdersFor, listPortfolioFor, listReferralsFor, listStaff,
  listTeamInvitesFor,
} from '@/lib/data/console-queries'
import { listRewardTiers } from '@/lib/data/queries'
import { PartnerDetail } from '@/components/console/PartnerDetail'
import { partnerStanding } from '@/lib/domain/tiering'
import { PageHead } from '@/components/shell/PageHead'
import { Button, Problem } from '@/components/ui'

export default async function ConsolePartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [staff, partner] = await Promise.all([requireStaff(), getPartner(id)])

  if (!staff.ok) {
    return (
      <>
        <PageHead title="Firm" />
        <div className="px-4 py-5 md:px-6"><Problem title="You cannot open this" detail={staff.error} /></div>
      </>
    )
  }
  if (!partner.ok) {
    return (
      <>
        <PageHead title="Firm" />
        <div className="px-4 py-5 md:px-6"><Problem title="This firm could not be loaded" detail={partner.error} /></div>
      </>
    )
  }
  // Nothing back from an RLS-scoped read is "not yours to see", which for a
  // staff member out of market is the same answer as "does not exist".
  if (!partner.data) notFound()

  const [referrals, claims, tiers, activity, team, portfolio, teamInvites] = await Promise.all([
    listReferralsFor(id), listClaimsFor(id), listRewardTiers(), listActivityFor(id), listStaff(),
    listPortfolioFor(id), listTeamInvitesFor(id),
  ])

  const orders = await listOrdersFor(referrals.ok ? referrals.data.map((r) => r.id) : [])

  const problems = [
    !referrals.ok ? referrals.error : null,
    !orders.ok ? orders.error : null,
    !claims.ok ? claims.error : null,
    !tiers.ok ? tiers.error : null,
    !activity.ok ? activity.error : null,
    !portfolio.ok ? portfolio.error : null,
    !teamInvites.ok ? teamInvites.error : null,
  ].filter((v): v is string => Boolean(v))

  return (
    <>
      <PageHead
        title={partner.data.firm_name}
        crumbs={[{ href: '/console/partners', label: 'Firms' }, { label: partner.data.firm_name }]}
        action={
          <Link href={`/console/partners/${partner.data.id}/dashboard`}>
            <Button><Eye size={14} /> Open their dashboard</Button>
          </Link>
        }
      />
      <div className="px-4 py-5 md:px-6">
        <PartnerDetail
          partner={partner.data}
          standing={partnerStanding(orders.ok ? orders.data : [])}
          referrals={referrals.ok ? referrals.data : []}
          orders={orders.ok ? orders.data : []}
          claims={claims.ok ? claims.data : []}
          tiers={tiers.ok ? tiers.data : []}
          activity={activity.ok ? activity.data : []}
          portfolio={portfolio.ok ? portfolio.data : []}
          team={team.ok ? team.data : []}
          teamInvites={teamInvites.ok ? teamInvites.data : []}
          isAdmin={staff.data.role === 'admin'}
          problems={problems}
        />
      </div>
    </>
  )
}
