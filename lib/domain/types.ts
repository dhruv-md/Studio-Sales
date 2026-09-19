// Row shapes, mirroring supabase/migrations/001_init.sql. If you change a
// column there, change it here in the same commit.

export type FirmType = 'architect' | 'interior_designer' | 'design_build' | 'contractor' | 'other'
export type PartnerRole = 'principal' | 'associate' | 'viewer'
export type OnboardingSource = 'self_signup' | 'outreach' | 'inbound' | 'existing_client'

export type Partner = {
  id: string
  firm_name: string
  contact_name: string
  phone: string
  email: string | null
  city: string | null
  gst: string | null
  firm_type: FirmType
  onboarded_on: string
  created_at: string
  // 003_roles.sql. Every field below is set by Material Depot, not by the firm —
  // a trigger in 004_roles_rls.sql refuses a firm's own update to any of them.
  market: string | null
  kam_user_id: string | null
  onboarding_source: OnboardingSource
  onboarded_by: string | null
  md_client_id: string | null
  /**
   * The full project workspace — rooms, boards, quotes, procurement, P&L.
   * OFF by default and turned on per firm by Material Depot. A designer will
   * not move their pricing into a supplier's portal on day one, and a nav full
   * of modules they never asked for is what makes them close the tab.
   */
  workspace_enabled: boolean
  internal_note: string | null
  // Public studio profile, for materialdepot.com. The firm owns these.
  bio: string | null
  website: string | null
  instagram: string | null
  logo_url: string | null
  // 005_studio.sql — PRD §13.1 and §13.3. Optional: see the note on Referral.
  theme_preset?: string
  theme_primary?: string | null
  theme_accent?: string | null
  theme_base?: 'light' | 'dark'
  legal_name?: string | null
  pan?: string | null
  registered_address?: string | null
  office_address?: string | null
  /** §2.5 captures this now so pincode-based KAM assignment in Phase 2 is a
   *  configuration change and not a rebuild. */
  pincode?: string | null
  operating_area?: string | null
  linkedin?: string | null
  established_year?: number | null
  team_size?: string | null
  services?: string[]
  project_types?: string[]
  budget_range?: string | null
  /** §11.7's org-level opt-out of aggregated market-signal use */
  market_signal_opt_in?: boolean
}

export type Client = {
  id: string
  partner_id: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProjectStage = 'design' | 'procurement' | 'execution' | 'closed'
export type ProjectStatus = 'active' | 'on_hold' | 'won' | 'lost' | 'closed'

export type Project = {
  id: string
  partner_id: string
  client_id: string
  name: string
  site_address: string | null
  city: string | null
  project_type: 'residential' | 'commercial' | 'hospitality' | 'retail' | 'office' | 'other'
  stage: ProjectStage
  status: ProjectStatus
  carpet_area_sqft: number | null
  budget: number | null
  design_fee: number | null
  started_on: string | null
  target_on: string | null
  closed_on: string | null
  created_at: string
  updated_at: string
}

export type AreaStatus = 'exploring' | 'shortlisted' | 'finalised' | 'dropped'

export type ProjectArea = {
  id: string
  project_id: string
  area_type: string
  name: string
  floor_area_sqft: number | null
  wall_area_sqft: number | null
  status: AreaStatus
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type BoardStatus = 'draft' | 'shared' | 'approved' | 'rejected'

export type Board = {
  id: string
  area_id: string
  name: string
  palette_scene: string | null
  cover_url: string | null
  status: BoardStatus
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type BoardItem = {
  id: string
  board_id: string
  kind: 'product' | 'image' | 'note'
  surface: string | null
  variant_id: string | null
  sku: string | null
  product_name: string | null
  brand: string | null
  category: string | null
  size: string | null
  finish: string | null
  image_url: string | null
  md_url: string | null
  unit: string | null
  rate: number | null
  mrp: number | null
  gst_pct: number | null
  coverage_area: number | null
  priced_at: string | null
  qty: number | null
  wastage_pct: number
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type QuoteStatus = 'draft' | 'shared' | 'accepted' | 'rejected' | 'superseded'

export type Quote = {
  id: string
  project_id: string
  version: number
  title: string | null
  status: QuoteStatus
  markup_pct: number
  discount: number
  valid_until: string | null
  shared_at: string | null
  decided_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type QuoteLine = {
  id: string
  quote_id: string
  board_item_id: string | null
  area_id: string | null
  area_label: string | null
  description: string
  sku: string | null
  variant_id: string | null
  qty: number
  unit: string
  rate: number
  gst_pct: number
  line_markup_pct: number | null
  sort_order: number
  created_at: string
}

export type ProcurementStatus =
  | 'pending' | 'ordered' | 'dispatched' | 'delivered' | 'installed' | 'cancelled'

export type ProcurementItem = {
  id: string
  project_id: string
  quote_line_id: string | null
  area_id: string | null
  area_label: string | null
  description: string
  sku: string | null
  variant_id: string | null
  unit: string
  qty_required: number
  qty_ordered: number
  qty_delivered: number
  qty_installed: number
  rate: number
  status: ProcurementStatus
  supplier: string
  md_enq_id: string | null
  expected_on: string | null
  delivered_on: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type FinanceEntry = {
  id: string
  project_id: string
  direction: 'cost' | 'income'
  category: string
  description: string
  amount: number
  entry_date: string
  settled: boolean
  counterparty: string | null
  reference: string | null
  created_at: string
}

export type ReferralStatus =
  | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'duplicate'
  | 'active' | 'dormant' | 'expired'

export type Referral = {
  id: string
  partner_id: string
  client_id: string | null
  project_id: string | null
  client_name: string
  md_phone: string
  referred_on: string
  notes: string | null
  created_at: string
  // 005_studio.sql — PRD §9.2's form, and §14.5's consent basis.
  //
  // Every field below is OPTIONAL in TypeScript even though several are NOT
  // NULL in Postgres. `queries.ts` reads `select('*')`, so on a deployment
  // where 005 has not been pasted yet they arrive as `undefined`; typing them
  // as required would compile and then read as `null` at runtime, which is the
  // shape of the landmine in docs/landmines.md rather than a fix for it.
  email?: string | null
  city?: string | null
  locality?: string | null
  project_type?: 'residential' | 'commercial' | 'other' | null
  /** free text, only meaningful when project_type is 'other' */
  project_type_other?: string | null
  budget_band?: string | null
  timeline?: string | null
  categories?: string[]
  assigned_user?: string | null
  /** the partner ticked the consent box on the form */
  consent_claimed_at?: string | null
  /** Material Depot confirmed it with the client. null = not asked yet. */
  consent_given?: boolean | null
  consent_at?: string | null
  status?: ReferralStatus
  rejection_reason?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  review_note?: string | null
  attribution_expires_on?: string | null
  /** 007_studio_v2.sql — set once the CRM outbox has fetched this referral. */
  pushed_at?: string | null
}

/** 007_studio_v2.sql — every number this client is known to place orders
 *  through, not just `referral.md_phone`. Cart/order matching reads only the
 *  `approved` ones (008_phone_review.sql) — a number a firm just added sits
 *  `pending` until Material Depot's admin says it counts. `client` is always
 *  approved: it is the number the referral itself was made on. */
export type ReferralPhone = {
  id: string
  referral_id: string
  phone: string
  label: 'partner' | 'client' | 'additional'
  added_by: string | null
  created_at: string
  /** A number a partner adds is `pending` until a Material Depot admin approves
   *  it — only an approved number is matched by the sync and the live pull. The
   *  primary 'client' number is `approved` from the start (008_phone_approval). */
  approval_status: 'pending' | 'approved' | 'rejected'
}

export type VisitRequestStatus = 'requested' | 'bm_assigned' | 'completed' | 'cancelled'

/** 007_studio_v2.sql — a store visit scheduled for a referred client. The
 *  first one is created alongside the referral; later ones are "schedule
 *  another visit" against the same client. */
export type VisitRequest = {
  id: string
  referral_id: string
  ec_name: string | null
  scheduled_on: string
  scheduled_time: string
  categories: string[]
  requirements: string | null
  notes: string | null
  status: VisitRequestStatus
  assigned_bm_name: string | null
  assigned_bm_phone: string | null
  assigned_bm_email: string | null
  assigned_bm_photo_url: string | null
  created_at: string
  updated_at: string
}

export type ReferralEventType =
  | 'store_visit' | 'product_view' | 'cart_add' | 'quote_shared' | 'order_placed' | 'call' | 'other'

export type ReferralEvent = {
  id: string
  referral_id: string
  event_type: ReferralEventType
  occurred_at: string
  store: string | null
  title: string | null
  detail: string | null
  amount: number | null
  payload: Record<string, unknown>
  external_id: string
  synced_at: string
}

export type OrderApproval = 'pending' | 'approved' | 'rejected'

export type ReferralOrder = {
  id: string
  referral_id: string
  md_enq_id: string
  order_value: number
  ordered_on: string | null
  store: string | null
  /** Material Depot's own order status — "Delivered", "Partially delivered". */
  status: string | null
  /**
   * Whether a Material Depot admin has verified this order. ONLY `approved`
   * counts towards the reward ladder. Money is handed over on the strength of
   * this number, so it gets a human — `review_referral_order()` in
   * 004_roles_rls.sql is the only thing that can change it.
   */
  approval_status: OrderApproval
  approved_by: string | null
  approved_at: string | null
  review_note: string | null
  synced_at: string
  // 005_studio.sql. Optional for the same reason as on Referral above.
  /** what the client actually paid at the till, as a code */
  coupon_code?: string | null
  /** rupees actually taken off. **null means UNKNOWN, never zero** — see
   *  `discountOn()` in lib/domain/ledger.ts. */
  discount_availed?: number | null
  /** maturation counts 7 days from HERE, not from `ordered_on` */
  delivered_on?: string | null
  not_counted_reason?: string | null
  /** placed on the partner firm's own GSTIN (§6.3.6) */
  is_self?: boolean | null
}

export type RewardTier = {
  id: number
  threshold: number
  label: string
  kind: 'silver' | 'gold' | 'trip'
  detail: string | null
  active: boolean
}

export type RewardClaim = {
  id: string
  partner_id: string
  tier_id: number
  status: 'unlocked' | 'claimed' | 'fulfilled'
  unlocked_at: string
  fulfilled_on: string | null
  notes: string | null
}

// ------------------------------------------------- Material Depot's own people

export type StaffRole = 'admin' | 'kam' | 'outreach' | 'inbound'

export type StaffUser = {
  user_id: string
  name: string
  email: string | null
  phone: string | null
  role: StaffRole
  /** null = every market. That is the admin and the central team. */
  market: string | null
  active: boolean
  created_at: string
  photo_url: string | null
}

/** What `my_kam()` returns to a partner. Their KAM, never anyone else's. */
export type MyKam = {
  name: string
  phone: string | null
  email: string | null
  market: string | null
  /** A KAM's own staff-set photo, link only — there is no upload path for
   *  this one. Null is common; the card falls back to an initials/icon
   *  avatar rather than a broken image. */
  photo_url: string | null
}

export type ApplicationStatus = 'submitted' | 'approved' | 'rejected' | 'provisioned'

export type PartnerApplication = {
  id: string
  firm_name: string
  contact_name: string
  phone: string
  email: string
  city: string | null
  market: string | null
  firm_type: FirmType
  gst: string | null
  team_size: string | null
  typical_projects: string | null
  met_on: string | null
  meeting_notes: string | null
  source: 'outreach' | 'inbound' | 'walk_in' | 'partner_referral' | 'existing_client' | 'other'
  proposed_kam: string | null
  status: ApplicationStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  partner_id: string | null
  credentials_issued_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProspectStage =
  | 'to_contact' | 'contacted' | 'meeting_set' | 'met' | 'onboarding' | 'onboarded' | 'not_interested'

export type OutreachProspect = {
  id: string
  firm_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  market: string
  firm_type: string | null
  source: string | null
  stage: ProspectStage
  owner_id: string | null
  next_action_on: string | null
  notes: string | null
  application_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TouchKind = 'call' | 'whatsapp' | 'email' | 'meeting' | 'visit' | 'note'

export type OutreachTouch = {
  id: string
  prospect_id: string
  kind: TouchKind
  occurred_at: string
  outcome: string | null
  note: string | null
  by_user: string | null
  created_at: string
}

export type PortfolioStatus = 'draft' | 'submitted' | 'published' | 'rejected'

export type PortfolioItem = {
  id: string
  partner_id: string
  title: string
  summary: string | null
  project_type: string | null
  city: string | null
  completed_on: string | null
  area_sqft: number | null
  cover_url: string | null
  image_urls: string[]
  credits: string | null
  status: PortfolioStatus
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // 007_studio_v2.sql — the client-facing revamp's field list. `completed_on`,
  // `area_sqft` and `credits` above stay in the schema for old rows; the form
  // no longer collects them.
  inspiration?: string | null
  drive_link?: string | null
  rough_cost?: number | null
  aspects_covered?: string[]
}

/** A short, editable checklist for "what all aspects were covered" on a
 *  portfolio piece. Not a CHECK constraint — a firm's own work can legitimately
 *  cover something this list has not thought of. */
export const PORTFOLIO_ASPECTS = ['Design', 'Execution', 'Turnkey', 'Furniture', 'Lighting', 'Styling'] as const

/** 007_studio_v2.sql — a firm asking Material Depot to provision a teammate. */
export type TeamInviteRole = 'design_team' | 'procurement'
export type TeamInviteStatus = 'requested' | 'approved' | 'rejected'

export type PartnerTeamInvite = {
  id: string
  partner_id: string
  name: string
  email: string
  role: TeamInviteRole
  status: TeamInviteStatus
  requested_by: string | null
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  provisioned_user_id: string | null
}

// -------------------------------------------------------------- escalations

export type EscalationCategory =
  | 'delivery_delay' | 'quality_damage' | 'wrong_item' | 'billing_gst' | 'other'

export type EscalationStatus =
  | 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'reopened'

/** PRD §9.4. An OPEN one against an order holds that order's maturation, so
 *  this table is read by the money path and not only by a support screen. */
export type Escalation = {
  id: string
  partner_id: string
  referral_id: string | null
  order_id: string | null
  category: EscalationCategory
  subject: string
  description: string
  attachments: string[]
  status: EscalationStatus
  raised_by: string | null
  raised_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  closed_at: string | null
  ack_due_at: string
  resolution_note: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export type EscalationComment = {
  id: string
  escalation_id: string
  body: string
  /** RLS hides `true` from the partner. There is deliberately no filter for it
   *  in any query — a filter is one forgotten call away from a leak. */
  internal: boolean
  author_id: string | null
  author_side: 'partner' | 'md'
  created_at: string
}

/** PRD §13.4. A missing row reads as "everything on": a firm that has never
 *  opened Settings should still be told its cashback was confirmed. */
export type NotificationPref = {
  partner_id: string
  prefs: Record<string, { in_app?: boolean; email?: boolean; whatsapp?: boolean }>
  updated_at: string
}

export type PartnerActivity = {
  id: string
  partner_id: string
  kind: string
  title: string
  detail: string | null
  occurred_at: string
  visible_to_partner: boolean
  by_user: string | null
  created_at: string
}

// ------------------------------------------------------- studio projects
//
// The Projects tab — mood boards and inspiration spaces. 007_studio_v2.sql.
// Deliberately separate from `Project`/`Client` above (the opt-in
// design/quote/procurement workspace) — unrelated columns, unrelated purpose.

export type StudioProject = {
  id: string
  partner_id: string
  name: string
  description: string | null
  project_type: 'residential' | 'commercial' | 'other' | null
  project_type_other: string | null
  city: string | null
  society: string | null
  referral_id: string | null
  client_name: string | null
  client_phone: string | null
  cover_url: string | null
  share_token: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export type StudioProjectSpace = {
  id: string
  project_id: string
  name: string
  sort_order: number
  share_token: string | null
  is_deleted: boolean
  created_at: string
}

export type StudioItemKind = 'image' | 'video' | 'palette_link' | 'product_link'

export type StudioProjectItem = {
  id: string
  space_id: string
  kind: StudioItemKind
  url: string
  caption: string | null
  source: 'upload' | 'palette' | 'manual'
  sort_order: number
  created_at: string
}

export type StudioProjectTemplate = {
  id: string
  partner_id: string
  name: string
  accent_color: string | null
  intro_note: string | null
  created_at: string
}
