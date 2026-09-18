'use client'

import { useState } from 'react'
import { UserX } from 'lucide-react'
import type { SnapshotResult } from '@/lib/data/snapshot'
import { Badge, Empty, Problem, Select } from '@/components/ui'
import { snapshotCartToState } from '@/components/snapshot/Sections'
import { CartPanel } from './CartPanel'

/**
 * The live cart pulled from Material Depot, in its own card. Pick a number from
 * the dropdown and its cart shows below — one at a time, so a client with several
 * linked numbers does not become a stack of panels. Drawn through the same
 * CartPanel the synced cart uses, via `snapshotCartToState`.
 */
export function LiveCart({ results }: { results: SnapshotResult[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  // Fall back to the first number when nothing is chosen, or when a fresh pull
  // no longer contains the previously-selected one.
  const active = results.find((r) => r.phone_number === selected) ?? results[0]
  if (!active) return null

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {results.length > 1 ? (
          <Select
            value={active.phone_number}
            onChange={(e) => setSelected(Number(e.target.value))}
            aria-label="Choose a number"
            className="h-8 flex-1 text-xs"
          >
            {results.map((r) => (
              <option key={r.phone_number} value={r.phone_number}>
                {r.phone_number}
                {r.error ? ' — error' : r.user_found ? '' : ' — no user'}
              </option>
            ))}
          </Select>
        ) : (
          <span className="tnum flex-1 font-mono text-xs text-ink">{active.phone_number}</span>
        )}
        {active.error ? (
          <Badge tone="bad">Error</Badge>
        ) : active.user_found ? (
          <Badge tone="good">User found</Badge>
        ) : (
          <Badge tone="neutral">No user</Badge>
        )}
      </div>

      {active.error ? (
        <div className="px-4 py-3"><Problem title="Could not look this number up" detail={active.error} /></div>
      ) : !active.user_found ? (
        <div className="px-4 py-5">
          <Empty icon={<UserX size={18} />} title="No user found for this number" body="Nobody on Material Depot has this number." />
        </div>
      ) : (
        <CartPanel cart={snapshotCartToState(active.cart ?? null)} emptyBody="Nothing is sitting in a cart right now." />
      )}
    </div>
  )
}
