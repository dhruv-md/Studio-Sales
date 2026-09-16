import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/server'

/**
 * The other half of the bridge to the CRM. `/api/sync/referrals` is the CRM
 * pushing IN (orders, events); this is Material Depot's console reading OUT
 * — new referrals and visit requests a partner has created, which are
 * partner-owned data the CRM's B2B sales tab needs to reflect against the
 * right KAM. See `docs/kam-bridge.md` for the full contract and what the CRM
 * side still has to build.
 *
 * Same auth as the referrals sync — `x-sync-key: $SYNC_SHARED_SECRET` — and
 * the same idempotency shape as everywhere else in this app: every row here
 * has a stable UUID, so a re-delivered row is a duplicate the CRM can dedupe
 * on rather than a new one.
 *
 * `pushed_at` is delivery bookkeeping, not a source of truth. A row is
 * returned once (where `pushed_at is null`) and marked delivered in the same
 * request. If the CRM's own write then fails, that row will not be offered
 * again automatically — `docs/kam-bridge.md` names this as the trade-off of
 * a v1 contract for non-money data, and how to force a re-send if it happens.
 */
export async function GET(req: Request) {
  const secret = process.env.SYNC_SHARED_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_SHARED_SECRET is not set on this deployment' }, { status: 503 })
  }
  if (req.headers.get('x-sync-key') !== secret) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const svc = supabaseService()

  const { data: referrals, error: refErr } = await svc
    .from('referral')
    .select('id, partner_id, client_name, md_phone, email, city, project_type, project_type_other, categories, notes, referred_on, created_at')
    .is('pushed_at', null)
    .order('created_at')
    .limit(200)
  if (refErr) return NextResponse.json({ error: `referral read failed: ${refErr.message}` }, { status: 500 })

  const { data: visits, error: visitErr } = await svc
    .from('visit_request')
    .select('id, referral_id, ec_name, scheduled_on, scheduled_time, categories, requirements, notes, status, created_at')
    .is('pushed_at', null)
    .order('created_at')
    .limit(200)
  if (visitErr) return NextResponse.json({ error: `visit_request read failed: ${visitErr.message}` }, { status: 500 })

  const now = new Date().toISOString()
  if (referrals?.length) {
    const { error } = await svc.from('referral').update({ pushed_at: now }).in('id', referrals.map((r) => r.id))
    if (error) return NextResponse.json({ error: `could not mark referrals delivered: ${error.message}` }, { status: 500 })
  }
  if (visits?.length) {
    const { error } = await svc.from('visit_request').update({ pushed_at: now }).in('id', visits.map((v) => v.id))
    if (error) return NextResponse.json({ error: `could not mark visits delivered: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    referrals: referrals ?? [],
    visits: visits ?? [],
  })
}
