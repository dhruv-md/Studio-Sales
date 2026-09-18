import { PackageSearch, Phone, UserRound } from 'lucide-react'
import type { Cart as SnapshotCart, CartItem, Order, Orders, Visit } from '@/lib/data/snapshot'
import type { CartLine, CartState } from '@/lib/domain/referrals'
import { Badge, Empty, type Tone } from '@/components/ui'
import { date, dateTime, inr } from '@/lib/format'

/**
 * The pieces a snapshot result needs to render, shared between the staff console
 * tool and the partner client-detail panel. Kept out of `console/` because both
 * apps use it, the way `account/` holds the other cross-app component.
 *
 * The cart is NOT rendered here — a live cart is mapped into the domain
 * `CartState` (`snapshotCartToState`) and drawn by the existing `CartPanel`, so
 * there is one cart UI in the app rather than two that drift apart. Only the
 * orders list, which has no existing home (the attributed `ClientOrders` is
 * rewards-shaped and cannot honestly show a raw live order), lives here.
 */

export function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line px-4 py-2 text-xs font-semibold tracking-tight text-ink-soft">
      <span className="text-ink-faint">{icon}</span>
      {title}
    </div>
  )
}

// ------------------------------------------------------------------- cart

/**
 * Map a live snapshot cart onto the domain `CartState` that `CartPanel` renders.
 *
 * A snapshot's active cart is an OPEN cart — the service does not tell us an
 * order followed, so we never claim `ordered`. `value` is derived from the
 * lines at read time (house rule #4), and `at` from the newest line timestamp
 * the payload carried, so `CartPanel`'s "last updated" line is real and not
 * invented. An empty cart is `none`, exactly as the event-derived path reports
 * a client with nothing in a cart.
 */
export function snapshotCartToState(cart: SnapshotCart | null): CartState {
  if (!cart || cart.status === 'empty') return { state: 'none' }
  const lines = cart.items.map(toCartLine)
  const value = lines.reduce<number | null>(
    (sum, l) => (l.rate === null ? sum : (sum ?? 0) + l.rate * (l.qty ?? 1)),
    null,
  )
  return {
    state: 'open',
    cart: {
      at: latestTimestamp(cart.items),
      store: null,
      value,
      itemCount: cart.item_count,
      lines,
      summary: null,
    },
  }
}

/**
 * A cart line nests the real detail under `variant` and `variant.product`
 * (name, sku, unit, price all live there), with `quantity` at the row root.
 * Read them defensively and fall back through the levels, so a shape we did not
 * expect degrades to a plain row rather than blanking the whole cart.
 *
 * The price is `selling_price_with_tax` — Material Depot rates are tax-inclusive
 * (money.ts / house rule #3), so it is used as-is, never with GST added on top.
 */
function toCartLine(it: CartItem): CartLine {
  const variant = obj(it.variant)
  const product = obj(variant?.product)
  const label =
    str(variant?.private_label_product_name) ??
    str(variant?.product_name) ??
    str(product?.product_name) ??
    str(it.product_name) ??
    str(it.name) ??
    str(it.title) ??
    'Item'
  return {
    label,
    sku: str(variant?.sku) ?? str(product?.sku) ?? str(it.sku) ?? null,
    qty: numOrNull(it.quantity ?? it.qty),
    unit: str(variant?.price_unit) ?? str(product?.price_unit) ?? str(it.unit) ?? null,
    rate: numOrNull(
      variant?.selling_price_with_tax ?? product?.selling_price_with_tax ?? it.total_price ?? it.price ?? it.amount,
    ),
  }
}

/** The newest created/modified stamp across the lines, or '' when none was sent
 *  (ISO-8601 strings sort lexically). CartPanel degrades '' to '—'. */
function latestTimestamp(items: CartItem[]): string {
  let latest = ''
  for (const it of items) {
    const details = obj(it.details)
    for (const t of [str(it.modified_at), str(it.created_at), str(details?.modified_at)]) {
      if (t && t > latest) latest = t
    }
  }
  return latest
}

// ----------------------------------------------------------------- orders

/**
 * A flat list of live orders — used both per-number (console) and aggregated
 * across a client's numbers (the partner "What they have bought" card). When an
 * order carries a `phone`, a pill shows which number it belongs to; that is what
 * keeps the aggregated view legible once several numbers' orders are mixed.
 */
export function OrderList({ orders }: { orders: { order: Order; phone?: number }[] }) {
  return (
    <ul className="space-y-2">
      {orders.map(({ order: o, phone }) => (
        <li key={`${phone ?? ''}-${o.id}`} className="rounded-lg border border-line px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {phone ? (
                <Badge tone="neutral" className="tnum font-mono">
                  <Phone size={9} /> {phone}
                </Badge>
              ) : null}
              <span className="font-mono text-[11px] text-ink-soft">
                {o.zoho_salesorder_number || o.lead_id || `#${o.id}`}
              </span>
            </span>
            {o.total_estimate_amount ? (
              <span className="tnum text-sm font-semibold text-ink">{inr(Number(o.total_estimate_amount))}</span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={OMS_TONE[o.status] ?? 'neutral'}>{titleCase(o.status)}</Badge>
            {o.estimate_status ? (
              <Badge tone={ESTIMATE_TONE[o.estimate_status] ?? 'info'}>{titleCase(o.estimate_status)}</Badge>
            ) : null}
            {o.delivery_status ? (
              <span className="text-[11px] text-ink-faint">Delivery: {titleCase(o.delivery_status)}</span>
            ) : null}
          </div>
          {o.order_placed_time || o.created_at ? (
            <p className="mt-1 text-[11px] text-ink-faint">Placed {dateTime(o.order_placed_time || o.created_at)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function OrdersSection({ orders }: { orders: Orders | null }) {
  if (!orders || orders.count === 0) {
    const since = orders?.since ? date(orders.since) : null
    return (
      <Empty
        icon={<PackageSearch size={18} />}
        title={since ? `No orders since ${since}` : 'No orders'}
        body="Nothing has been ordered on this number."
      />
    )
  }

  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-[11px] text-ink-faint">
        {orders.count} order{orders.count === 1 ? '' : 's'} since {date(orders.since)}
      </p>
      {/* Per-number view — the number is already the card's heading, so no pill. */}
      <OrderList orders={orders.items.map((order) => ({ order }))} />
    </div>
  )
}

// ----------------------------------------------------------------- visits

/**
 * Live store visits for a client, aggregated across their numbers. Same
 * per-order phone-pill treatment (`OrderList`) so the number each visit came in
 * on stays visible once several numbers are mixed. `bm_assigned` is the one
 * status the feed carries, so it is the one badge shown.
 */
export function VisitList({ visits }: { visits: { visit: Visit; phone?: number }[] }) {
  return (
    <ul className="space-y-2">
      {visits.map(({ visit: v, phone }) => (
        <li key={`${phone ?? ''}-${v.id}`} className="rounded-lg border border-line px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {phone ? (
                <Badge tone="neutral" className="tnum font-mono">
                  <Phone size={9} /> {phone}
                </Badge>
              ) : null}
              <span className="truncate text-sm font-medium text-ink">{v.name?.trim() || 'Store visit'}</span>
            </span>
            {v.bm_assigned ? <Badge tone="good">BM assigned</Badge> : <Badge tone="info">Awaiting BM</Badge>}
          </div>
          {v.created_at || v.source || v.branch_name ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
              {v.created_at ? <span>{date(v.created_at)}</span> : null}
              {v.source ? <span>· {titleCase(v.source)}</span> : null}
              {v.branch_name ? <span>· {titleCase(v.branch_name.toLowerCase())}</span> : null}
            </p>
          ) : null}
          {v.bm_assigned && v.bm_name?.trim() ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <UserRound size={12} />
              </span>
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-ink">{v.bm_name.trim()}</p>
                <p className="text-[11px] text-ink-faint">Business manager</p>
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// OMS fulfilment: pending | in_progress | partial | completed | cancelled | error | held
const OMS_TONE: Record<string, Tone> = {
  completed: 'good',
  in_progress: 'info',
  partial: 'warn',
  held: 'warn',
  pending: 'neutral',
  cancelled: 'bad',
  error: 'bad',
}

const ESTIMATE_TONE: Record<string, Tone> = {
  order_placed: 'good',
  estimate_shared: 'info',
  estimate_pending: 'warn',
}

// ------------------------------------------------------------------ utils

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
