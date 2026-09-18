import { requireStaff } from '@/lib/data/session'
import { listAllOrders, listPendingPhones, listPortfolioQueue } from '@/lib/data/console-queries'
import { ApprovalQueue } from '@/components/console/ApprovalQueue'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

export default async function ApprovalsPage() {
  const [staff, orders, portfolio, numbers] = await Promise.all([
    requireStaff(), listAllOrders(), listPortfolioQueue(), listPendingPhones(),
  ])

  if (!staff.ok) {
    return (
      <>
        <PageHead title="Verify" />
        <div className="px-4 py-5 md:px-6"><Problem title="You cannot open this" detail={staff.error} /></div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Verify"
        hint="An order counts towards a partner's rewards only once it has been checked here, work goes on our site only once it has been read, and a number a firm links to a client only matches a cart or order once it has been approved."
      />
      <div className="px-4 py-5 md:px-6">
        <ApprovalQueue
          orders={orders.ok ? orders.data : []}
          portfolio={portfolio.ok ? portfolio.data : []}
          numbers={numbers.ok ? numbers.data : []}
          canDecide={staff.data.role === 'admin'}
          ordersError={orders.ok ? null : orders.error}
          portfolioError={portfolio.ok ? null : portfolio.error}
          numbersError={numbers.ok ? null : numbers.error}
        />
      </div>
    </>
  )
}
