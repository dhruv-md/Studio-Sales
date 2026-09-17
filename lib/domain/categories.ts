/**
 * What a referred client is after — the single list used on the referral form
 * and on every visit-scheduling form, so the same nine words mean the same
 * thing everywhere a store team reads them.
 *
 * Not the same list as `components/design/ProductPicker.tsx`'s catalogue
 * search filter — that one drives a live product search and has to match
 * Material Depot's own catalogue taxonomy, which is a different question from
 * "what should the store have ready before this client walks in."
 */
export const INTEREST_CATEGORIES = [
  'Tiles',
  'Laminates',
  'Wooden flooring',
  'Wallpaper',
  'Wall panels',
  'Plywood',
  'Quartz',
  'Bathroom accessories',
  'Hardware',
] as const

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number]
