import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/server'
import { recordUnlockedTiers } from '@/lib/data/unlock'
import { phone10 } from '@/lib/format'

/**
 * Ingest what Material Depot's systems know about a partner's referred clients:
 * store visits, products looked at, carts, quotes and orders.
 *
 * Push, not pull. This route takes a payload; it does not go and fetch from
 * Django. That is deliberate — the referral facts live across three systems
 * (Django `/crm/leads/`, Kylas, and the field-ops Supabase), each with its own
 * credentials, and none of them is reachable from a partner's browser. Whoever
 * owns that data pushes it here on a schedule, authenticated with
 * `SYNC_SHARED_SECRET`.
 *
 * Two properties this route must keep:
 *
 * 1. **Idempotent.** `referral_event.external_id` and `referral_order.md_enq_id`
 *    are unique and every write is an upsert on them. Material Depot's field
 *    apps log one real event several times — a single store arrival has been
 *    seen logged twenty times — so "visited 20 times" is a number this route
 *    exists to prevent an architect from ever reading.
 *
 * 2. **Exact phone matching, with three outcomes.** A row either matches one
 *    referral, matches none, or matches more than one. The third is NOT folded
 *    into the second: it is reported as `ambiguous` and skipped, because
 *    attributing an order to the wrong architect pays the wrong person.
 *
 * An order written here lands as `approval_status = 'pending'` and counts
 * towards NOTHING until a Material Depot admin verifies it in the console. So
 * `tiers_unlocked` will normally be empty on a sync: a tier is crossed at
 * approval, not at arrival. The call is still made, because a re-sync that
 * corrects an already-approved order's value upward can cross one.
 *
 * The upsert deliberately does not carry `approval_status`. An absent column is
 * left alone on an existing row, so a nightly re-sync cannot reset an order an
 * admin has already decided on — and cannot approve one either.
 */

type IncomingEvent = {
  phone: string
  external_id: string
  event_type: 'store_visit' | 'product_view' | 'cart_add' | 'quote_shared' | 'order_placed' | 'call' | 'other'
  occurred_at: string
  store?: string | null
  title?: string | null
  detail?: string | null
  amount?: number | null
  payload?: Record<string, unknown>
}

type IncomingOrder = {
  phone: string
  md_enq_id: string
  order_value: number
  ordered_on?: string | null
  store?: string | null
  status?: string | null
}

type SyncBody = { events?: IncomingEvent[]; orders?: IncomingOrder[] }

type Skip = { key: string; reason: 'no_match' | 'ambiguous' | 'bad_phone' | 'bad_row'; detail?: string }

/**
 * Drop keys the caller did not send, so an upsert leaves those columns alone
 * instead of overwriting them with null.
 *
 * `null` is kept — sending an explicit null is how a caller says "clear this".
 * Only `undefined` is dropped.
 */
function defined<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as Partial<T>
}

export async function POST(req: Request) {
  const secret = process.env.SYNC_SHARED_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_SHARED_SECRET is not set on this deployment' }, { status: 503 })
  }
  if (req.headers.get('x-sync-key') !== secret) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  let body: SyncBody
  try {
    body = (await req.json()) as SyncBody
  } catch {
    return NextResponse.json({ error: 'bad request body' }, { status: 400 })
  }

  const events = body.events ?? []
  const orders = body.orders ?? []
  if (!events.length && !orders.length) {
    return NextResponse.json({ error: 'nothing to sync: send events and/or orders' }, { status: 400 })
  }

  const db = supabaseService()

  // Resolve every phone in one query, then match EXACTLY in memory.
  const phones = new Set<string>()
  const skipped: Skip[] = []
  for (const e of events) {
    const p = phone10(e.phone)
    if (p) phones.add(p)
  }
  for (const o of orders) {
    const p = phone10(o.phone)
    if (p) phones.add(p)
  }

  const { data: referrals, error: refErr } = await db
    .from('referral')
    .select('id, partner_id, md_phone')
    .in('md_phone', [...phones])
  if (refErr) {
    return NextResponse.json({ error: `referral lookup failed: ${refErr.message}` }, { status: 500 })
  }

  // A phone can legitimately appear under two partners — two architects both
  // claiming the same client. That is a human decision, not a heuristic one.
  //
  // A client is not only matched on `referral.md_phone` — 007_studio_v2.sql's
  // `referral_phone` holds every OTHER number a firm has linked to a client
  // (their own number, an additional one), and a cart or order on any of them
  // belongs to the same client. Both sources feed the same map, deduplicated
  // by referral id: a phone that happens to equal both a referral's md_phone
  // AND one of its own referral_phone rows is one match, not two.
  const byPhone = new Map<string, Map<string, { id: string; partner_id: string }>>()
  function addHit(phone: string, hit: { id: string; partner_id: string }) {
    const hits = byPhone.get(phone) ?? new Map()
    hits.set(hit.id, hit)
    byPhone.set(phone, hits)
  }
  for (const r of referrals ?? []) {
    addHit(r.md_phone, { id: r.id, partner_id: r.partner_id })
  }

  const referralById = new Map((referrals ?? []).map((r) => [r.id, r]))
  const { data: extraPhones, error: extraErr } = await db
    .from('referral_phone')
    .select('phone, referral_id')
    .in('phone', [...phones])
  if (extraErr) {
    return NextResponse.json({ error: `referral_phone lookup failed: ${extraErr.message}` }, { status: 500 })
  }
  const missingReferralIds = [...new Set((extraPhones ?? []).map((p) => p.referral_id).filter((id) => !referralById.has(id)))]
  if (missingReferralIds.length) {
    const { data: more, error: moreErr } = await db
      .from('referral')
      .select('id, partner_id, md_phone')
      .in('id', missingReferralIds)
    if (moreErr) return NextResponse.json({ error: `referral lookup failed: ${moreErr.message}` }, { status: 500 })
    for (const r of more ?? []) referralById.set(r.id, r)
  }
  for (const p of extraPhones ?? []) {
    const ref = referralById.get(p.referral_id)
    if (ref) addHit(p.phone, { id: ref.id, partner_id: ref.partner_id })
  }

  function resolve(rawPhone: string, key: string): { id: string; partner_id: string } | null {
    const p = phone10(rawPhone)
    if (!p) {
      skipped.push({ key, reason: 'bad_phone', detail: rawPhone })
      return null
    }
    const hits = [...(byPhone.get(p)?.values() ?? [])]
    if (hits.length === 1) return hits[0]
    if (hits.length === 0) {
      skipped.push({ key, reason: 'no_match', detail: p })
      return null
    }
    skipped.push({
      key,
      reason: 'ambiguous',
      detail: `${p} is referred by ${hits.length} partners — needs a human to decide whose it is`,
    })
    return null
  }

  const eventRows = []
  for (const e of events) {
    if (!e.external_id || !e.event_type || !e.occurred_at) {
      skipped.push({ key: e.external_id || '(no external_id)', reason: 'bad_row', detail: 'external_id, event_type and occurred_at are all required' })
      continue
    }
    const ref = resolve(e.phone, e.external_id)
    if (!ref) continue
    // Only the keys the caller actually sent. `store: e.store ?? null` looks
    // harmless and is not: an upsert writes every column in the payload, so a
    // re-sync that carries just the id and the value would blank the store and
    // the date on a row that already had them. Verified the hard way against
    // production on 2026-09-11 — an order lost its store and ordered_on to
    // exactly this.
    eventRows.push(
      defined({
        referral_id: ref.id,
        event_type: e.event_type,
        occurred_at: e.occurred_at,
        store: e.store,
        title: e.title,
        detail: e.detail,
        amount: e.amount,
        payload: e.payload,
        external_id: e.external_id,
      }),
    )
  }

  const orderRows = []
  const touchedPartners = new Set<string>()
  for (const o of orders) {
    if (!o.md_enq_id) {
      skipped.push({ key: '(no md_enq_id)', reason: 'bad_row', detail: 'md_enq_id is required' })
      continue
    }
    const ref = resolve(o.phone, o.md_enq_id)
    if (!ref) continue
    orderRows.push(
      defined({
        referral_id: ref.id,
        md_enq_id: o.md_enq_id,
        order_value: Number(o.order_value) || 0,
        ordered_on: o.ordered_on,
        store: o.store,
        status: o.status,
        synced_at: new Date().toISOString(),
      }),
    )
    touchedPartners.add(ref.partner_id)
  }

  // Upsert, not insert. The unique keys are what make a re-run harmless.
  let eventsWritten = 0
  if (eventRows.length) {
    const { error, count } = await db
      .from('referral_event')
      .upsert(eventRows, { onConflict: 'external_id', count: 'exact' })
    if (error) return NextResponse.json({ error: `event upsert failed: ${error.message}` }, { status: 500 })
    eventsWritten = count ?? eventRows.length
  }

  let ordersWritten = 0
  if (orderRows.length) {
    const { error, count } = await db
      .from('referral_order')
      .upsert(orderRows, { onConflict: 'md_enq_id', count: 'exact' })
    if (error) return NextResponse.json({ error: `order upsert failed: ${error.message}` }, { status: 500 })
    ordersWritten = count ?? orderRows.length
  }

  const unlocked = await recordUnlockedTiers(db, [...touchedPartners])

  return NextResponse.json({
    ok: true,
    events: { received: events.length, written: eventsWritten },
    orders: { received: orders.length, written: ordersWritten },
    tiers_unlocked: unlocked,
    // Always reported, never swallowed. A sync that quietly dropped 40 orders
    // because nobody had referred those phones is the failure this names.
    skipped,
  })
}
