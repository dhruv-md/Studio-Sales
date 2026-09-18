import type { Referral, ReferralEvent, ReferralOrder } from './types'
// The `.ts` is deliberate: `test/domain.test.ts` runs this file through
// `node --experimental-strip-types`, which resolves the real path and needs the
// extension. `allowImportingTsExtensions` in tsconfig.json says the same.
import { attributedSale, pendingSale } from './rewards.ts'

/**
 * What one referred client has been doing at Material Depot, rolled up.
 *
 * The partner's home page used to be a single merged stream of every event from
 * every client, newest first — four clients' store visits interleaved, which
 * reads as noise rather than as "how is each of the people I sent you doing".
 * So the unit here is the CLIENT: one row per person referred, and their
 * timeline behind it.
 *
 * Everything in this file is derived at read time from the rows the sync wrote.
 * Nothing is stored — house rule 4 — and the money is deliberately not
 * re-implemented: `attributedSale()` and `pendingSale()` in `./rewards.ts` are
 * the only two functions allowed to total a referred order, so a per-client
 * figure cannot drift from the ladder it adds up to.
 */

// ------------------------------------------------------------------- carts

export type CartLine = {
  label: string
  sku: string | null
  qty: number | null
  unit: string | null
  rate: number | null
}

export type Cart = {
  /** The event this cart was last seen on. Absent when the cart came from a
   *  live snapshot pull rather than the event log — nothing reads it, it is
   *  kept so the synced path can carry its source event. */
  event?: ReferralEvent
  at: string
  store: string | null
  /** The cart's value as Material Depot sent it. `null` means they did not. */
  value: number | null
  /** How many items are in it, or `null` when nobody told us how many. */
  itemCount: number | null
  /** The itemised contents. Empty when the push carried only prose. */
  lines: CartLine[]
  /** The prose we were given, which is all there is when `lines` is empty. */
  summary: string | null
}

/**
 * Open, converted, or there never was one.
 *
 * `referral_event` has no cart state of its own — it is an append-only log of
 * things that happened — so "is this cart still open" is worked out here, and
 * it is worked out conservatively: the newest `cart_add` counts as converted
 * the moment an `order_placed` lands at or after it. A producer that knows
 * better can say so outright with `payload.cart_status`, and that wins.
 *
 * The three states are kept apart on purpose. "No cart" and "a cart that turned
 * into an order" are different things to tell an architect, and only one of
 * them is a reason to pick up the phone.
 */
export type CartState =
  | { state: 'open'; cart: Cart }
  | { state: 'ordered'; cart: Cart; orderedAt: string }
  | { state: 'none' }

function numberish(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function toLine(raw: unknown): CartLine {
  if (typeof raw === 'string') return { label: raw.trim(), sku: null, qty: null, unit: null, rate: null }
  const o = (raw ?? {}) as Record<string, unknown>
  const sku = text(o.sku) ?? text(o.code)
  // An item we cannot name is still an item. Dropping it would quietly
  // understate a cart the architect is about to ring their client about.
  const label =
    text(o.name) ?? text(o.product_name) ?? text(o.title) ?? text(o.description) ?? sku ?? 'Item'
  return {
    label,
    sku,
    qty: numberish(o.qty) ?? numberish(o.quantity),
    unit: text(o.unit),
    rate: numberish(o.rate) ?? numberish(o.price),
  }
}

/**
 * Read a `cart_add` event as a cart.
 *
 * The sync contract's `payload` is free-form, and two shapes are in the wild:
 * `{"items": 4}` (a count, which is what the demo data carries) and
 * `{"items": [{name, sku, qty, unit, rate}, …]}` (the itemised form the CRM
 * producer should send). Both are read; neither is required.
 */
export function readCart(event: ReferralEvent): Cart {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const items = payload.items
  const lines = Array.isArray(items) ? items.map(toLine) : []
  const counted = Array.isArray(items) ? items.length : numberish(items)

  return {
    event,
    at: event.occurred_at,
    store: event.store,
    value: numberish(event.amount) ?? numberish(payload.value) ?? numberish(payload.cart_value),
    itemCount: numberish(payload.item_count) ?? counted,
    lines,
    // The prose is the contents when there is no itemised list; when there IS
    // one, showing both says the same thing twice.
    summary: lines.length ? null : (text(event.detail) ?? null),
  }
}

/**
 * The cart state for ONE referral.
 *
 * `orders` is not optional decoration. `/api/sync/referrals` takes `events` and
 * `orders` as two independent arrays, and a producer is free to push an order
 * row without also pushing an `order_placed` event — the CRM's own bridge doc
 * describes them as separate reads. Left to the event stream alone, that
 * client's converted cart would read "still open" for ever, and the architect
 * would ring a client who had already bought.
 *
 * The two signals are not equally precise and are not treated as if they were.
 * An event carries a full timestamp and is compared as an instant. An order
 * carries `ordered_on`, a DATE, so it closes a cart from the same calendar day
 * onwards — which is the common in-store flow of carting and then buying.
 */
export function cartState(events: ReferralEvent[], orders: ReferralOrder[] = []): CartState {
  const carts = events
    .filter((e) => e.event_type === 'cart_add')
    .sort((a, b) => when(b.occurred_at) - when(a.occurred_at))
  if (!carts.length) return { state: 'none' }

  const latest = carts[0]
  const cart = readCart(latest)
  const declared = text((latest.payload as Record<string, unknown> | null)?.cart_status)
  if (declared === 'open') return { state: 'open', cart }

  const closedAt = orderAfter(latest, events, orders)
  if (declared === 'ordered') return { state: 'ordered', cart, orderedAt: closedAt ?? latest.occurred_at }
  return closedAt ? { state: 'ordered', cart, orderedAt: closedAt } : { state: 'open', cart }
}

/** When an order landed at or after this cart, by either signal. Earliest wins. */
function orderAfter(
  cart: ReferralEvent,
  events: ReferralEvent[],
  orders: ReferralOrder[],
): string | null {
  const floor = when(cart.occurred_at)
  const fromEvents = events
    .filter((e) => e.event_type === 'order_placed' && when(e.occurred_at) >= floor)
    .map((e) => e.occurred_at)

  // Day granularity, because `ordered_on` is a date. Both sides are reduced to
  // the same YYYY-MM-DD so a date-only order is never compared against a
  // timestamped cart as if it happened at midnight.
  const cartDay = day(cart.occurred_at)
  const fromOrders = orders
    .filter((o) => o.ordered_on && cartDay !== null && day(o.ordered_on)! >= cartDay)
    .map((o) => o.ordered_on as string)

  const all = [...fromEvents, ...fromOrders].sort((a, b) => when(a) - when(b))
  return all.length ? all[0] : null
}

function day(v: string | null | undefined): string | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

/**
 * Timestamps are compared as instants, never as strings. PostgREST hands back
 * `+00:00` and a hand-written push may carry `+05:30`; the same moment in two
 * offsets sorts wrong as text, which would put a cart after the order that
 * closed it.
 */
function when(v: string | null | undefined): number {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

// ------------------------------------------------------------- per client

export type ClientSummary = {
  referral: Referral
  /** This client's events, newest first. */
  events: ReferralEvent[]
  /** This client's orders, newest first. */
  orders: ReferralOrder[]
  lastSeen: string | null
  /** Verified money only — the same arithmetic the rewards ladder uses. */
  approved: number
  pending: number
  pendingCount: number
  cart: CartState
  /** Stores this client has been seen in, most recent first. */
  stores: string[]
}

export function summariseClient(
  referral: Referral,
  events: ReferralEvent[],
  orders: ReferralOrder[],
): ClientSummary {
  const mine = events
    .filter((e) => e.referral_id === referral.id)
    .sort((a, b) => when(b.occurred_at) - when(a.occurred_at))
  const theirOrders = orders
    .filter((o) => o.referral_id === referral.id)
    .sort((a, b) => when(b.ordered_on) - when(a.ordered_on))
  const waiting = pendingSale(theirOrders)

  const stores: string[] = []
  for (const e of mine) if (e.store && !stores.includes(e.store)) stores.push(e.store)

  return {
    referral,
    events: mine,
    orders: theirOrders,
    lastSeen: mine.length ? mine[0].occurred_at : null,
    approved: attributedSale(theirOrders),
    pending: waiting.value,
    pendingCount: waiting.count,
    cart: cartState(mine, theirOrders),
    stores,
  }
}

/**
 * Every referred client, most recently active first.
 *
 * A client who has done nothing yet still gets a row — they are the ones worth
 * chasing — and falls back to the day they were referred so the list does not
 * bury them under a client who walked into a store this morning.
 */
export function summariseClients(
  referrals: Referral[],
  events: ReferralEvent[],
  orders: ReferralOrder[],
): ClientSummary[] {
  return referrals
    .map((r) => summariseClient(r, events, orders))
    .sort((a, b) => rank(b) - rank(a))
}

function rank(s: ClientSummary): number {
  return s.lastSeen ? when(s.lastSeen) : when(s.referral.referred_on)
}
