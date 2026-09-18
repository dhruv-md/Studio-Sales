import { fail, ok, type Result } from './result'

/**
 * The Material Depot user cart + order snapshot service — one place for its
 * request, its response shape, and the server-side call that carries the key.
 *
 * Two callers share this: the staff console tool (via `/api/tools/…`) and the
 * partner-facing "pull live cart & orders" action on a client's linked numbers.
 * The key (`MD_SNAPSHOT_API_KEY`) only ever lives here, server-side.
 */

export type CartItem = Record<string, unknown>

export type Cart = {
  status: 'active' | 'empty'
  cart_number: string | null
  item_count: number
  items: CartItem[]
}

export type Order = {
  id: number
  lead_id?: string | null
  zoho_salesorder_number?: string | null
  status: string
  estimate_status?: string | null
  delivery_status?: string | null
  total_estimate_amount?: string | null
  order_placed_time?: string | null
  created_at?: string | null
}

export type Orders = { since: string; count: number; items: Order[] }

export type Visit = {
  id: number
  name?: string | null
  contact?: number | null
  source?: string | null
  pov?: string | null
  branch_name?: string | null
  bm_assigned?: boolean | null
  bm_name?: string | null
  created_at?: string | null
  modified_at?: string | null
}

export type Visits = { count: number; items: Visit[] }

export type SnapshotResult = {
  phone_number: number
  user_found: boolean
  user_id?: string | null
  error?: string
  cart?: Cart | null
  orders?: Orders | null
  visits?: Visits | null
}

export type SnapshotResponse = { results?: SnapshotResult[]; error?: string }

const BASE = process.env.MD_SNAPSHOT_API_BASE || 'https://api-dev2.materialdepot.in/apiV1'
export const MAX_NUMBERS = 10

/**
 * Call the snapshot service for up to ten numbers. Server-only — reads the key
 * from the environment and never returns an empty list on failure (house rule
 * #1): a lookup that could not run is `ok: false`, distinct from a lookup that
 * ran and found nobody.
 */
export async function fetchSnapshot(phones: number[]): Promise<Result<SnapshotResult[]>> {
  const key = process.env.MD_SNAPSHOT_API_KEY
  if (!key) return fail('Live lookup is not configured on this deployment (MD_SNAPSHOT_API_KEY is unset).')
  if (!phones.length) return fail('No numbers to look up.')
  if (phones.length > MAX_NUMBERS) return fail(`At most ${MAX_NUMBERS} numbers can be looked up at once.`)

  try {
    const res = await fetch(`${BASE}/user-cart-order-snapshot/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify({ phone_numbers: phones }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })

    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return fail(`The snapshot service returned a non-JSON response (HTTP ${res.status}).`)
    }
    if (!res.ok) {
      const err = (json as SnapshotResponse)?.error
      return fail(err ? `Snapshot service: ${err}` : `The snapshot service returned HTTP ${res.status}.`)
    }
    const results = (json as SnapshotResponse)?.results
    if (!Array.isArray(results)) return fail('The snapshot service returned no results.')
    return ok(results)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'The snapshot request failed.')
  }
}
