/**
 * Reason codes — PRD Appendix B.
 *
 * A rejection with no reason code is the thing §18 names as the cause of
 * attribution disputes: "visible reason codes" is the mitigation, alongside the
 * pre-submission duplicate check and the 72h arbitration SLA. So the code is
 * stored, the partner-facing sentence is derived from it here, and the free-text
 * note is an ADDITION to the code rather than a replacement for it.
 *
 * Every code carries the sentence a partner reads. Writing that sentence at the
 * call site is how six different phrasings of ALREADY_ATTRIBUTED end up in the
 * product, and a partner comparing notes with another firm finds two.
 */

export const REFERRAL_REJECTION = {
  ALREADY_ATTRIBUTED: 'This client is already credited to another firm. The first approved referral holds the attribution — your key account manager can take it to arbitration.',
  EXISTING_CUSTOMER: 'This number already had order history with Material Depot before you referred them, so it is not attributable by default. An admin can override that.',
  INVALID_CONTACT: 'We could not reach this client on the number given.',
  DUPLICATE_SUBMISSION: 'You have already referred this client.',
  NO_CONSENT: 'The client has not confirmed they are happy for us to share their activity with you.',
  OUT_OF_SERVICE_AREA: 'We do not serve this location yet.',
  OTHER: 'See the note from your key account manager.',
} as const

export const ORDER_NOT_COUNTED = {
  PRE_GO_LIVE: 'Placed before the programme started, so it carries no reward value.',
  CLIENT_NOT_ATTRIBUTED: 'This client is not credited to your firm.',
  ATTRIBUTION_EXPIRED: 'Your attribution window on this client had closed when the order was placed.',
  EXCLUDED_CATEGORY: 'This category is outside the incentive programme.',
  SELF_PURCHASE_EXCLUDED: 'Bought on your own firm’s GST, and excluded by an admin.',
  ORDER_CANCELLED: 'The order was cancelled.',
  NOT_MATURED: 'Not yet 7 days past delivery. It will count once it matures.',
  OPEN_ESCALATION: 'There is an open escalation against this order. It matures once that is closed.',
  DUPLICATE_ORDER: 'The same order reached us twice; only one copy counts.',
  PRICING_EXCEPTION: 'Priced outside the standard structure. Your key account manager has the detail.',
  OTHER: 'See the note from your key account manager.',
} as const

export const PORTFOLIO_REJECTION = {
  IMAGE_QUALITY: 'The images are not large or sharp enough for the public site.',
  NO_CLIENT_CONSENT: 'We need the client’s written consent before publishing their home.',
  COMPETITOR_BRANDING: 'The images carry another supplier’s branding.',
  INACCURATE_MATERIALS: 'The materials listed do not match what was supplied.',
  INCOMPLETE_DETAILS: 'Some required details are missing.',
  NOT_OWN_WORK: 'We could not confirm this is your firm’s own work.',
  OTHER: 'See the note from our content team.',
} as const

export type ReferralRejection = keyof typeof REFERRAL_REJECTION
export type OrderNotCounted = keyof typeof ORDER_NOT_COUNTED
export type PortfolioRejection = keyof typeof PORTFOLIO_REJECTION

export const REFERRAL_REJECTION_CODES = Object.keys(REFERRAL_REJECTION) as ReferralRejection[]
export const ORDER_NOT_COUNTED_CODES = Object.keys(ORDER_NOT_COUNTED) as OrderNotCounted[]
export const PORTFOLIO_REJECTION_CODES = Object.keys(PORTFOLIO_REJECTION) as PortfolioRejection[]

/** `ALREADY_ATTRIBUTED` → `Already attributed`, for a chip. */
export function codeLabel(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The sentence for a code, or an honest fallback.
 *
 * An unrecognised code means somebody added one in the console or the CRM
 * without adding it here. Rendering the raw `SOME_NEW_CODE` at a partner is bad;
 * rendering nothing at all is worse, because the order then shows as not counted
 * with no explanation, which is the dispute this file exists to prevent.
 */
export function explain(map: Record<string, string>, code: string | null | undefined, note?: string | null): string | null {
  if (!code) return note ?? null
  const base = map[code] ?? `${codeLabel(code)}. Your key account manager can explain this one.`
  return note ? `${base} ${note}` : base
}
