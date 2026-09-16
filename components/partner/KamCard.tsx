import { Clock, LifeBuoy, UserRound } from 'lucide-react'
import type { MyKam } from '@/lib/domain/types'
import { Card, CardHead, Problem } from '@/components/ui'
import { ContactLinks } from './ContactLinks'

/**
 * §13.5's fallback, and §8.2.5's "must never render an empty card".
 *
 * A firm can be LIVE without a KAM only by mistake — §2.5 makes assignment
 * mandatory before an org goes live — but "only by mistake" is not "never", and
 * the failure mode of an empty contact card is a partner who quietly stops
 * using the product because they had a question and nowhere to put it.
 */
/**
 * Deliberately NOT hardcoded. An invented desk number in a live partner app is
 * worse than no number: a partner rings it, reaches a stranger, and concludes
 * the whole product is fake. Set these in Vercel when the desk exists; until
 * then the card says what is true — any store can help — instead of making
 * something up.
 */
const SUPPORT_DESK = {
  name: 'Material Depot B2B desk',
  phone: process.env.NEXT_PUBLIC_B2B_DESK_PHONE ?? null,
  email: process.env.NEXT_PUBLIC_B2B_DESK_EMAIL ?? null,
  hours: process.env.NEXT_PUBLIC_B2B_DESK_HOURS ?? 'Mon–Sat, 10am – 7pm',
}

/**
 * Who to ring. A partner has no read on `staff_user`, so this comes from the
 * `my_kam()` function — their KAM and nobody else's.
 *
 * "No KAM yet" is a real state (a firm provisioned before anyone was assigned),
 * and it is said plainly rather than hidden: a partner who does not know who
 * their contact is will not go looking, they will just stop using this.
 */
export function KamCard({ kam, error }: { kam: MyKam | null; error?: string | null }) {
  return (
    <Card>
      <CardHead title="Your Material Depot contact" hint="Rates, samples, site queries — start here" />
      <div className="px-4 py-4">
        {error ? (
          <Problem title="We could not look that up" detail={error} />
        ) : !kam ? (
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-ink-soft">
              <LifeBuoy size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold text-ink">{SUPPORT_DESK.name}</p>
              <p className="text-xs text-ink-faint">
                Your key account manager has not been assigned yet — the desk covers you until they are
              </p>
              {SUPPORT_DESK.phone || SUPPORT_DESK.email ? (
                <>
                  <ContactLinks phone={SUPPORT_DESK.phone} email={SUPPORT_DESK.email} />
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <Clock size={11} /> {SUPPORT_DESK.hours}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  Anyone at a Material Depot store can help in the meantime, and we will introduce you to your key
                  account manager shortly.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            {kam.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a partner-pasted link, not one of our own optimised assets
              <img
                src={kam.photo_url}
                alt={kam.name}
                className="size-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <UserRound size={18} />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold text-ink">{kam.name}</p>
              <p className="text-xs text-ink-faint">
                Key account manager{kam.market ? ` · ${kam.market}` : ''}
              </p>
              <ContactLinks phone={kam.phone} email={kam.email} />
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                <Clock size={11} /> {SUPPORT_DESK.hours}
              </p>
              {!kam.phone && !kam.email ? (
                <p className="mt-2 text-sm text-ink-soft">
                  We do not have contact details on file for them. Any Material Depot store can put you through.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
