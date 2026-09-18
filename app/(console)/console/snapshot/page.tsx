import { requireStaff } from '@/lib/data/session'
import { CartOrderSnapshot } from '@/components/console/CartOrderSnapshot'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

/**
 * A support tool: look up any Material Depot user's live cart and order history
 * by phone number. Staff-only — the page gates here and the proxy route
 * (`/api/tools/cart-order-snapshot`) gates again, because the underlying API has
 * no per-user auth and would otherwise hand a partner a way to read a stranger.
 */
export default async function SnapshotPage() {
  const staff = await requireStaff()

  if (!staff.ok) {
    return (
      <>
        <PageHead title="Cart & order snapshot" />
        <div className="px-4 py-5 md:px-6"><Problem title="You cannot open this" detail={staff.error} /></div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Cart & order snapshot"
        hint="Paste up to ten customer phone numbers to see what is in each of their carts and everything they have ordered. For support calls — nothing here is written back."
      />
      <div className="px-4 py-5 md:px-6">
        <CartOrderSnapshot />
      </div>
    </>
  )
}
