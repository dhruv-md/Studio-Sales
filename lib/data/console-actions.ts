'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer, supabaseService } from '@/lib/supabase/server'
import { requireStaff } from './session'
import { fail, ok, type Result } from './result'
import { phone10 } from '@/lib/format'
import { generatePassword, seal, unseal } from '@/lib/auth/credentials'
import { recordUnlockedTiers } from './unlock'
import type { OrderApproval, PartnerApplication, PortfolioStatus, ProspectStage, StaffRole, TouchKind } from '@/lib/domain/types'
import type { OrderNotCounted } from '@/lib/domain/reasons'

/**
 * Every write the Material Depot console makes.
 *
 * Three rules, and the third is the one that matters here:
 *
 * 1. **A failed write is returned, never swallowed.** Same as `actions.ts`.
 * 2. **RLS does the authorisation** for anything written with the caller's own
 *    session — `partner_application`, `outreach_prospect`, `outreach_touch`,
 *    `partner_activity` and the admin-only update on `partner`.
 * 3. **Anything that uses the service role checks the caller FIRST**, because
 *    the service role bypasses RLS entirely. Every such function starts with
 *    `requireStaff(['admin'])` and never takes a partner id or an email from
 *    the form without loading the row it belongs to.
 *
 * The two writes that decide money — approving an order, publishing a portfolio
 * piece — do not use the service role at all. They go through SECURITY DEFINER
 * functions that re-check `app_is_admin()` inside Postgres, so a mistake in this
 * file cannot hand anybody a gold coin.
 */

type Row = Record<string, unknown>

// ==================================================== the order approval gate

/**
 * PRD Appendix B: a DECLINED order needs a reason code, and the database now
 * refuses one without it.
 *
 * The code is what the partner is shown — `standingSentence()` turns it into a
 * sentence, one sentence per code, everywhere. §18 names undocumented rejections
 * as the cause of attribution disputes and "visible reason codes" as the
 * mitigation, so the free-text note is an ADDITION to the code rather than a
 * replacement for it.
 */
export async function reviewOrder(
  orderId: string,
  status: OrderApproval,
  note?: string | null,
  reason?: OrderNotCounted | null,
  isSelf?: boolean,
) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff
  if (status === 'rejected' && !reason) {
    return fail('Pick a reason for not counting this order — the partner is shown it, and "declined" on its own is what starts an argument.')
  }

  const sb = await supabaseServer()
  const { data, error } = await sb.rpc('review_referral_order', {
    p_order_id: orderId,
    p_status: status,
    p_note: note?.trim() || null,
    p_reason: reason ?? null,
    p_self: isSelf ?? null,
  })
  if (error) return fail(`Could not save that decision: ${error.message}`)

  // Approving is the moment a tier can be crossed — the sync writes orders as
  // pending and unlocks nothing. Done with the service role because
  // `reward_claim` has no insert policy for anybody, which is what stops a
  // partner from writing their own.
  //
  // Its failure does not fail the approval: the tier is DERIVED from the orders
  // wherever it is displayed, so the partner already sees the progress. The
  // claim row only records when it happened, and the next approval or sync
  // writes it. Reported all the same rather than swallowed.
  if (status === 'approved') {
    const row = Array.isArray(data) ? data[0] : data
    const referralId = (row as { referral_id?: string } | null)?.referral_id
    if (referralId) {
      const svc = supabaseService()
      const { data: ref } = await svc.from('referral').select('partner_id').eq('id', referralId).maybeSingle()
      if (ref?.partner_id) {
        try {
          await recordUnlockedTiers(svc, [ref.partner_id as string])
        } catch (e) {
          return fail(
            `Order approved. The reward milestone was not stamped — ${e instanceof Error ? e.message : String(e)} — but their progress on screen is computed from the orders, so it is already correct.`,
          )
        }
      }
    }
  }

  revalidatePath('/console/approvals')
  revalidatePath('/console/partners')
  return ok(data)
}

/**
 * Approve an order and tell the firm, in one action.
 *
 * The activity row is written with the caller's own session, so if it fails the
 * partner simply has no note about it — the approval itself is already done and
 * is the part that matters. Its failure is still returned rather than dropped:
 * an admin who sees "approved, but we could not add it to their timeline" knows
 * to say something, which is better than a silent gap.
 */
export async function approveOrderAndNotify(
  orderId: string,
  partnerId: string,
  summary: string,
  note?: string | null,
) {
  const done = await reviewOrder(orderId, 'approved', note, null)
  if (!done.ok) return done

  const logged = await logActivity({
    partnerId,
    kind: 'order_approved',
    title: summary,
    detail: 'Counted towards your reward progress.',
    visibleToPartner: true,
  })
  if (!logged.ok) {
    return fail(`Order approved — but the firm's timeline was not updated: ${logged.error}`)
  }
  return ok(true as const)
}

// ================================================================ portfolio

/**
 * Approve or reject a number a partner linked to one of their clients. Goes
 * through `review_referral_phone()`, which re-checks `app_is_admin()` inside
 * Postgres — `referral_phone` has no UPDATE policy, so this function is the only
 * thing that can move the column, and an app-layer slip cannot approve a number.
 */
export async function reviewReferralPhone(id: string, status: 'approved' | 'rejected') {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const sb = await supabaseServer()
  const { error } = await sb.rpc('review_referral_phone', { p_id: id, p_status: status })
  if (error) return fail(`Could not save that decision: ${error.message}`)
  revalidatePath('/console/approvals')
  return ok(true)
}

export async function reviewPortfolio(itemId: string, status: PortfolioStatus, note?: string | null) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const sb = await supabaseServer()
  const { data, error } = await sb.rpc('review_portfolio_item', {
    p_item_id: itemId,
    p_status: status,
    p_note: note?.trim() || null,
  })
  if (error) return fail(`Could not save that decision: ${error.message}`)
  revalidatePath('/console/approvals')
  return ok(data)
}

// ================================================================== firms

/** The fields Material Depot owns on a firm. Admin only, in the policy and here. */
export async function updatePartnerAdminFields(
  partnerId: string,
  values: {
    market?: string | null
    kam_user_id?: string | null
    workspace_enabled?: boolean
    internal_note?: string | null
    onboarding_source?: string
  },
) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const payload: Row = {}
  for (const [k, v] of Object.entries(values)) if (v !== undefined) payload[k] = v
  if (!Object.keys(payload).length) return fail('Nothing to change.')

  const sb = await supabaseServer()
  const { data, error } = await sb.from('partner').update(payload).eq('id', partnerId).select().single()
  if (error) return fail(`Could not update this firm: ${error.message}`)

  revalidatePath(`/console/partners/${partnerId}`)
  revalidatePath('/console/partners')
  return ok(data)
}

export async function logActivity(input: {
  partnerId: string
  kind: string
  title: string
  detail?: string | null
  visibleToPartner?: boolean
  occurredAt?: string
}) {
  const staff = await requireStaff()
  if (!staff.ok) return staff
  if (!input.title?.trim()) return fail('A note needs a title.')

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('partner_activity')
    .insert({
      partner_id: input.partnerId,
      kind: input.kind,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      visible_to_partner: input.visibleToPartner ?? true,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      by_user: staff.data.user_id,
    })
    .select()
    .single()
  if (error) return fail(`Could not save that note: ${error.message}`)

  revalidatePath(`/console/partners/${input.partnerId}`)
  return ok(data)
}

// ============================================================== prospects

export async function createProspect(input: {
  firm_name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  market: string
  firm_type?: string | null
  source?: string | null
  next_action_on?: string | null
  notes?: string | null
}) {
  const staff = await requireStaff()
  if (!staff.ok) return staff
  if (!input.firm_name?.trim()) return fail('The firm needs a name.')
  if (!input.market) return fail('Pick a market — this is what decides whose list it lands on.')

  // A phone that is present but unusable is refused, not stored as null. The
  // ten digits are the exact key every later match runs on, and a silently
  // dropped number is a prospect nobody can ever tie to an order.
  let phone: string | null = null
  if (input.phone?.trim()) {
    phone = phone10(input.phone)
    if (!phone) return fail(`"${input.phone}" is not a 10-digit Indian mobile number.`)
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('outreach_prospect')
    .insert({
      firm_name: input.firm_name.trim(),
      contact_name: input.contact_name?.trim() || null,
      phone,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      market: input.market,
      firm_type: input.firm_type || null,
      source: input.source?.trim() || null,
      next_action_on: input.next_action_on || null,
      notes: input.notes?.trim() || null,
      owner_id: staff.data.user_id,
      created_by: staff.data.user_id,
    })
    .select()
    .single()
  if (error) return fail(`Could not add this prospect: ${error.message}`)
  revalidatePath('/console/prospects')
  return ok(data)
}

export async function updateProspect(id: string, values: { stage?: ProspectStage; next_action_on?: string | null; notes?: string | null; owner_id?: string | null }) {
  const staff = await requireStaff()
  if (!staff.ok) return staff

  const payload: Row = {}
  for (const [k, v] of Object.entries(values)) if (v !== undefined) payload[k] = v
  if (!Object.keys(payload).length) return fail('Nothing to change.')

  const sb = await supabaseServer()
  const { data, error } = await sb.from('outreach_prospect').update(payload).eq('id', id).select().single()
  if (error) return fail(`Could not update this prospect: ${error.message}`)
  revalidatePath('/console/prospects')
  return ok(data)
}

export async function addTouch(input: {
  prospectId: string
  kind: TouchKind
  outcome?: string | null
  note?: string | null
  occurredAt?: string
}) {
  const staff = await requireStaff()
  if (!staff.ok) return staff

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('outreach_touch')
    .insert({
      prospect_id: input.prospectId,
      kind: input.kind,
      outcome: input.outcome?.trim() || null,
      note: input.note?.trim() || null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      by_user: staff.data.user_id,
    })
    .select()
    .single()
  if (error) return fail(`Could not log that: ${error.message}`)
  revalidatePath('/console/prospects')
  return ok(data)
}

// =========================================================== applications

export async function createApplication(input: {
  firm_name: string
  contact_name: string
  phone: string
  email: string
  city?: string | null
  market?: string | null
  firm_type?: string
  gst?: string | null
  team_size?: string | null
  typical_projects?: string | null
  met_on?: string | null
  meeting_notes?: string | null
  source?: string
  proposed_kam?: string | null
  prospect_id?: string | null
}): Promise<Result<PartnerApplication>> {
  const staff = await requireStaff()
  if (!staff.ok) return staff

  if (!input.firm_name?.trim()) return fail('The firm needs a name.')
  if (!input.contact_name?.trim()) return fail('Who did you meet? A contact name is needed.')
  if (!input.email?.trim()) return fail('An email address is needed — it becomes their login.')

  // The phone is not optional and is not guessed at. It is the exact key every
  // referral and every order this firm ever generates will be matched on, so a
  // number that cannot be parsed is refused here rather than stored as
  // something plausible.
  const phone = phone10(input.phone)
  if (!phone) {
    return fail(
      `"${input.phone}" is not a 10-digit Indian mobile number. Every order this firm refers is matched on this number, so it has to be exact.`,
    )
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('partner_application')
    .insert({
      firm_name: input.firm_name.trim(),
      contact_name: input.contact_name.trim(),
      phone,
      email: input.email.trim().toLowerCase(),
      city: input.city?.trim() || null,
      market: input.market || null,
      firm_type: input.firm_type || 'architect',
      gst: input.gst?.trim() || null,
      team_size: input.team_size || null,
      typical_projects: input.typical_projects?.trim() || null,
      met_on: input.met_on || null,
      meeting_notes: input.meeting_notes?.trim() || null,
      source: input.source || 'outreach',
      proposed_kam: input.proposed_kam || null,
      status: 'submitted',
      created_by: staff.data.user_id,
    })
    .select()
    .single()

  if (error) {
    // The partial unique index on phone. Say what it means rather than showing
    // a constraint name: two people working the same firm is the case this
    // catches, and they need to find each other, not retry.
    if (error.code === '23505') {
      return fail(
        `There is already an onboarding form open for ${phone}. Someone else on the team may be working this firm — open Onboarding and search for the number before filing another.`,
      )
    }
    return fail(`Could not file this form: ${error.message}`)
  }

  if (input.prospect_id) {
    await sb
      .from('outreach_prospect')
      .update({ application_id: data.id, stage: 'onboarding' })
      .eq('id', input.prospect_id)
  }

  revalidatePath('/console/applications')
  revalidatePath('/console/prospects')
  return ok(data as PartnerApplication)
}

export async function updateApplication(id: string, values: Row) {
  const staff = await requireStaff()
  if (!staff.ok) return staff
  const sb = await supabaseServer()
  const { data, error } = await sb.from('partner_application').update(values).eq('id', id).select().single()
  if (error) return fail(`Could not update this form: ${error.message}`)
  revalidatePath('/console/applications')
  return ok(data)
}

/**
 * The verification step. An admin reads the form and says yes or no; nothing is
 * created yet and no login exists. Issuing the credentials is a second,
 * deliberate action — see `provisionFromApplication`.
 */
export async function reviewApplication(id: string, status: 'approved' | 'rejected', note?: string | null) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('partner_application')
    .update({
      status,
      review_note: note?.trim() || null,
      reviewed_by: staff.data.user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return fail(`Could not save that decision: ${error.message}`)
  revalidatePath('/console/applications')
  return ok(data)
}

export type IssuedCredentials = {
  email: string
  password: string
  firmName: string
  /** Set when the password was issued but could NOT be retained — see
   *  `rememberCredential`. The modal says so rather than promising the admin
   *  they can come back for it later. */
  notRetained?: string
}

/**
 * What an admin gets back when they ask for somebody's login.
 *
 * Four states, not two, and the difference decides what the console says:
 *
 * - `current`    — we have the password we issued and they have not changed it.
 * - `changed`    — they set their own. We had one and erased it, which is the
 *                  system working as designed.
 * - `none`       — we never kept one. Every login issued before
 *                  `006_credentials.sql`, and any where retention failed.
 * - `unreadable` — a row is there and will not open. A rotated service-role key,
 *                  usually. NOT the same fact as "no password", and never shown
 *                  as one.
 */
export type CredentialLookup =
  | { state: 'current'; email: string; password: string; issuedAt: string; revealCount: number }
  | { state: 'changed'; email: string | null; changedAt: string | null }
  | { state: 'none' }
  | { state: 'unreadable'; email: string | null; reason: string }

type CredentialRow = {
  state: 'current' | 'changed' | 'none'
  sealed: string | null
  email: string | null
  kind: 'staff' | 'partner' | null
  issued_at: string | null
  changed_at: string | null
  revealed_at: string | null
  reveal_count: number | null
}

/**
 * Keep the password we just issued, sealed, until its owner changes it.
 *
 * Best-effort ON PURPOSE, and loudly so. The login already exists and works by
 * the time this runs, so failing the whole provisioning because the retention
 * table is missing would be the worse outcome. A failure comes back as a
 * sentence instead, and every caller puts that sentence in front of the admin —
 * which is also exactly what an unapplied `006_credentials.sql` looks like from
 * the outside. Silence here would leave an admin believing they could come back
 * for a password that was never kept.
 */
async function rememberCredential(input: {
  userId: string
  kind: 'staff' | 'partner'
  email: string
  password: string
  issuedBy: string
}): Promise<string | null> {
  const svc = supabaseService()
  try {
    const { data: fp, error: fpErr } = await svc.rpc('app_pw_fingerprint', { uid: input.userId })
    if (fpErr) throw new Error(fpErr.message)

    const { error } = await svc.from('issued_credential').upsert(
      {
        user_id: input.userId,
        kind: input.kind,
        email: input.email,
        sealed: seal(input.password),
        pw_fingerprint: fp,
        issued_at: new Date().toISOString(),
        issued_by: input.issuedBy,
        changed_at: null,
        revealed_at: null,
        revealed_by: null,
        reveal_count: 0,
      },
      { onConflict: 'user_id' },
    )
    if (error) throw new Error(error.message)
    return null
  } catch (e) {
    return `the password was NOT retained (${e instanceof Error ? e.message : String(e)}), so copy it now — it cannot be looked up again`
  }
}

/**
 * The password we issued somebody, for an admin who has to send it again.
 *
 * Admin only, and the read is audited. `app_read_credential` re-checks the
 * password fingerprint inside Postgres and erases the secret if it has moved
 * on, so what comes back is either genuinely current or honestly labelled — the
 * console can never show a password its owner has already replaced.
 */
export async function readIssuedCredential(userId: string): Promise<Result<CredentialLookup>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const svc = supabaseService()
  const { data, error } = await svc.rpc('app_read_credential', { uid: userId })
  if (error) {
    return fail(
      `Could not look up that login: ${error.message}. If that says the function is missing, 006_credentials.sql has not been run against this project yet — supabase/migrations/README.md.`,
    )
  }
  const row = (Array.isArray(data) ? data[0] : data) as CredentialRow | undefined
  if (!row || row.state === 'none') return ok({ state: 'none' })
  if (row.state === 'changed' || !row.sealed) {
    return ok({ state: 'changed', email: row.email, changedAt: row.changed_at })
  }

  const opened = unseal(row.sealed)
  if (!opened.ok) return ok({ state: 'unreadable', email: row.email, reason: opened.reason })

  const { error: noteErr } = await svc.rpc('app_note_credential_reveal', {
    uid: userId,
    by_user: staff.data.user_id,
  })
  // The count is an audit trail, not a gate: a failure to write it must not
  // withhold a password an admin needs. It is not swallowed either — the number
  // shown simply does not advance, which is the honest reading of it.
  const seen = (row.reveal_count ?? 0) + (noteErr ? 0 : 1)

  return ok({
    state: 'current',
    email: row.email ?? '(unknown address)',
    password: opened.value,
    issuedAt: row.issued_at ?? '',
    revealCount: seen,
  })
}

/**
 * Create the firm and its login, from a form an admin has already verified.
 *
 * Returns the password ONCE. It is never stored, never logged and cannot be
 * looked up again — Supabase keeps a hash. If it is lost, `resetPartnerPassword`
 * issues a new one. That is a deliberate trade: the alternative is a plaintext
 * password sitting in a table in a public repo's database.
 *
 * There is no email sent from here. This deployment has no mail transport of its
 * own, so pretending to send one would leave an admin believing a designer had
 * been written to when nobody had. The admin copies the credentials and sends
 * them the way they already talk to that firm. `docs/onboarding.md` names this
 * as the gap it is.
 *
 * The order of operations matters. The phone is checked against `partner`
 * BEFORE anything is created, and if the partner row or the link fails the auth
 * user is deleted again — a half-provisioned firm is an account somebody can
 * sign in to and find nothing behind.
 */
export async function provisionFromApplication(id: string): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const sb = await supabaseServer()
  const { data: app, error: readErr } = await sb
    .from('partner_application')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return fail(`Could not read the form: ${readErr.message}`)
  if (!app) return fail('That onboarding form no longer exists.')

  const a = app as PartnerApplication
  if (a.status === 'provisioned') {
    return fail('This firm already has a login. Use "Issue a new password" if they cannot get in.')
  }
  if (a.status !== 'approved') {
    return fail('Verify the form first. Credentials are only issued for a form an admin has approved.')
  }

  const phone = phone10(a.phone)
  if (!phone) return fail(`The form holds "${a.phone}", which is not a 10-digit mobile number. Correct it first.`)
  const email = a.email.trim().toLowerCase()

  const svc = supabaseService()

  // Exact phone, never a name. A firm already on this number is either a
  // duplicate application or a second login for a real firm, and which of those
  // it is needs a person.
  const { data: clash, error: clashErr } = await svc
    .from('partner').select('id, firm_name').eq('phone', phone).maybeSingle()
  if (clashErr) return fail(`Could not check for an existing firm: ${clashErr.message}`)
  if (clash) {
    return fail(
      `${clash.firm_name} is already registered on ${phone}. If this is a second login for the same firm, that is a support action rather than a new onboarding.`,
    )
  }

  const password = generatePassword()
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { firm_name: a.firm_name },
  })
  if (authErr || !created?.user) {
    return fail(
      `Could not create the login for ${email}: ${authErr?.message ?? 'no user came back'}. If the address is already registered, it belongs to another account and needs a different one.`,
    )
  }
  const userId = created.user.id

  const { data: partner, error: partnerErr } = await svc
    .from('partner')
    .insert({
      firm_name: a.firm_name,
      contact_name: a.contact_name,
      phone,
      email,
      city: a.city,
      market: a.market,
      gst: a.gst,
      firm_type: a.firm_type,
      onboarding_source: a.source === 'inbound' ? 'inbound' : a.source === 'existing_client' ? 'existing_client' : 'outreach',
      onboarded_by: a.created_by,
      kam_user_id: a.proposed_kam,
      workspace_enabled: false,
    })
    .select()
    .single()

  if (partnerErr || !partner) {
    await svc.auth.admin.deleteUser(userId)
    return fail(`Could not create the firm, so the login was removed again: ${partnerErr?.message ?? 'no row came back'}`)
  }

  const { error: linkErr } = await svc
    .from('partner_user')
    .insert({ user_id: userId, partner_id: partner.id, role: 'principal' })
  if (linkErr) {
    await svc.from('partner').delete().eq('id', partner.id)
    await svc.auth.admin.deleteUser(userId)
    return fail(`Could not attach the login to the firm, so both were removed again: ${linkErr.message}`)
  }

  // From here on a failure is cosmetic — the firm exists and can sign in — so
  // these are reported in the result rather than rolled back.
  const notes: string[] = []
  const notRetained = await rememberCredential({
    userId, kind: 'partner', email, password, issuedBy: staff.data.user_id,
  })
  const { error: actErr } = await svc.from('partner_activity').insert([
    {
      partner_id: partner.id,
      kind: 'onboarded',
      title: 'Welcome to Material Depot for Partners',
      detail: 'Your account was created by the Material Depot team.',
      by_user: staff.data.user_id,
    },
    ...(a.proposed_kam
      ? [{
          partner_id: partner.id,
          kind: 'kam_assigned',
          title: 'You have a Material Depot contact',
          detail: 'Your key account manager is your first port of call for rates, samples and site queries.',
          by_user: staff.data.user_id,
        }]
      : []),
  ])
  if (actErr) notes.push(`the welcome note was not written (${actErr.message})`)

  const { error: appErr } = await svc
    .from('partner_application')
    .update({
      status: 'provisioned',
      partner_id: partner.id,
      credentials_issued_at: new Date().toISOString(),
    })
    .eq('id', a.id)
  if (appErr) {
    // This one is worth saying loudly: the form still reads "approved", so the
    // next admin to look at it will try to provision a firm that already exists.
    return fail(
      `The firm and login were created, but the form could not be marked as done (${appErr.message}). The password is ${password} — copy it now, then fix the form's status before anyone provisions it again.`,
    )
  }

  revalidatePath('/console/applications')
  revalidatePath('/console/partners')

  return ok({
    email,
    password,
    firmName: `${a.firm_name}${notes.length ? ` — note: ${notes.join('; ')}` : ''}`,
    notRetained: notRetained ?? undefined,
  })
}

/**
 * A new one-time password for a firm that cannot get in. Admin only.
 *
 * Reach for this only when the stored one is gone — since `006_credentials.sql`
 * the password we issued can be read back from the firm's page, and issuing a
 * new one INVALIDATES whatever the firm was already sent.
 */
export async function resetPartnerPassword(partnerId: string): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const svc = supabaseService()
  const { data: link, error: linkErr } = await svc
    .from('partner_user')
    .select('user_id, partner:partner_id ( firm_name, email )')
    .eq('partner_id', partnerId)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (linkErr) return fail(`Could not find the login for this firm: ${linkErr.message}`)
  if (!link) return fail('This firm has no login yet — issue credentials from its onboarding form instead.')

  const password = generatePassword()
  const { data: updated, error } = await svc.auth.admin.updateUserById(link.user_id as string, { password })
  if (error) return fail(`Could not set a new password: ${error.message}`)

  const firm = link.partner as unknown as { firm_name: string; email: string | null } | null
  const email = updated?.user?.email ?? firm?.email ?? '(unknown address)'
  const notRetained = await rememberCredential({
    userId: link.user_id as string, kind: 'partner', email, password, issuedBy: staff.data.user_id,
  })

  return ok({
    email,
    password,
    firmName: firm?.firm_name ?? 'this firm',
    notRetained: notRetained ?? undefined,
  })
}

/**
 * A new password for one specific `partner_user` login, addressed by user id
 * rather than by firm.
 *
 * `resetPartnerPassword` above always means the firm's PRINCIPAL login — the
 * oldest `partner_user` row — because that was the only one a firm had until
 * team invites existed. A teammate provisioned through `provisionTeamInvite()`
 * is a second, later row on the same firm, so resetting "by firm" would reset
 * the wrong person's password if what was meant was Meera Iyer's, not the
 * firm's principal. Same generate/seal/retain primitive either way; only the
 * lookup differs.
 */
export async function resetPartnerUserPassword(userId: string): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const svc = supabaseService()
  const { data: link, error: linkErr } = await svc
    .from('partner_user')
    .select('user_id, partner:partner_id ( firm_name )')
    .eq('user_id', userId)
    .maybeSingle()
  if (linkErr) return fail(`Could not find that login: ${linkErr.message}`)
  if (!link) return fail('That login is not attached to any firm.')

  const password = generatePassword()
  const { data: updated, error } = await svc.auth.admin.updateUserById(userId, { password })
  if (error) return fail(`Could not set a new password: ${error.message}`)

  const firm = link.partner as unknown as { firm_name: string } | null
  const email = updated?.user?.email ?? '(unknown address)'
  const notRetained = await rememberCredential({
    userId, kind: 'partner', email, password, issuedBy: staff.data.user_id,
  })

  return ok({
    email,
    password,
    firmName: firm?.firm_name ?? 'this firm',
    notRetained: notRetained ?? undefined,
  })
}

/**
 * The same lookup, addressed by firm rather than by login.
 *
 * A firm's principal login is the oldest `partner_user` row — the one
 * `provisionFromApplication` creates and the one `resetPartnerPassword` resets,
 * so all three agree on which account they mean. A firm with no login at all is
 * `none`, which reads correctly on the panel: nothing to send, issue one.
 */
export async function readPartnerCredential(partnerId: string): Promise<Result<CredentialLookup>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const svc = supabaseService()
  const { data: link, error } = await svc
    .from('partner_user')
    .select('user_id')
    .eq('partner_id', partnerId)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) return fail(`Could not find the login for this firm: ${error.message}`)
  if (!link) return ok({ state: 'none' })

  return readIssuedCredential(link.user_id as string)
}

// ================================================================== staff

/**
 * Add somebody to the Material Depot team.
 *
 * Same shape as provisioning a partner and for the same reason: an auth user
 * cannot be made with an INSERT. The password is shown once and never stored.
 */
export async function createStaffMember(input: {
  name: string
  email: string
  phone?: string | null
  role: StaffRole
  market?: string | null
  photo_url?: string | null
}): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff
  if (!input.name?.trim()) return fail('A name is needed.')
  if (!input.email?.trim()) return fail('An email address is needed — it is their login.')

  const email = input.email.trim().toLowerCase()
  const svc = supabaseService()
  const password = generatePassword()

  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: input.name.trim() },
  })
  if (authErr || !created?.user) {
    return fail(`Could not create the login for ${email}: ${authErr?.message ?? 'no user came back'}`)
  }

  const { error } = await svc.from('staff_user').insert({
    user_id: created.user.id,
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null,
    role: input.role,
    market: input.market || null,
    photo_url: input.photo_url?.trim() || null,
  })
  if (error) {
    await svc.auth.admin.deleteUser(created.user.id)
    return fail(`Could not add them to the team, so the login was removed again: ${error.message}`)
  }

  const notRetained = await rememberCredential({
    userId: created.user.id, kind: 'staff', email, password, issuedBy: staff.data.user_id,
  })

  revalidatePath('/console/staff')
  return ok({ email, password, firmName: input.name.trim(), notRetained: notRetained ?? undefined })
}

/**
 * A new password for somebody on the team who cannot get in.
 *
 * The staff half of `resetPartnerPassword`, and it did not exist until now: the
 * only repair for a KAM who lost their password was to delete them and add them
 * again. Same admin gate, same retention, and the same warning — issuing a new
 * one invalidates the one they may already have.
 *
 * Refused for yourself. Changing your own password from here would work, but
 * Settings asks for the current one first, which is the check that stops a
 * borrowed console session from locking you out of your own account.
 */
export async function resetStaffPassword(userId: string): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff
  if (userId === staff.data.user_id) {
    return fail('Change your own password from Settings — it asks for your current one first.')
  }

  const svc = supabaseService()
  const { data: member, error: readErr } = await svc
    .from('staff_user').select('name, email').eq('user_id', userId).maybeSingle()
  if (readErr) return fail(`Could not find them on the team: ${readErr.message}`)
  if (!member) return fail('That login is not on the B2B team.')

  const password = generatePassword()
  const { data: updated, error } = await svc.auth.admin.updateUserById(userId, { password })
  if (error) return fail(`Could not set a new password: ${error.message}`)

  const email = updated?.user?.email ?? (member.email as string | null) ?? '(unknown address)'
  const notRetained = await rememberCredential({
    userId, kind: 'staff', email, password, issuedBy: staff.data.user_id,
  })

  revalidatePath('/console/staff')
  return ok({
    email,
    password,
    firmName: (member.name as string) ?? 'them',
    notRetained: notRetained ?? undefined,
  })
}

export async function updateStaffMember(userId: string, values: { role?: StaffRole; market?: string | null; active?: boolean; phone?: string | null; name?: string; photo_url?: string | null }) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  if (userId === staff.data.user_id && (values.role !== undefined || values.active === false)) {
    return fail('Change somebody else. Removing your own admin rights would lock the console for everybody.')
  }

  const payload: Row = {}
  for (const [k, v] of Object.entries(values)) if (v !== undefined) payload[k] = v
  if (!Object.keys(payload).length) return fail('Nothing to change.')

  // staff_user has no update policy — writes here are admin-gated above and go
  // through the service role, like every other staff mutation.
  const svc = supabaseService()
  const { data, error } = await svc.from('staff_user').update(payload).eq('user_id', userId).select().single()
  if (error) return fail(`Could not update them: ${error.message}`)
  revalidatePath('/console/staff')
  return ok(data)
}

const TEAM_INVITE_TITLE: Record<'design_team' | 'procurement', string> = {
  design_team: 'Design team',
  procurement: 'Procurement',
}

/**
 * Approve a firm's request for a teammate's login. Same shape as
 * `provisionFromApplication()` — generate a password, create the auth user,
 * seal and retain the password — except this attaches a SECOND `partner_user`
 * row to a firm that already exists, rather than creating a new firm. Schema
 * already allows several `partner_user` rows per firm; nothing here changes
 * that, it is just the first thing that actually creates one.
 */
export async function provisionTeamInvite(id: string): Promise<Result<IssuedCredentials>> {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff

  const svc = supabaseService()
  const { data: invite, error: readErr } = await svc
    .from('partner_team_invite').select('*, partner:partner_id(id, firm_name)').eq('id', id).maybeSingle()
  if (readErr) return fail(`Could not read the request: ${readErr.message}`)
  if (!invite) return fail('That request no longer exists.')
  if (invite.status !== 'requested') return fail(`This request is already ${invite.status}.`)

  const email = String(invite.email).trim().toLowerCase()
  const password = generatePassword()
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: invite.name },
  })
  if (authErr || !created?.user) {
    return fail(`Could not create the login for ${email}: ${authErr?.message ?? 'no user came back'}`)
  }
  const userId = created.user.id

  const { error: linkErr } = await svc.from('partner_user').insert({
    user_id: userId,
    partner_id: invite.partner_id,
    role: 'associate',
    title: TEAM_INVITE_TITLE[invite.role as 'design_team' | 'procurement'],
  })
  if (linkErr) {
    await svc.auth.admin.deleteUser(userId)
    return fail(`Could not attach the login to the firm, so it was removed again: ${linkErr.message}`)
  }

  const notRetained = await rememberCredential({
    userId, kind: 'partner', email, password, issuedBy: staff.data.user_id,
  })

  const { error: updErr } = await svc.from('partner_team_invite').update({
    status: 'approved',
    reviewed_by: staff.data.user_id,
    reviewed_at: new Date().toISOString(),
    provisioned_user_id: userId,
  }).eq('id', id)
  const notes = updErr ? [`the request could not be marked approved (${updErr.message})`] : []

  revalidatePath('/settings')
  revalidatePath(`/console/partners/${invite.partner_id}`)

  return ok({
    email,
    password,
    firmName: `${invite.name}${notes.length ? ` — note: ${notes.join('; ')}` : ''}`,
    notRetained: notRetained ?? undefined,
  })
}

export async function rejectTeamInvite(id: string, note: string) {
  const staff = await requireStaff(['admin'])
  if (!staff.ok) return staff
  if (!note?.trim()) return fail('Say why, so the firm knows what to do next.')

  const svc = supabaseService()
  const { data, error } = await svc
    .from('partner_team_invite')
    .update({ status: 'rejected', reviewed_by: staff.data.user_id, reviewed_at: new Date().toISOString(), review_note: note.trim() })
    .eq('id', id)
    .eq('status', 'requested')
    .select()
    .single()
  if (error) return fail(`Could not decline this request: ${error.message}`)
  revalidatePath('/settings')
  revalidatePath(`/console/partners/${data.partner_id}`)
  return ok(data)
}
