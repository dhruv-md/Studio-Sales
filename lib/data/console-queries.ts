import { supabaseServer } from '@/lib/supabase/server'
import { fail, ok, type Result } from './result'
import type {
  OutreachProspect, OutreachTouch, Partner, PartnerActivity, PartnerApplication, PartnerTeamInvite,
  PortfolioItem, Referral, ReferralEvent, ReferralOrder, ReferralPhone, RewardClaim, StaffUser,
  PortfolioItem, Referral, ReferralEvent, ReferralOrder, ReferralPhone, RewardClaim, StaffUser,
} from '@/lib/domain/types'

/**
 * Reads for the Material Depot console.
 *
 * Scoped by RLS, not by a filter here. `app_covers_market()` decides what a
 * Bangalore outreach manager can see; none of these queries adds a belt-and-
 * braces `.eq('market', …)`, because a second filter would make a policy bug
 * look like correct behaviour instead of showing up as a leak in
 * `supabase/test/rlstest.js`.
 *
 * Note what is NOT in this file: there is no read of `client`, `project`,
 * `board`, `quote`, `procurement_item` or `finance_entry`. Staff have no policy
 * on those tables and must never get one — an architect's own clients, prices
 * and margins are the thing they are trusting this app with.
 */

async function many<T>(
  build: (sb: Awaited<ReturnType<typeof supabaseServer>>) => unknown,
  what: string,
): Promise<Result<T[]>> {
  const sb = await supabaseServer()
  const { data, error } = (await build(sb)) as { data: T[] | null; error: { message: string } | null }
  if (error) return fail(`Could not load ${what}: ${error.message}`)
  return ok(data ?? [])
}

async function one<T>(
  build: (sb: Awaited<ReturnType<typeof supabaseServer>>) => unknown,
  what: string,
): Promise<Result<T | null>> {
  const sb = await supabaseServer()
  const { data, error } = (await build(sb)) as { data: T | null; error: { message: string } | null }
  if (error) return fail(`Could not load ${what}: ${error.message}`)
  return ok(data ?? null)
}

// ------------------------------------------------------------------- team

export const listStaff = () =>
  many<StaffUser>((sb) => sb.from('staff_user').select('*').order('role').order('name'), 'the team')

// ----------------------------------------------------------------- firms

export const listPartners = () =>
  many<Partner>((sb) => sb.from('partner').select('*').order('firm_name'), 'the partner firms')

export const getPartner = (id: string) =>
  one<Partner>((sb) => sb.from('partner').select('*').eq('id', id).maybeSingle(), 'this firm')

export const listReferralsFor = (partnerId: string) =>
  many<Referral>(
    (sb) => sb.from('referral').select('*').eq('partner_id', partnerId).order('referred_on', { ascending: false }),
    'this firm’s referrals',
  )

export const listTeamInvitesFor = (partnerId: string) =>
  many<PartnerTeamInvite>(
    (sb) => sb.from('partner_team_invite').select('*').eq('partner_id', partnerId).order('requested_at', { ascending: false }),
    'this firm’s team requests',
  )

/**
 * Every referred order across every firm in scope, newest first, with the firm
 * and the client attached.
 *
 * One query with two nested selects rather than a fan-out per order: the console
 * lists these hundreds at a time and Material Depot has already shipped a screen
 * that made one request per row.
 */
export type OrderWithOwner = ReferralOrder & {
  referral: (Pick<Referral, 'id' | 'client_name' | 'md_phone' | 'partner_id'> & {
    partner: Pick<Partner, 'id' | 'firm_name' | 'market'> | null
  }) | null
}

export const listAllOrders = (limit = 500) =>
  many<OrderWithOwner>(
    (sb) =>
      sb
        .from('referral_order')
        .select('*, referral:referral_id ( id, client_name, md_phone, partner_id, partner:partner_id ( id, firm_name, market ) )')
        .order('ordered_on', { ascending: false, nullsFirst: false })
        .limit(limit),
    'referred orders',
  )

/**
 * Numbers a firm has added to one of its clients that are waiting for a Material
 * Depot admin to approve them. Until approved, the sync will not match a cart or
 * order on them (008_phone_approval), so this is a money gate, not cosmetics —
 * it sits on the Verify desk next to orders and portfolios.
 */
export type PhoneWithOwner = ReferralPhone & {
  referral: (Pick<Referral, 'id' | 'client_name' | 'partner_id'> & {
    partner: Pick<Partner, 'id' | 'firm_name' | 'market'> | null
  }) | null
}

export const listPendingPhones = () =>
  many<PhoneWithOwner>(
    (sb) =>
      sb
        .from('referral_phone')
        .select('*, referral:referral_id ( id, client_name, partner_id, partner:partner_id ( id, firm_name, market ) )')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false }),
    'numbers waiting for approval',
  )

export const listOrdersFor = (referralIds: string[]) =>
  referralIds.length
    ? many<ReferralOrder>(
        (sb) =>
          sb.from('referral_order').select('*').in('referral_id', referralIds)
            .order('ordered_on', { ascending: false, nullsFirst: false }),
        'this firm’s orders',
      )
    : Promise.resolve(ok<ReferralOrder[]>([]))

export const listClaimsFor = (partnerId: string) =>
  many<RewardClaim>(
    (sb) => sb.from('reward_claim').select('*').eq('partner_id', partnerId).order('tier_id'),
    'this firm’s rewards',
  )

export const listActivityFor = (partnerId: string, limit = 60) =>
  many<PartnerActivity>(
    (sb) =>
      sb.from('partner_activity').select('*').eq('partner_id', partnerId)
        .order('occurred_at', { ascending: false }).limit(limit),
    'this firm’s history',
  )

/**
 * What this firm's referred clients have been doing at Material Depot — store
 * visits, carts, quotes, orders.
 *
 * Staff have had a read policy on `referral_event` since 004
 * (`referral_event_staff_read`); nothing in the console showed it until the
 * firm-view page. It is the same timeline the partner sees on their own
 * dashboard, which is the point: a KAM ringing a firm about a quiet month
 * should be looking at the screen that firm is looking at.
 */
export const listEventsFor = (referralIds: string[], limit = 200) =>
  referralIds.length
    ? many<ReferralEvent>(
        (sb) =>
          sb.from('referral_event').select('*').in('referral_id', referralIds)
            .order('occurred_at', { ascending: false }).limit(limit),
        'what this firm’s clients have been doing',
      )
    : Promise.resolve(ok<ReferralEvent[]>([]))

export const listPortfolioFor = (partnerId: string) =>
  many<PortfolioItem>(
    (sb) => sb.from('portfolio_item').select('*').eq('partner_id', partnerId).order('sort_order'),
    'this firm’s portfolio',
  )

// ---------------------------------------------------------- applications

export const listApplications = () =>
  many<PartnerApplication>(
    (sb) => sb.from('partner_application').select('*').order('created_at', { ascending: false }),
    'onboarding forms',
  )

export const getApplication = (id: string) =>
  one<PartnerApplication>(
    (sb) => sb.from('partner_application').select('*').eq('id', id).maybeSingle(),
    'this onboarding form',
  )

// -------------------------------------------------------------- outreach

export const listProspects = () =>
  many<OutreachProspect>(
    (sb) =>
      sb.from('outreach_prospect').select('*')
        .order('next_action_on', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false }),
    'the outreach list',
  )

export const getProspect = (id: string) =>
  one<OutreachProspect>((sb) => sb.from('outreach_prospect').select('*').eq('id', id).maybeSingle(), 'this prospect')

export const listTouches = (prospectIds: string[], limit = 400) =>
  prospectIds.length
    ? many<OutreachTouch>(
        (sb) =>
          sb.from('outreach_touch').select('*').in('prospect_id', prospectIds)
            .order('occurred_at', { ascending: false }).limit(limit),
        'the call and meeting log',
      )
    : Promise.resolve(ok<OutreachTouch[]>([]))

// ------------------------------------------------------------- portfolio

export type PortfolioWithFirm = PortfolioItem & {
  partner: Pick<Partner, 'id' | 'firm_name' | 'market' | 'city'> | null
}

export const listPortfolioQueue = () =>
  many<PortfolioWithFirm>(
    (sb) =>
      sb
        .from('portfolio_item')
        .select('*, partner:partner_id ( id, firm_name, market, city )')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
    'portfolio submissions',
  )
