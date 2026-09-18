import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/data/session'

/**
 * Server-side proxy to Material Depot's user cart + order snapshot endpoint.
 *
 * Two reasons this is a proxy and not a browser `fetch`:
 *
 * 1. **The key never reaches the browser.** The backend authenticates with a
 *    static `X-Api-Key`, not the caller's session. Putting that key in
 *    client-side code would hand every visitor a skeleton key to the snapshot
 *    API. It lives in `MD_SNAPSHOT_API_KEY` on the deployment and is read here.
 *
 * 2. **This is a staff-only capability.** The endpoint returns ANY user's cart
 *    and order history keyed only by phone number — there is no per-user auth on
 *    it. A partner may only ever see the clients they themselves referred, so
 *    this route refuses anyone who is not Material Depot staff. The
 *    `requireStaff()` gate is the app-layer half; the key being server-only is
 *    the other half.
 */

const BASE = process.env.MD_SNAPSHOT_API_BASE || 'https://api-dev2.materialdepot.in/apiV1'
const MAX_NUMBERS = 10

type Body = { phone_numbers?: unknown }

export async function POST(req: Request) {
  // A partner (or a signed-out visitor) must not be able to look up a stranger's
  // cart. Gate before we touch the key or the upstream at all.
  const staff = await requireStaff()
  if (!staff.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const key = process.env.MD_SNAPSHOT_API_KEY
  if (!key) {
    // Named, not silent — this is how you tell from outside that a deploy did
    // not pick the variable up, the same way /api/sync/referrals does.
    return NextResponse.json(
      { error: 'MD_SNAPSHOT_API_KEY is not set on this deployment' },
      { status: 503 },
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'bad request body' }, { status: 400 })
  }

  // Validate here too — the same shape the backend enforces — so the client can
  // trust a 400 without a round trip, and so a malformed list never spends the
  // upstream's budget.
  const nums = body.phone_numbers
  if (!Array.isArray(nums) || nums.length === 0) {
    return NextResponse.json({ error: 'phone_numbers must be a non-empty list' }, { status: 400 })
  }
  if (nums.length > MAX_NUMBERS) {
    return NextResponse.json({ error: 'phone_numbers is capped at 10' }, { status: 400 })
  }

  try {
    const res = await fetch(`${BASE}/user-cart-order-snapshot/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify({ phone_numbers: nums }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })

    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: `The snapshot API returned something that is not JSON (HTTP ${res.status}).` },
        { status: 502 },
      )
    }
    // Pass the upstream status straight through: a 401 (bad key), 400 (bad list)
    // or 200 (with per-entry results) all mean the same thing to the client as
    // they do to us.
    return NextResponse.json(json, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Snapshot request failed' },
      { status: 502 },
    )
  }
}
