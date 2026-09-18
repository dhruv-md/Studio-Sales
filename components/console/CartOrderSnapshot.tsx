'use client'

import { useMemo, useState } from 'react'
import { PackageSearch, Search, ShoppingCart, UserX, X } from 'lucide-react'
import type { SnapshotResponse, SnapshotResult } from '@/lib/data/snapshot'
import { Badge, Button, Card, CardHead, Empty, Input, Problem } from '@/components/ui'
import { OrdersSection, SectionHead, snapshotCartToState } from '@/components/snapshot/Sections'
import { CartPanel } from '@/components/referrals/CartPanel'
import { phone10 } from '@/lib/format'

/**
 * User Cart & Order Snapshot — a staff support tool.
 *
 * Paste up to ten phone numbers and see, for each, what is sitting in that
 * user's Material Depot cart right now ("In their cart") and every order they
 * have placed ("What they have bought"). It talks to an internal, non-user-auth
 * backend through `/api/tools/cart-order-snapshot`, which holds the API key and
 * refuses anyone who is not staff.
 *
 * The response has failure at two levels and both are shown, never collapsed:
 * the HTTP call can fail (bad key, capped list), and — inside a 200 — an
 * individual number can carry `user_found: false` or its own `error` while its
 * neighbours succeed. A card is rendered per number regardless.
 */

const MAX = 10

export function CartOrderSnapshot() {
  const [chips, setChips] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SnapshotResult[] | null>(null)

  // A chip is valid if it parses to a real ten-digit mobile — the same test the
  // referral form uses, so a number that would never match here is caught before
  // it is sent rather than coming back as a silent "no user found".
  const invalid = useMemo(() => chips.filter((c) => !phone10(c)), [chips])
  const canSubmit = chips.length > 0 && chips.length <= MAX && invalid.length === 0 && !loading

  function addTokens(raw: string) {
    const tokens = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
    if (!tokens.length) return
    setChips((prev) => {
      const next = [...prev]
      for (const t of tokens) {
        if (next.length >= MAX) break
        if (!next.includes(t)) next.push(t)
      }
      return next
    })
    setDraft('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTokens(draft)
    } else if (e.key === 'Backspace' && !draft && chips.length) {
      setChips((prev) => prev.slice(0, -1))
    }
  }

  function removeChip(i: number) {
    setChips((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function run() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/tools/cart-order-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The backend wants numeric phone numbers.
        body: JSON.stringify({ phone_numbers: chips.map((c) => Number(phone10(c))) }),
      })
      const json = (await res.json().catch(() => ({}))) as SnapshotResponse
      if (!res.ok) {
        setError(json.error || `The lookup failed (HTTP ${res.status}).`)
        return
      }
      if (!Array.isArray(json.results)) {
        setError('The snapshot API returned no results array.')
        return
      }
      setResults(json.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHead
          title="Look up cart & orders"
          hint="Up to ten phone numbers. Press Enter, comma or space to add each one."
        />
        <div className="space-y-3 px-4 py-4">
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5
              focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft"
          >
            {chips.map((c, i) => {
              const bad = !phone10(c)
              return (
                <span
                  key={i}
                  className={
                    bad
                      ? 'inline-flex items-center gap-1 rounded-md border border-transparent bg-bad-soft px-1.5 py-0.5 text-xs font-medium text-bad'
                      : 'inline-flex items-center gap-1 rounded-md border border-line bg-raised px-1.5 py-0.5 text-xs font-medium text-ink'
                  }
                  title={bad ? 'Not a valid ten-digit mobile number' : undefined}
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeChip(i)}
                    className="text-ink-faint transition hover:text-ink"
                    aria-label={`Remove ${c}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              )
            })}
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => addTokens(draft)}
              disabled={chips.length >= MAX}
              placeholder={chips.length >= MAX ? 'Ten is the limit' : chips.length ? 'Add another…' : 'e.g. 9999999999'}
              className="h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 focus:ring-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-faint">
              <span className={chips.length > MAX ? 'font-semibold text-bad' : 'font-medium text-ink-soft'}>
                {chips.length}
              </span>
              {' / '}
              {MAX}
              {invalid.length ? <span className="text-bad"> · {invalid.length} not a valid number</span> : null}
            </span>
            <Button variant="primary" onClick={run} disabled={!canSubmit}>
              <Search size={15} /> {loading ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
        </div>
      </Card>

      {error ? <Problem title="The lookup did not run" detail={error} /> : null}

      {results
        ? results.length
          ? results.map((r) => <ResultCard key={r.phone_number} result={r} />)
          : (
            <Empty
              icon={<PackageSearch size={22} />}
              title="Nothing came back"
              body="The lookup succeeded but returned no rows."
            />
          )
        : null}
    </div>
  )
}

function ResultCard({ result }: { result: SnapshotResult }) {
  const { phone_number, user_found, error, cart, orders } = result

  return (
    <Card>
      <CardHead
        title={<span className="tnum font-mono">{phone_number}</span>}
        hint={user_found && result.user_id ? `User ${result.user_id}` : undefined}
        action={
          error ? (
            <Badge tone="bad">Error</Badge>
          ) : user_found ? (
            <Badge tone="good">User found</Badge>
          ) : (
            <Badge tone="neutral">No user</Badge>
          )
        }
      />

      {/* An entry-level error stops the two sections but not the other cards. */}
      {error ? (
        <div className="px-4 py-4">
          <Problem title="This number could not be looked up" detail={error} />
        </div>
      ) : !user_found ? (
        <div className="px-4 py-6">
          <Empty icon={<UserX size={20} />} title="No user found for this number" body="Nobody on Material Depot has this phone number." />
        </div>
      ) : (
        <div className="grid gap-px bg-line md:grid-cols-2">
          <section className="bg-surface">
            <SectionHead icon={<ShoppingCart size={14} />} title="In their cart" />
            <CartPanel cart={snapshotCartToState(cart ?? null)} emptyBody="Nothing is sitting in a cart right now." />
          </section>
          <section className="bg-surface">
            <SectionHead icon={<PackageSearch size={14} />} title="What they have bought" />
            <OrdersSection orders={orders ?? null} />
          </section>
        </div>
      )}
    </Card>
  )
}
