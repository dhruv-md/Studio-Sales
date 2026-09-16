/**
 * The event taxonomy — PRD §14.6.4, verbatim.
 *
 * Naming convention, and it is enforced by this file existing: `object_action`,
 * lower snake case, past tense. No spaces, no camelCase, no ad-hoc synonyms —
 * `referral_submitted`, never `Submit Referral` or `referralSent`.
 *
 * §14.6.6 makes the rule explicit: **no event ships without an entry here, and
 * no entry exists without a question it answers.** That second half is what
 * prevents the 400-event graveyard every analytics implementation drifts into,
 * so each constant below carries the question in a comment rather than in a
 * separate spreadsheet nobody opens.
 */

export const EV = {
  // ---- Session — "who opens it at all?" (§14.6.1, Reach)
  login: 'login',
  logout: 'logout',
  session_start: 'session_start',
  /** activation time: credential issue → first login */
  first_login_completed: 'first_login_completed',
  password_changed: 'password_changed',

  // ---- Overview — "is the landing page answering the five-second question?"
  overview_viewed: 'overview_viewed',
  date_range_changed: 'date_range_changed',
  metric_card_clicked: 'metric_card_clicked',
  activity_item_clicked: 'activity_item_clicked',
  nba_nudge_clicked: 'nba_nudge_clicked',
  /** property: channel — which way they actually contact their KAM */
  kam_contact_clicked: 'kam_contact_clicked',

  // ---- Clients — "does the journey view get used, or only the list?"
  client_list_viewed: 'client_list_viewed',
  client_filter_applied: 'client_filter_applied',
  referral_started: 'referral_started',
  referral_submitted: 'referral_submitted',
  /** property: last_field — where the referral form loses people */
  referral_abandoned: 'referral_abandoned',
  client_detail_viewed: 'client_detail_viewed',
  journey_event_expanded: 'journey_event_expanded',
  cart_viewed: 'cart_viewed',
  cart_item_added_by_partner: 'cart_item_added_by_partner',
  escalation_raised: 'escalation_raised',

  // ---- Rewards — "do partners understand the programme, or only the total?"
  rewards_viewed: 'rewards_viewed',
  slab_progress_viewed: 'slab_progress_viewed',
  ledger_filtered: 'ledger_filtered',
  ledger_exported: 'ledger_exported',
  programme_terms_opened: 'programme_terms_opened',
  coin_wall_viewed: 'coin_wall_viewed',

  // ---- Projects — mood boards and inspiration spaces
  project_created: 'project_created',
  project_opened: 'project_opened',
  space_created: 'space_created',
  space_renamed: 'space_renamed',
  /** property: source = palette | upload | link */
  board_item_added: 'board_item_added',
  palette_browsed: 'palette_browsed',
  palette_saved_to_space: 'palette_saved_to_space',
  project_shared: 'project_shared',
  project_pdf_exported: 'project_pdf_exported',

  // ---- The opt-in design/quote/procurement workspace, kept distinct from
  // the Projects tab above so the two are never conflated in the numbers.
  workspace_project_opened: 'workspace_project_opened',
  sku_chip_clicked: 'sku_chip_clicked',
  wishlist_toggled: 'wishlist_toggled',
  board_item_compared: 'board_item_compared',

  // ---- Portfolio — "is the distribution promise being taken up?"
  portfolio_started: 'portfolio_started',
  portfolio_submitted: 'portfolio_submitted',
  portfolio_abandoned: 'portfolio_abandoned',
  portfolio_public_url_clicked: 'portfolio_public_url_clicked',

  // ---- Settings
  profile_edited: 'profile_edited',
  theme_changed: 'theme_changed',
  team_member_requested: 'team_member_requested',
  notification_pref_changed: 'notification_pref_changed',

  // ---- Friction — "where do they struggle?" (§14.6.1, Friction)
  /** property: code, surface */
  error_shown: 'error_shown',
  empty_state_shown: 'empty_state_shown',
  /** property: field */
  form_validation_failed: 'form_validation_failed',

  // ---- The three deliberate hover exceptions (§14.6.4)
  //
  // Hovers are NOT sent as events — the volume would swamp the pipeline and the
  // bill. Hover intent is Clarity's job. These three are the exceptions,
  // because each one tells us where curiosity exists without conversion, and
  // each carries a 1-second dwell threshold and 10% sampling.
  sku_chip_hovered: 'sku_chip_hovered',
  locked_reward_hovered: 'locked_reward_hovered',
  masked_phone_hovered: 'masked_phone_hovered',
} as const

export type EventName = (typeof EV)[keyof typeof EV]

/** §14.6.4 — 1-second dwell, 10% sampling, and only on these three. */
export const HOVER_EVENTS: EventName[] = [EV.sku_chip_hovered, EV.locked_reward_hovered, EV.masked_phone_hovered]
export const HOVER_DWELL_MS = 1000
export const HOVER_SAMPLE_RATE = 0.1

/**
 * §14.6.3 — the properties that go out with EVERY event.
 *
 * `distinct_id` is the user id and never a phone or an email (§14.6.3). The
 * GROUP KEY is `org_id`, because the unit of analysis here is the firm and not
 * the individual: "three designers at one studio each logged in twice" is one
 * active firm, and Mixpanel Group Analytics has to be configured on this key at
 * implementation rather than retrofitted.
 */
export type SuperProps = {
  org_id: string
  org_name: string
  user_id: string
  role: 'admin' | 'design' | 'procurement' | 'md_staff'
  city: string | null
  pincode: string | null
  kam_id: string | null
  org_status: 'live' | 'dormant'
  current_slab: number | null
  platform: 'web' | 'mobile_web'
  app_version: string
  /**
   * §14.6.7 — true for Material Depot's own people, so internal traffic is
   * excluded from every partner-facing report BY DEFAULT rather than by
   * somebody remembering to add a filter to each one.
   */
  is_internal: boolean
}

/**
 * §14.6.7 — no PII in event properties, ever. Names, phone numbers, emails and
 * addresses are IDs by the time they reach here.
 *
 * This is a runtime check and not only a convention, because the convention is
 * what fails: one `{ client_name }` in one handler is a DPDP problem that
 * nobody notices until it is in a vendor's warehouse and cannot be recalled.
 */
const PII_KEYS = /(^|_)(name|phone|mobile|email|address|gst|gstin|pan)($|_)/i

export function stripPII(props: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEYS.test(k)) continue
    if (typeof v === 'string' && /^[6-9]\d{9}$/.test(v)) continue
    clean[k] = v
  }
  return clean
}
