import { UserRound } from 'lucide-react'
import type { VisitRequest } from '@/lib/domain/types'
import { Badge, Empty, type Tone } from '@/components/ui'
import { date } from '@/lib/format'

const STATUS: Record<VisitRequest['status'], { label: string; tone: Tone }> = {
  requested: { label: 'Waiting on a BM', tone: 'info' },
  bm_assigned: { label: 'BM assigned', tone: 'good' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/**
 * Every store visit scheduled for this client — the first one from the
 * referral form, and any repeat visit scheduled afterwards. The KAM and store
 * team coordinate a BM against each one; once that happens, their contact
 * details render right here against the visit they were assigned to.
 */
export function VisitLog({ visits }: { visits: VisitRequest[] }) {
  if (visits.length === 0) {
    return <Empty title="No visits scheduled" body="Schedule a store visit and it will show up here." />
  }

  const sorted = [...visits].sort((a, b) => `${b.scheduled_on} ${b.scheduled_time}`.localeCompare(`${a.scheduled_on} ${a.scheduled_time}`))

  return (
    <ul className="divide-y divide-line">
      {sorted.map((v) => {
        const s = STATUS[v.status] ?? { label: v.status, tone: 'neutral' as const }
        return (
          <li key={v.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">
                  {date(v.scheduled_on)} · {v.scheduled_time}
                  {v.ec_name ? <span className="ml-1.5 font-normal text-ink-faint">· {v.ec_name}</span> : null}
                </p>
                {v.categories.length ? (
                  <p className="mt-0.5 text-xs text-ink-faint">{v.categories.join(', ')}</p>
                ) : null}
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            {v.requirements ? <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{v.requirements}</p> : null}
            {v.status === 'bm_assigned' || v.status === 'completed' ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <UserRound size={13} />
                </span>
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-ink">{v.assigned_bm_name ?? 'A store BM'}</p>
                  <p className="tnum text-ink-faint">
                    {[v.assigned_bm_phone, v.assigned_bm_email].filter(Boolean).join(' · ') || 'Contact details pending'}
                  </p>
                </div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
