import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/server'

const STATUSES = ['requested', 'bm_assigned', 'completed', 'cancelled']

/**
 * The CRM writes back once a KAM and the store team have named a BM for a
 * scheduled visit. Same auth as every other sync route. Service role is what
 * lets this move `status` and the `assigned_bm_*` columns at all —
 * `visit_request_guard_md_fields()` (007_studio_v2.sql) freezes those against
 * any authenticated partner session, and the service role's `auth.uid()` is
 * null, which the trigger treats the same way `referral_guard_md_fields()`
 * treats it: Material Depot's side, not the firm's.
 */
export async function POST(req: Request) {
  const secret = process.env.SYNC_SHARED_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_SHARED_SECRET is not set on this deployment' }, { status: 503 })
  }
  if (req.headers.get('x-sync-key') !== secret) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  let body: {
    visit_request_id?: string
    status?: string
    assigned_bm_name?: string | null
    assigned_bm_phone?: string | null
    assigned_bm_email?: string | null
    assigned_bm_photo_url?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad request body' }, { status: 400 })
  }

  if (!body.visit_request_id) return NextResponse.json({ error: 'visit_request_id is required' }, { status: 400 })
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 })
  }

  const svc = supabaseService()
  const values: Record<string, unknown> = { status: body.status }
  for (const k of ['assigned_bm_name', 'assigned_bm_phone', 'assigned_bm_email', 'assigned_bm_photo_url'] as const) {
    if (body[k] !== undefined) values[k] = body[k]
  }

  const { data, error } = await svc
    .from('visit_request')
    .update(values)
    .eq('id', body.visit_request_id)
    .select()
  if (error) return NextResponse.json({ error: `update failed: ${error.message}` }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'no such visit request' }, { status: 404 })

  return NextResponse.json({ ok: true, visit: data[0] })
}
