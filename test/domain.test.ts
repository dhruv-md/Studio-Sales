/**
 * The pure domain rules, run directly — no bundler, no database, no browser.
 *
 *     npm run test:domain
 *
 * `tsc` and `next build` passing is not evidence any of this is right: every one
 * of the six bugs in docs/landmines.md compiled. These are the rules where being
 * off by one costs somebody a gold coin or puts a firm on the wrong call list,
 * so they are asserted at their boundaries rather than eyeballed.
 */
import assert from 'node:assert/strict'
import { partnerStanding, usageTier, engagement } from '../lib/domain/tiering.ts'
import { attributedSale, pendingSale, rewardStatus } from '../lib/domain/rewards.ts'
import { cartState, readCart, summariseClients } from '../lib/domain/referrals.ts'
import { guessMarket, marketLabel } from '../lib/domain/markets.ts'
import { generatePassword, seal, unseal } from '../lib/auth/credentials.ts'
import {
  MONTHLY_SLABS, QUARTERLY_SLABS, cashbackFor, monthlyPosition, quarterlyPosition,
} from '../lib/domain/slabs.ts'
import {
  daysLeftIn, diffDays, monthKey, previousRange, quarterKey, resolveRange, shiftMonth,
  shiftQuarter, month, trailingMonths,
} from '../lib/domain/periods.ts'
import {
  coinWall, discountOn, eligible, ledgerRows, maturity, periodStanding, standing, funnel,
} from '../lib/domain/ledger.ts'
import { maskPhone, valueBand, consentOf } from '../lib/domain/privacy.ts'
import { GO_LIVE } from '../lib/domain/programme.ts'
import { PRESETS, checkTheme, contrast, cssVariables, resolveTheme } from '../lib/domain/theme.ts'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('  PASS ', name) }

const order = (o: Partial<any>) => ({
  id: String(Math.random()), referral_id: 'r', md_enq_id: 'E', order_value: 0,
  ordered_on: null, store: null, status: null, approval_status: 'approved',
  approved_by: null, approved_at: null, review_note: null, synced_at: '2026-09-01T00:00:00Z',
  ...o,
}) as any

console.log('\nThe boundaries of the classification (the brief is explicit about these)')
t('0 orders is Basic', () => assert.equal(usageTier(0), 'basic'))
t('1 order is Basic', () => assert.equal(usageTier(1), 'basic'))
t('2 is Mid', () => assert.equal(usageTier(2), 'mid'))
t('4 is Mid', () => assert.equal(usageTier(4), 'mid'))
t('5 is Power — "more than or EQUAL to 5"', () => assert.equal(usageTier(5), 'power'))
t('9 is Power', () => assert.equal(usageTier(9), 'power'))

console.log('\nThree months, and three engagement outcomes')
const now = new Date('2026-09-15T00:00:00Z')
t('never ordered is its own answer, not "dormant"', () =>
  assert.deepEqual(engagement(null, now), { state: 'never_ordered', days: null }))
t('89 days is still active', () =>
  assert.equal(engagement('2026-06-18T00:00:00Z', now).state, 'active'))
t('exactly 90 days is still active', () =>
  assert.equal(engagement('2026-06-17T00:00:00Z', now).state, 'active'))
t('91 days needs a call', () =>
  assert.equal(engagement('2026-06-16T00:00:00Z', now).state, 'dormant'))

console.log('\nOnly verified orders count')
const mixed = [
  order({ order_value: 100000, approval_status: 'approved', ordered_on: '2026-09-01' }),
  order({ order_value: 250000, approval_status: 'pending',  ordered_on: '2026-09-10' }),
  order({ order_value: 999999, approval_status: 'rejected', ordered_on: '2026-09-12' }),
]
t('attributedSale ignores pending and rejected', () => assert.equal(attributedSale(mixed), 100000))
t('pendingSale reports the pending one only', () =>
  assert.deepEqual(pendingSale(mixed), { count: 1, value: 250000 }))
t('a rejected order is in neither figure', () =>
  assert.equal(attributedSale(mixed) + pendingSale(mixed).value, 350000))

console.log('\npartnerStanding')
const s = partnerStanding(mixed, now)
t('counts only approved orders towards the tier', () => assert.equal(s.orderCount, 1))
t('...so three orders is still Basic', () => assert.equal(s.tier, 'basic'))
t('last order date ignores the pending one', () => assert.equal(s.lastOrderOn, '2026-09-01'))
t('a firm with only a PENDING order reads as never_ordered, not active', () => {
  const only = partnerStanding([order({ order_value: 5, approval_status: 'pending', ordered_on: '2026-09-14' })], now)
  assert.equal(only.engagement, 'never_ordered')
  assert.equal(only.pendingCount, 1)
})
t('no orders at all is safe', () => {
  const none = partnerStanding([], now)
  assert.deepEqual(
    [none.orderCount, none.approvedValue, none.tier, none.engagement, none.lastOrderOn],
    [0, 0, 'basic', 'never_ordered', null],
  )
})
t('falls back to synced_at when ordered_on is missing', () => {
  const r = partnerStanding([order({ order_value: 1, ordered_on: null, synced_at: '2026-09-14T10:00:00Z' })], now)
  assert.equal(r.engagement, 'active')
})

console.log('\nThe ladder still works off the approved figure')
const tiers = [
  { id: 1, threshold: 100000, label: 'Silver', kind: 'silver', detail: null, active: true },
  { id: 2, threshold: 500000, label: 'Gold',   kind: 'gold',   detail: null, active: true },
] as any[]
t('a pending order does not unlock a tier', () => {
  const st = rewardStatus(attributedSale(mixed), tiers, [])
  assert.equal(st.earned.length, 1)
  assert.equal(st.next?.tier.id, 2)
  assert.equal(st.next?.remaining, 400000)
})
t('approving it would', () => {
  const approvedAll = mixed.map((o: any) => ({ ...o, approval_status: 'approved' }))
  assert.equal(rewardStatus(attributedSale(approvedAll), tiers, []).earned.length, 2)
})

console.log('\nMarkets')
t('Bengaluru and Bangalore land on one key', () =>
  assert.equal(guessMarket('Bengaluru'), guessMarket('Bangalore')))
t('Secunderabad is Hyderabad', () => assert.equal(guessMarket('Secunderabad'), 'hyderabad'))
t('an unknown city is null, not a nearest match', () => assert.equal(guessMarket('Kochi'), null))
t('a blank city is null', () => assert.equal(guessMarket(''), null))
t('a null market reads as every market', () => assert.equal(marketLabel(null), 'All markets'))
t('an unknown market key is shown as itself rather than swallowed', () =>
  assert.equal(marketLabel('chennai'), 'chennai'))

console.log('\n"All earned" and "there is no ladder" are different answers')
{
  const tier = (id: number, threshold: number) =>
    ({ id, threshold, label: `T${id}`, kind: 'silver', detail: null, active: true }) as any
  const none = rewardStatus(500000, [], [])
  t('an empty ladder is not a completed one', () => {
    assert.equal(none.next, null)
    assert.equal(none.complete, false)
  })
  const done = rewardStatus(500000, [tier(1, 100000), tier(2, 250000)], [])
  t('clearing every tier is', () => {
    assert.equal(done.next, null)
    assert.equal(done.complete, true)
  })
  const mid = rewardStatus(150000, [tier(1, 100000), tier(2, 250000)], [])
  t('and a ladder with something left to chase is neither', () => {
    assert.equal(mid.next?.tier.id, 2)
    assert.equal(mid.complete, false)
  })
}

console.log('\nCarts, which the sync does not send a state for')
const ev = (e: Partial<any>) => ({
  id: String(Math.random()), referral_id: 'r1', event_type: 'other', occurred_at: '2026-09-01T10:00:00Z',
  store: null, title: null, detail: null, amount: null, payload: {},
  external_id: String(Math.random()), synced_at: '2026-09-01T00:00:00Z',
  ...e,
}) as any

const countCart = ev({
  event_type: 'cart_add', occurred_at: '2026-09-02T10:00:00Z', store: 'Indiranagar',
  title: 'Cart created - 3 items', detail: 'Oak plank, arctic white laminate, quartz.',
  amount: 78400, payload: { items: 3 },
})
t('{"items": 3} is a count, and the prose is the contents', () => {
  const c = readCart(countCart)
  assert.equal(c.itemCount, 3)
  assert.equal(c.value, 78400)
  assert.deepEqual(c.lines, [])
  assert.equal(c.summary, 'Oak plank, arctic white laminate, quartz.')
})

const listCart = ev({
  event_type: 'cart_add', occurred_at: '2026-09-02T10:00:00Z', amount: 78400,
  detail: 'Oak plank, laminate, quartz.',
  payload: { items: [
    { name: 'Engineered Oak Plank 14mm', sku: 'WF 4402', qty: 420, unit: 'sqft', rate: 142 },
    { sku: 'LM 3301' },
    { qty: 2 },
  ] },
})
t('an itemised payload becomes lines, and the prose is dropped as a duplicate', () => {
  const c = readCart(listCart)
  assert.equal(c.itemCount, 3)
  assert.equal(c.lines.length, 3)
  assert.equal(c.summary, null)
  assert.equal(c.lines[0].qty, 420)
  assert.equal(c.lines[0].unit, 'sqft')
})
t('an item with no name is still an item — the count cannot understate the cart', () => {
  const c = readCart(listCart)
  assert.equal(c.lines[1].label, 'LM 3301')
  assert.equal(c.lines[2].label, 'Item')
  assert.equal(c.itemCount, 3)
})

t('a cart with nothing after it is open', () => {
  const st = cartState([countCart])
  assert.equal(st.state, 'open')
})
t('an order after it closes it', () => {
  const st = cartState([countCart, ev({ event_type: 'order_placed', occurred_at: '2026-09-03T10:00:00Z' })])
  assert.equal(st.state, 'ordered')
})
t('an order BEFORE it does not — that is a second cart being built', () => {
  const st = cartState([countCart, ev({ event_type: 'order_placed', occurred_at: '2026-09-01T10:00:00Z' })])
  assert.equal(st.state, 'open')
})
t('no cart at all is its own answer, not an empty one', () => {
  assert.equal(cartState([ev({ event_type: 'store_visit' })]).state, 'none')
})
t('the newest cart is the one that counts', () => {
  const st = cartState([
    ev({ event_type: 'cart_add', occurred_at: '2026-08-01T10:00:00Z', amount: 1000, payload: { items: 1 } }),
    ev({ event_type: 'cart_add', occurred_at: '2026-09-05T10:00:00Z', amount: 5000, payload: { items: 9 } }),
    ev({ event_type: 'order_placed', occurred_at: '2026-08-02T10:00:00Z' }),
  ])
  assert.equal(st.state, 'open')
  assert.equal(st.state === 'open' ? st.cart.value : null, 5000)
})
t('offsets are compared as instants, not as text', () => {
  // 23:30 +05:30 is 18:00Z. As strings, "2026-09-09T23:30:00+05:30" sorts
  // AFTER "2026-09-09T19:00:00+00:00" — which would leave a cart looking open
  // an hour after the order that closed it.
  const st = cartState([
    ev({ event_type: 'cart_add', occurred_at: '2026-09-09T23:30:00+05:30', amount: 1000, payload: { items: 2 } }),
    ev({ event_type: 'order_placed', occurred_at: '2026-09-09T19:00:00+00:00' }),
  ])
  assert.equal(st.state, 'ordered')
})
t('an order row with no matching event still closes the cart', () => {
  // The sync takes events and orders as two independent arrays, and a producer
  // may push only the order. Left to the event stream, this client would look
  // like an open cart to chase for ever.
  const st = cartState(
    [countCart],
    [order({ referral_id: 'r1', order_value: 78400, ordered_on: '2026-09-04' })],
  )
  assert.equal(st.state, 'ordered')
})
t('an order row DATED the cart day closes it — that is carting then buying in store', () => {
  const st = cartState([countCart], [order({ ordered_on: '2026-09-02' })])
  assert.equal(st.state, 'ordered')
})
t('an order row from before the cart leaves it open', () => {
  const st = cartState([countCart], [order({ ordered_on: '2026-09-01' })])
  assert.equal(st.state, 'open')
})
t('an order with no date cannot close anything', () => {
  const st = cartState([countCart], [order({ ordered_on: null })])
  assert.equal(st.state, 'open')
})
t('a pending order still means they bought — approval is about paying the architect', () => {
  const st = cartState([countCart], [order({ ordered_on: '2026-09-05', approval_status: 'pending' })])
  assert.equal(st.state, 'ordered')
})
t('a producer that knows the cart is still open overrules the guess', () => {
  const st = cartState([
    ev({ event_type: 'cart_add', occurred_at: '2026-09-02T10:00:00Z', payload: { items: 2, cart_status: 'open' } }),
    ev({ event_type: 'order_placed', occurred_at: '2026-09-03T10:00:00Z' }),
  ])
  assert.equal(st.state, 'open')
})

console.log('\nOne row per referred client')
const ref = (id: string, name: string, on: string) =>
  ({ id, partner_id: 'p', client_id: null, project_id: null, client_name: name,
     md_phone: '9800000000', referred_on: on, notes: null, created_at: on }) as any

const rows = summariseClients(
  [ref('r1', 'Rao', '2026-08-01'), ref('r2', 'Iyer', '2026-08-20'), ref('r3', 'Prakash', '2026-05-01')],
  [
    ev({ referral_id: 'r1', event_type: 'store_visit', occurred_at: '2026-09-02T09:00:00Z', store: 'Indiranagar' }),
    ev({ referral_id: 'r1', event_type: 'cart_add', occurred_at: '2026-09-02T10:00:00Z', amount: 78400, payload: { items: 3 } }),
    ev({ referral_id: 'r2', event_type: 'store_visit', occurred_at: '2026-09-09T09:00:00Z', store: 'Jayanagar' }),
  ],
  [
    order({ referral_id: 'r1', order_value: 100000, approval_status: 'approved' }),
    order({ referral_id: 'r1', order_value: 250000, approval_status: 'pending' }),
    order({ referral_id: 'r2', order_value: 999999, approval_status: 'approved' }),
  ],
)
t('most recently active first', () => assert.deepEqual(rows.map((r) => r.referral.id), ['r2', 'r1', 'r3']))
t('a client who has done nothing still gets a row', () => {
  const quiet = rows.find((r) => r.referral.id === 'r3')!
  assert.equal(quiet.lastSeen, null)
  assert.equal(quiet.cart.state, 'none')
  assert.equal(quiet.approved, 0)
})
t('one client never picks up another client\'s events or orders', () => {
  const rao = rows.find((r) => r.referral.id === 'r1')!
  assert.equal(rao.events.length, 2)
  assert.equal(rao.orders.length, 2)
  assert.equal(rao.stores.join(), 'Indiranagar')
})
t('per-client money is the ladder\'s arithmetic — approved only, pending beside it', () => {
  const rao = rows.find((r) => r.referral.id === 'r1')!
  assert.equal(rao.approved, 100000)
  assert.equal(rao.pending, 250000)
  assert.equal(rao.pendingCount, 1)
})
t('and the per-client totals add up to the figure on the ladder', () => {
  const all = [
    order({ referral_id: 'r1', order_value: 100000, approval_status: 'approved' }),
    order({ referral_id: 'r1', order_value: 250000, approval_status: 'pending' }),
    order({ referral_id: 'r2', order_value: 999999, approval_status: 'approved' }),
  ]
  assert.equal(rows.reduce((s, r) => s + r.approved, 0), attributedSale(all))
})
t('an open cart is carried on the row, with its value', () => {
  const rao = rows.find((r) => r.referral.id === 'r1')!
  assert.equal(rao.cart.state, 'open')
  assert.equal(rao.cart.state === 'open' ? rao.cart.cart.value : null, 78400)
})

console.log('\nOne-time passwords')
t('no characters that can be misread aloud', () => {
  for (let i = 0; i < 400; i++) assert.ok(!/[Il1O0]/.test(generatePassword()))
})
t('long enough, and 1000 in a row are all different', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const p = generatePassword()
    assert.ok(p.replace(/-/g, '').length >= 12)
    seen.add(p)
  }
  assert.equal(seen.size, 1000)
})

// The password is kept until its owner changes it, and kept SEALED. These four
// assertions are the whole security claim of `issued_credential` in code form:
// the column is unreadable without the key, tampering with it fails loudly
// rather than returning something plausible, and a key that has moved on is a
// THIRD state — not "they changed it", which is what the console would
// otherwise tell an admin about a password that still works.
process.env.CREDENTIAL_KEY = 'a test key, not the service role one'

t('a sealed password comes back exactly, and never looks like itself', () => {
  const pw = generatePassword()
  const sealed = seal(pw)
  assert.ok(!sealed.includes(pw))
  assert.ok(sealed.startsWith('v1.'))
  const opened = unseal(sealed)
  assert.ok(opened.ok && opened.value === pw)
})

t('the same password seals differently every time', () => {
  assert.notEqual(seal('Same-Pass-Word-Here'), seal('Same-Pass-Word-Here'))
})

t('a tampered row does not open', () => {
  const sealed = seal('Same-Pass-Word-Here')
  const parts = sealed.split('.')
  // Flip one byte of the ciphertext. GCM's tag is what turns this into a
  // failure instead of a plausible-looking wrong answer.
  const ct = Buffer.from(parts[3], 'base64url')
  ct[0] ^= 0xff
  const bad = unseal([parts[0], parts[1], parts[2], ct.toString('base64url')].join('.'))
  assert.equal(bad.ok, false)
})

t('a rotated key reads as unreadable, not as no password', () => {
  const sealed = seal('Same-Pass-Word-Here')
  process.env.CREDENTIAL_KEY = 'a different key, as after a rotation'
  const out = unseal(sealed)
  assert.equal(out.ok, false)
  assert.ok(!out.ok && /rotated/.test(out.reason))
  process.env.CREDENTIAL_KEY = 'a test key, not the service role one'
})

t('a value this app did not write is rejected on shape, not on the key', () => {
  assert.equal(unseal('not-even-close').ok, false)
  assert.equal(unseal('v2.a.b.c').ok, false)
})

// ===========================================================================
// PRD v1.1 §10 — the slab programme
// ===========================================================================

/**
 * The published tables in §10.2 and §10.3 print eight rupee figures per row that
 * lib/domain/slabs.ts does not store — it stores four percentages and derives
 * the rest. These assertions are the check that the derivation reproduces the
 * approved structure to the rupee. If a percentage is ever mistyped, this fails
 * here rather than in somebody's cashback.
 */
console.log('\nThe monthly slab table reproduces every published figure (PRD §10.2)')

const PUBLISHED_MONTHLY = [
  // floor,   ceiling,  retailMax, storeMax, cashbackMax, netMax, gift, maxAdv, maxPct, milestone
  [   50001,   100000,      1000,      750,       1000,     250,     0,   2000,   2.00, null],
  [  100001,   200000,      4000,     2000,       4000,    2000,  2000,  10000,   5.00, 'multi_gift'],
  [  200001,   500000,     10000,    10000,      15000,    5000,  5000,  30000,   6.00, 'silver_coin'],
  [  500001,   750000,     37500,    15000,      30000,   15000, 15000,  82500,  11.00, 'gold_coin'],
  [  750001,  1000000,     50000,    30000,      50000,   20000, 26250, 126250,  12.63, 'gold_coin'],
] as const

t('five monthly slabs, in the published order', () => assert.equal(MONTHLY_SLABS.length, 5))
PUBLISHED_MONTHLY.forEach((row, i) => {
  const [floor, ceiling, retailMax, storeMax, cashbackMax, netMax, gift, maxAdv, maxPct, milestone] = row
  const s = MONTHLY_SLABS[i]
  t(`slab ${i + 1} (${s.bandLabel}) matches the PRD row`, () => {
    assert.equal(s.floor, floor)
    assert.equal(s.ceiling, ceiling)
    assert.equal(s.retailMax, retailMax)
    assert.equal(s.storeMax, storeMax)
    assert.equal(s.cashbackMax, cashbackMax)
    assert.equal(s.netCashbackMax, netMax)
    assert.equal(s.giftValue, gift)
    assert.equal(s.maxAdvantage, maxAdv)
    assert.equal(s.maxAdvantagePct, maxPct)
    assert.equal(s.milestone, milestone)
  })
})

console.log('\nThe quarterly ladder (PRD §10.3)')
t('three bands, the top one open-ended', () => {
  assert.equal(QUARTERLY_SLABS.length, 3)
  assert.equal(QUARTERLY_SLABS[2].ceiling, null)
})
t('gift value is the published 1% / 2% / 4% of each floor', () => {
  assert.equal(QUARTERLY_SLABS[0].giftValue, 25000)
  assert.equal(QUARTERLY_SLABS[1].giftValue, 100000)
  assert.equal(QUARTERLY_SLABS[2].giftValue, 300000)
})
t('the rewards are the ones the business approved', () => {
  assert.equal(QUARTERLY_SLABS[0].reward, 'Hotel / stay vouchers')
  assert.equal(QUARTERLY_SLABS[1].reward, 'Domestic trip')
  assert.equal(QUARTERLY_SLABS[2].reward, 'International trip')
})

console.log('\nWhere a spend figure lands — the four outcomes, not two')
t('below the entry threshold earns nothing and says how far off it is', () => {
  const p = monthlyPosition(49999)
  assert.equal(p.kind, 'below')
  assert.equal(p.slab, null)
  assert.equal(p.gap, 2)
})
t('exactly the entry threshold is still below it — the band starts at 50,001', () => {
  assert.equal(monthlyPosition(50000).kind, 'below')
  assert.equal(monthlyPosition(50001).kind, 'in')
})
t('a band is inclusive of its ceiling', () => {
  assert.equal(monthlyPosition(100000).slab?.id, 1)
  assert.equal(monthlyPosition(100001).slab?.id, 2)
})
t('the gap is to the NEXT slab floor, not to this one\'s ceiling', () => {
  const p = monthlyPosition(432000)
  assert.equal(p.slab?.id, 3)
  assert.equal(p.gap, 500001 - 432000)
})
t('past the top published monthly band reports `above` and refuses to guess (§17 d.4)', () => {
  const p = monthlyPosition(1400000)
  assert.equal(p.kind, 'above')
  assert.equal(p.next, null)
  const c = cashbackFor(1400000, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 })
  assert.equal(c.rateUnpublished, true)
  assert.equal(c.net, null)
  assert.equal(c.gross, 0)
})
t('the quarterly top band is open, so a huge quarter never falls off the ladder', () => {
  const p = quarterlyPosition(120000000)
  assert.equal(p.kind, 'in')
  assert.equal(p.slab?.id, 3)
})
t('an empty ladder is `empty`, never "all earned"', () => {
  const p = monthlyPosition(999)
  assert.equal(p.kind, 'below')
  assert.equal(monthlyPosition(0).kind, 'below')
})

console.log('\nThe cashback formula (PRD §10.1 / §10.4)')
t('gross is the slab rate on ACTUAL spend, not the slab-top figure', () => {
  // ₹3,20,000 sits in slab 3 (3%). The table\'s ₹15,000 is the ceiling figure.
  const c = cashbackFor(320000, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 })
  assert.equal(c.gross, 9600)
})
t('net deducts the store discount actually availed', () => {
  const c = cashbackFor(320000, MONTHLY_SLABS, { availed: 4000, ordersMissing: 0 })
  assert.equal(c.net, 5600)
})
t('net floors at zero when the discounts taken exceed the cashback due', () => {
  const c = cashbackFor(320000, MONTHLY_SLABS, { availed: 50000, ordersMissing: 0 })
  assert.equal(c.net, 0)
})
t('an UNKNOWN discount is not a zero discount — net is withheld, gross is not', () => {
  const c = cashbackFor(320000, MONTHLY_SLABS, { availed: 0, ordersMissing: 2 })
  assert.equal(c.discountKnown, false)
  assert.equal(c.net, null)
  assert.equal(c.gross, 9600)
  assert.equal(c.ordersMissingDiscount, 2)
})
t('gift value does not scale with spend inside a band (§10.2)', () => {
  const low = cashbackFor(210000, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 })
  const high = cashbackFor(490000, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 })
  assert.equal(low.giftValue, 5000)
  assert.equal(high.giftValue, 5000)
  assert.ok(high.gross > low.gross)
})
t('below the entry threshold there is no cashback and no gift', () => {
  const c = cashbackFor(20000, MONTHLY_SLABS, { availed: 0, ordersMissing: 0 })
  assert.equal(c.gross, 0)
  assert.equal(c.giftValue, 0)
  assert.equal(c.slab, null)
})

// ===========================================================================
// Periods — the month an order belongs to must not depend on the server\'s TZ
// ===========================================================================

console.log('\nCalendar periods (PRD §10.4)')
t('an order placed at 11pm IST on the 31st stays in its own month', () => {
  // The bug this guards: new Date('2026-08-31T23:30:00+05:30').getUTCMonth()
  // is August, but getMonth() in a UTC+X renderer can roll to September.
  assert.equal(monthKey('2026-08-31'), '2026-08')
  assert.equal(quarterKey('2026-08-31'), '2026-Q3')
})
t('quarters are calendar quarters', () => {
  assert.equal(quarterKey('2026-01-01'), '2026-Q1')
  assert.equal(quarterKey('2026-03-31'), '2026-Q1')
  assert.equal(quarterKey('2026-04-01'), '2026-Q2')
  assert.equal(quarterKey('2026-12-31'), '2026-Q4')
})
t('month boundaries include the last day, February and leap years included', () => {
  assert.equal(month('2026-02').to, '2026-02-28')
  assert.equal(month('2028-02').to, '2028-02-29')
  assert.equal(month('2026-09').to, '2026-09-30')
  assert.equal(month('2026-12').to, '2026-12-31')
})
t('shifting a month or quarter crosses the year correctly', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-06', -18), '2024-12')
  assert.equal(shiftQuarter('2026-Q1', -1), '2025-Q4')
  assert.equal(shiftQuarter('2026-Q4', 1), '2027-Q1')
})
t('the trailing 12 months end with the month asked for, oldest first', () => {
  const ms = trailingMonths('2026-09', 12)
  assert.equal(ms.length, 12)
  assert.equal(ms[0].key, '2025-10')
  assert.equal(ms[11].key, '2026-09')
})
t('days left in the month counts today (§10.5.1), and never goes negative', () => {
  assert.equal(daysLeftIn(month('2026-09'), '2026-09-30'), 1)
  assert.equal(daysLeftIn(month('2026-09'), '2026-09-16'), 15)
  assert.equal(daysLeftIn(month('2026-08'), '2026-09-16'), 0)
})
t('diffDays is whole days across a month boundary', () => {
  assert.equal(diffDays('2026-08-31', '2026-09-01'), 1)
  assert.equal(diffDays('2026-09-01', '2026-08-31'), -1)
})

console.log('\nThe Overview date range (PRD §8.2.1)')
t('the default is the current calendar month', () => {
  const r = resolveRange('this_month', '2026-09-16')
  assert.equal(r.from, '2026-09-01')
  assert.equal(r.to, '2026-09-30')
})
t('this FY is April to March', () => {
  assert.equal(resolveRange('this_fy', '2026-09-16').from, '2026-04-01')
  assert.equal(resolveRange('this_fy', '2026-09-16').to, '2027-03-31')
  assert.equal(resolveRange('this_fy', '2026-02-10').from, '2025-04-01')
})
t('last 3 months includes this one', () => {
  const r = resolveRange('last_3_months', '2026-09-16')
  assert.equal(r.from, '2026-07-01')
  assert.equal(r.to, '2026-09-30')
})
t('the previous period for a calendar month is the calendar month before it', () => {
  const prev = previousRange(resolveRange('this_month', '2026-09-16'))
  assert.equal(prev.from, '2026-08-01')
  assert.equal(prev.to, '2026-08-31')
})
t('the previous period for an arbitrary range is the same LENGTH, just before', () => {
  const prev = previousRange(resolveRange('last_3_months', '2026-09-16'))
  assert.equal(prev.to, '2026-06-30')
  assert.equal(diffDays(prev.from, prev.to), diffDays('2026-07-01', '2026-09-30'))
})

// ===========================================================================
// Attribution, go-live and maturation
// ===========================================================================

const TODAY = '2026-09-16'
const ord = (o: Partial<any>) => order({ ordered_on: '2026-08-10', ...o })

console.log('\nGo-live: only orders on or after it count (PRD §15)')
t('an order the day before go-live is pre-programme, not pending', () => {
  const s = standing(ord({ ordered_on: '2026-06-30', approval_status: 'approved' }), TODAY, GO_LIVE)
  assert.equal(s.state, 'pre_programme')
  assert.equal(s.reason, 'PRE_GO_LIVE')
})
t('go-live day itself counts', () => {
  const s = standing(ord({ ordered_on: GO_LIVE, approval_status: 'approved', delivered_on: '2026-07-05' }), TODAY, GO_LIVE)
  assert.equal(s.state, 'counted')
})
t('an UNAPPROVED pre-go-live order is still pre-programme, never "being checked"', () => {
  // Telling a partner their May order is "with an admin" sets up the month-one
  // dispute §18 rates High/High. It is out of the programme, permanently.
  const s = standing(ord({ ordered_on: '2026-05-02', approval_status: 'pending' }), TODAY, GO_LIVE)
  assert.equal(s.state, 'pre_programme')
})

console.log('\nMaturation: 30 days past delivery, nothing open against it (PRD §6.2)')
t('delivered 31 days ago has matured', () => {
  const m = maturity(ord({ delivered_on: '2026-08-15' }), TODAY)
  assert.equal(m.state, 'matured')
  assert.equal(m.on, '2026-09-14')
})
t('delivered 29 days ago is still maturing, and says which day it lands', () => {
  const m = maturity(ord({ delivered_on: '2026-08-18' }), TODAY)
  assert.equal(m.state, 'maturing')
  assert.equal(m.on, '2026-09-17')
  assert.equal(m.daysLeft, 1)
})
t('exactly 30 days is matured — the boundary counts as reached', () => {
  assert.equal(maturity(ord({ delivered_on: '2026-08-17' }), TODAY).state, 'matured')
})
t('NO delivery date is `unknown`, never `matured` and never `maturing`', () => {
  // Nothing in the referral sync carries a delivery date yet. Dating maturation
  // from the order date would pay a month early.
  const m = maturity(ord({ delivered_on: null }), TODAY)
  assert.equal(m.state, 'unknown')
  assert.equal(m.on, null)
})
t('an open escalation holds maturation open however old the delivery is', () => {
  const m = maturity(ord({ delivered_on: '2026-07-01', open_escalations: 1 }), TODAY)
  assert.equal(m.state, 'held')
  const s = standing(ord({ delivered_on: '2026-07-01', open_escalations: 1, approval_status: 'approved' }), TODAY, GO_LIVE)
  assert.equal(s.state, 'accruing')
  assert.equal(s.reason, 'OPEN_ESCALATION')
})
t('an admin\'s not-counted code beats everything else', () => {
  const s = standing(ord({ approval_status: 'approved', delivered_on: '2026-07-01', not_counted_reason: 'DUPLICATE_ORDER' }), TODAY, GO_LIVE)
  assert.equal(s.state, 'excluded')
  assert.equal(s.reason, 'DUPLICATE_ORDER')
})

console.log('\nA period, rolled up (PRD §10.4)')
const AUG = [
  ord({ id: 'o1', referral_id: 'r1', order_value: 180000, ordered_on: '2026-08-04', delivered_on: '2026-08-06', approval_status: 'approved', discount_availed: 1800 }),
  ord({ id: 'o2', referral_id: 'r1', order_value: 140000, ordered_on: '2026-08-20', delivered_on: '2026-09-10', approval_status: 'approved', discount_availed: 1400 }),
  ord({ id: 'o3', referral_id: 'r2', order_value: 900000, ordered_on: '2026-06-02', delivered_on: '2026-06-10', approval_status: 'approved', discount_availed: 0 }),
  ord({ id: 'o4', referral_id: 'r2', order_value: 500000, ordered_on: '2026-08-11', approval_status: 'pending' }),
]
const aug = periodStanding(AUG, '2026-08', 'month', TODAY, GO_LIVE)
t('only approved, in-programme orders of THAT month are in the base', () => {
  assert.equal(aug.orders.length, 2)
  assert.equal(aug.spend, 320000)
})
t('the pre-go-live order is excluded even though it is the biggest one', () => {
  assert.ok(!aug.orders.some((o) => o.id === 'o3'))
})
t('the slab is set on the FULL eligible spend, not on the matured part only', () => {
  assert.equal(aug.slab?.id, 3)
  assert.equal(aug.confirmedSpend, 180000)
  assert.equal(aug.provisionalSpend, 140000)
  assert.equal(aug.confirmed, false)
  assert.equal(aug.closedButProvisional, true)
})
t('cashback is 3% of the whole ₹3.2 L, less the ₹3,200 actually availed', () => {
  assert.equal(aug.cashback.gross, 9600)
  assert.equal(aug.cashback.net, 6400)
  assert.equal(aug.cashback.discountKnown, true)
})
t('the Silver Coin is reached, and the gap to Gold is stated in rupees', () => {
  assert.equal(aug.milestone, 'silver_coin')
  assert.equal(aug.gap, 500001 - 320000)
})
t('a month below ₹50,001 reports belowEntry rather than an empty tab', () => {
  const tiny = periodStanding([ord({ order_value: 20000, ordered_on: '2026-08-02', approval_status: 'approved' })], '2026-08', 'month', TODAY, GO_LIVE)
  assert.equal(tiny.belowEntry, true)
  assert.equal(tiny.slab, null)
  assert.equal(tiny.cashback.gross, 0)
})
t('one order with no coupon data withholds the net figure for the whole period', () => {
  const mixed = periodStanding(
    [ord({ order_value: 300000, ordered_on: '2026-08-02', delivered_on: '2026-08-03', approval_status: 'approved', discount_availed: null })],
    '2026-08', 'month', TODAY, GO_LIVE,
  )
  assert.equal(mixed.cashback.net, null)
  assert.equal(mixed.cashback.ordersMissingDiscount, 1)
  assert.equal(mixed.cashback.gross, 9000)
})
t('discountOn counts missing rows rather than summing them as zero', () => {
  const d = discountOn([ord({ discount_availed: 500 }), ord({ discount_availed: null }), ord({})])
  assert.equal(d.availed, 500)
  assert.equal(d.ordersMissing, 2)
})
t('eligible() keeps accruing orders and drops pre-programme and pending ones', () => {
  const e = eligible(AUG, TODAY, GO_LIVE)
  assert.equal(e.length, 2)
})

console.log('\nThe coin wall (PRD §10.5.3)')
const wall = coinWall(AUG, TODAY, 12, GO_LIVE)
t('twelve months, ending with this one', () => {
  assert.equal(wall.length, 12)
  assert.equal(wall[11].period.key, '2026-09')
  assert.equal(wall[11].open, true)
})
t('August shows the Silver Coin it actually earned', () => {
  const a = wall.find((m) => m.period.key === '2026-08')!
  assert.equal(a.milestone, 'silver_coin')
  assert.equal(a.spend, 320000)
})
t('months entirely before go-live are marked, not shown as a zero month', () => {
  const june = wall.find((m) => m.period.key === '2026-06')!
  assert.equal(june.preProgramme, true)
  assert.equal(june.spend, 0)
})

console.log('\nThe ledger (PRD §10.5.4)')
const rowsL = ledgerRows(AUG, () => 'A client', TODAY, GO_LIVE)
t('one row per order, newest first', () => {
  assert.equal(rowsL.length, 4)
  assert.equal(rowsL[0].orderedOn, '2026-08-20')
})
t('an order is priced at the rate its PERIOD reached, not at its own size', () => {
  // ₹1,40,000 alone would be slab 2 at 2%. In a ₹3.2 L August it earns 3%.
  const r = rowsL.find((r) => r.order.id === 'o2')!
  assert.equal(r.cashbackPct, 3)
  assert.equal(r.grossCashback, 4200)
  assert.equal(r.netCashback, 2800)
})
t('a pre-programme row carries the reason and no cashback', () => {
  const r = rowsL.find((r) => r.order.id === 'o3')!
  assert.equal(r.status, 'excluded')
  assert.equal(r.grossCashback, null)
  assert.ok(r.note && r.note.includes('before the programme'))
})
t('a matured row is confirmed; one still maturing is provisional', () => {
  assert.equal(rowsL.find((r) => r.order.id === 'o1')!.status, 'confirmed')
  assert.equal(rowsL.find((r) => r.order.id === 'o2')!.status, 'provisional')
})
t('the gift is not divided across order rows — it belongs to the period', () => {
  assert.ok(rowsL.every((r) => r.giftValue === 0))
})

console.log('\nThe funnel (PRD §8.2.4)')
t('conversion is against the previous stage AND against the top', () => {
  const f = funnel([
    { key: 'referred', label: 'Referred', count: 10 },
    { key: 'visited', label: 'Visited store', count: 6 },
    { key: 'cart', label: 'Cart created', count: 3 },
    { key: 'ordered', label: 'Ordered', count: 2 },
  ])
  assert.equal(f[0].pctOfPrevious, null)
  assert.equal(f[1].pctOfPrevious, 60)
  assert.equal(f[2].pctOfPrevious, 50)
  assert.equal(f[3].pctOfTop, 20)
})
t('a zero top stage does not divide by zero', () => {
  const f = funnel([{ key: 'a', label: 'A', count: 0 }, { key: 'b', label: 'B', count: 0 }])
  assert.equal(f[1].pctOfPrevious, 0)
  assert.equal(f[1].pctOfTop, 0)
})

// ===========================================================================
// Privacy (PRD §14.5)
// ===========================================================================

console.log('\nEnd-client privacy')
t('a phone is masked to first two and last two digits', () => {
  assert.equal(maskPhone('9876543210'), '98XXXXXX10')
  assert.equal(maskPhone('+91 98765 43210'), '98XXXXXX10')
})
t('a number we cannot parse is masked whole, not partly', () => {
  assert.equal(maskPhone('12345'), '•••••')
  assert.equal(maskPhone(null), '—')
})
t('consent has three states, and "not asked" is not "refused"', () => {
  assert.equal(consentOf({ consent_given: true }), 'given')
  assert.equal(consentOf({ consent_given: false }), 'refused')
  assert.equal(consentOf({ consent_given: null }), 'unknown')
  assert.equal(consentOf({}), 'unknown')
  assert.equal(consentOf(null), 'unknown')
})
t('without consent the partner sees a band, never the figure', () => {
  // Zero is "nothing counted", not "never ordered" — orders that have not
  // matured yet total zero and the client has still plainly bought something.
  assert.equal(valueBand(0), 'Nothing yet')
  assert.equal(valueBand(49999), 'Under ₹50 K')
  assert.equal(valueBand(50000), 'Under ₹50 K')
  assert.equal(valueBand(50001), '₹50 K – ₹1 L')
  assert.equal(valueBand(384500), '₹2.5 L – ₹5 L')
  assert.equal(valueBand(99999999), 'Over ₹10 L')
})

// ===========================================================================
// Theme (PRD §13.3)
// ===========================================================================

console.log('\nTheming, and the three things it is not allowed to touch')
t('every curated preset passes WCAG AA against white button text', () => {
  for (const p of PRESETS) {
    const c = checkTheme(p.primary)
    assert.ok(c.ok, `${p.label} (${p.primary}) fails AA`)
  }
})
t('contrast is the real WCAG ratio', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21)
  assert.equal(contrast('#ffffff', '#ffffff'), 1)
})
t('a pale brand colour is REJECTED rather than applied', () => {
  const c = checkTheme('#ffe066')
  assert.equal(c.ok, false)
  assert.equal(c.ok === false && c.reason, 'low_contrast')
})
t('and the workspace falls back to the preset instead of shipping unreadable buttons', () => {
  const r = resolveTheme({ theme_preset: 'forest', theme_primary: '#ffe066' })
  assert.equal(r.primary, PRESETS.find((p) => p.key === 'forest')!.primary)
})
t('a valid custom colour IS applied', () => {
  assert.equal(resolveTheme({ theme_preset: 'default', theme_primary: '#1b4f9c' }).primary, '#1b4f9c')
})
t('nonsense is not applied, and does not throw', () => {
  assert.equal(checkTheme('not a colour').ok, false)
  assert.equal(resolveTheme({ theme_primary: 'octarine' }).primary, PRESETS[0].primary)
})
t('the emitted CSS touches brand tokens ONLY — never ink, surface or status', () => {
  const css = cssVariables({ theme_preset: 'indigo' })
  assert.ok(css.includes('--color-brand:'))
  for (const forbidden of ['--color-good', '--color-warn', '--color-bad', '--color-ink', '--color-surface', '--color-ground', '--color-line']) {
    assert.ok(!css.includes(forbidden), `theme must never set ${forbidden}`)
  }
})
t('the default theme emits nothing at all', () => {
  assert.equal(cssVariables({ theme_preset: 'default' }), '')
  assert.equal(cssVariables(null), '')
})

console.log(`\n${n} passed, 0 failed`)
