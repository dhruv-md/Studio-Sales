'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { fail, ok, type Result } from './result'
import { phone10 } from '@/lib/format'
import type { CatalogPick } from '@/lib/catalog/types'

/**
 * Every mutation. Two rules hold throughout:
 *
 * 1. **A failed write is returned, never swallowed.** No `.catch(console.error)`,
 *    no result that gets dropped — the caller gets `{ ok: false, error }` and
 *    puts it on screen. A write nobody can see fail is how a feature looks
 *    finished and is not.
 * 2. **RLS does the authorisation**, so nothing here re-checks partner_id. If a
 *    write succeeds against another firm's row, the policy is wrong and should
 *    be fixed there rather than papered over here.
 */

type Row = Record<string, unknown>

async function insert<T>(table: string, values: Row, what: string, revalidate?: string): Promise<Result<T>> {
  const sb = await supabaseServer()
  const { data, error } = await sb.from(table).insert(values).select().single()
  if (error) return fail(`Could not create ${what}: ${error.message}`)
  if (revalidate) revalidatePath(revalidate)
  return ok(data as T)
}

async function update<T>(table: string, id: string, values: Row, what: string, revalidate?: string): Promise<Result<T>> {
  const sb = await supabaseServer()
  const { data, error } = await sb.from(table).update(values).eq('id', id).select().single()
  if (error) return fail(`Could not update ${what}: ${error.message}`)
  if (revalidate) revalidatePath(revalidate)
  return ok(data as T)
}

async function remove(table: string, id: string, what: string, revalidate?: string): Promise<Result<true>> {
  const sb = await supabaseServer()
  const { error } = await sb.from(table).delete().eq('id', id)
  if (error) return fail(`Could not delete ${what}: ${error.message}`)
  if (revalidate) revalidatePath(revalidate)
  return ok(true as const)
}

async function partnerId(): Promise<Result<string>> {
  const sb = await supabaseServer()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) return fail('You are not signed in.')
  const { data, error } = await sb.from('partner_user').select('partner_id').eq('user_id', auth.user.id).maybeSingle()
  if (error) return fail(`Could not read your firm: ${error.message}`)
  if (!data) return fail('Your login is not attached to a firm yet.')
  return ok(data.partner_id as string)
}

// ----------------------------------------------------------------- clients

export async function createClient(input: {
  name: string
  phone?: string | null
  email?: string | null
  city?: string | null
  address?: string | null
  notes?: string | null
}) {
  if (!input.name?.trim()) return fail('A client needs a name.')
  const pid = await partnerId()
  if (!pid.ok) return pid

  // A phone that is present but unusable is rejected rather than stored as
  // null: a silently-dropped number is a referral that can never be matched.
  let phone: string | null = null
  if (input.phone?.trim()) {
    phone = phone10(input.phone)
    if (!phone) return fail(`"${input.phone}" is not a 10-digit Indian mobile number. Leave it blank or correct it.`)
  }

  return insert('client', {
    partner_id: pid.data,
    name: input.name.trim(),
    phone,
    email: input.email?.trim() || null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  }, 'this client', '/workspace/clients')
}

export async function updateClient(id: string, values: Row) {
  if (typeof values.phone === 'string' && values.phone.trim()) {
    const p = phone10(values.phone)
    if (!p) return fail('That is not a 10-digit Indian mobile number.')
    values.phone = p
  }
  return update('client', id, values, 'this client', '/workspace/clients')
}

export async function deleteClient(id: string) {
  return remove('client', id, 'this client', '/workspace/clients')
}

// ---------------------------------------------------------------- projects

export async function createProject(input: {
  client_id: string
  name: string
  project_type?: string
  site_address?: string | null
  city?: string | null
  carpet_area_sqft?: number | null
  budget?: number | null
  design_fee?: number | null
  target_on?: string | null
}) {
  if (!input.name?.trim()) return fail('A project needs a name.')
  if (!input.client_id) return fail('Pick which client this project is for.')
  const pid = await partnerId()
  if (!pid.ok) return pid

  return insert('project', {
    partner_id: pid.data,
    client_id: input.client_id,
    name: input.name.trim(),
    project_type: input.project_type || 'residential',
    site_address: input.site_address?.trim() || null,
    city: input.city?.trim() || null,
    carpet_area_sqft: input.carpet_area_sqft ?? null,
    budget: input.budget ?? null,
    design_fee: input.design_fee ?? null,
    target_on: input.target_on || null,
    started_on: new Date().toISOString().slice(0, 10),
  }, 'this project', '/workspace/projects')
}

export async function updateProject(id: string, values: Row) {
  const r = await update('project', id, values, 'this project', `/workspace/projects/${id}`)
  revalidatePath('/workspace/projects')
  revalidatePath('/dashboard')
  return r
}

export async function deleteProject(id: string) {
  return remove('project', id, 'this project', '/workspace/projects')
}

// ------------------------------------------------------------------- areas

export async function createArea(input: {
  project_id: string
  area_type: string
  name: string
  floor_area_sqft?: number | null
  wall_area_sqft?: number | null
  sort_order?: number
}) {
  if (!input.name?.trim()) return fail('The room needs a name.')
  return insert('project_area', {
    project_id: input.project_id,
    area_type: input.area_type,
    name: input.name.trim(),
    floor_area_sqft: input.floor_area_sqft ?? null,
    wall_area_sqft: input.wall_area_sqft ?? null,
    sort_order: input.sort_order ?? 0,
  }, 'this room', `/workspace/projects/${input.project_id}`)
}

export async function updateArea(id: string, projectId: string, values: Row) {
  return update('project_area', id, values, 'this room', `/workspace/projects/${projectId}`)
}

export async function deleteArea(id: string, projectId: string) {
  return remove('project_area', id, 'this room', `/workspace/projects/${projectId}`)
}

// ------------------------------------------------------------------ boards

export async function createBoard(input: { area_id: string; name: string; palette_scene?: string | null; path: string }) {
  return insert('board', {
    area_id: input.area_id,
    name: input.name?.trim() || 'Option 1',
    palette_scene: input.palette_scene || null,
  }, 'this board', input.path)
}

export async function updateBoard(id: string, path: string, values: Row) {
  // Approving one board is a decision about the ROOM, so the caller also flips
  // the other boards — see setApprovedBoard rather than calling this directly.
  return update('board', id, values, 'this board', path)
}

/**
 * Approve one option for a room and un-approve the rest. Written as one action
 * because "approved" is a property of the room's decision, and two approved
 * boards in one room makes the quote ambiguous about which products to bill.
 */
export async function setApprovedBoard(boardId: string, areaId: string, path: string) {
  const sb = await supabaseServer()
  const { error: clearErr } = await sb
    .from('board')
    .update({ status: 'draft', approved_at: null })
    .eq('area_id', areaId)
    .eq('status', 'approved')
  if (clearErr) return fail(`Could not clear the previous approval: ${clearErr.message}`)

  const { error } = await sb
    .from('board')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', boardId)
  if (error) return fail(`Could not approve this board: ${error.message}`)

  const { error: areaErr } = await sb.from('project_area').update({ status: 'finalised' }).eq('id', areaId)
  if (areaErr) return fail(`Board approved, but the room could not be marked finalised: ${areaErr.message}`)

  revalidatePath(path)
  return ok(true as const)
}

export async function deleteBoard(id: string, path: string) {
  return remove('board', id, 'this board', path)
}

// ------------------------------------------------------------- board items

export async function addProductToBoard(input: {
  board_id: string
  pick: CatalogPick
  surface?: string | null
  qty?: number | null
  wastage_pct?: number
  path: string
}) {
  const p = input.pick
  return insert('board_item', {
    board_id: input.board_id,
    kind: 'product',
    surface: input.surface || null,
    variant_id: p.variant_id,
    sku: p.sku,
    product_name: p.product_name,
    brand: p.brand,
    category: p.category,
    size: p.size,
    finish: p.finish,
    image_url: p.image_url,
    md_url: p.md_url,
    unit: p.unit,
    rate: p.rate,
    mrp: p.mrp,
    gst_pct: p.gst_pct,
    coverage_area: p.coverage_area,
    // Stamped now, so the quote can tell the architect how old its prices are.
    priced_at: new Date().toISOString(),
    qty: input.qty ?? null,
    wastage_pct: input.wastage_pct ?? 0,
  }, 'this product', input.path)
}

export async function addManualItemToBoard(input: {
  board_id: string
  product_name: string
  unit: string
  rate: number
  gst_pct: number
  qty?: number | null
  surface?: string | null
  brand?: string | null
  note?: string | null
  path: string
}) {
  if (!input.product_name?.trim()) return fail('The item needs a name.')
  if (!input.unit?.trim()) return fail('The item needs a unit — that is what the rate is per.')
  return insert('board_item', {
    board_id: input.board_id,
    kind: 'product',
    surface: input.surface || null,
    product_name: input.product_name.trim(),
    brand: input.brand?.trim() || null,
    unit: input.unit.trim(),
    rate: input.rate,
    gst_pct: input.gst_pct,
    qty: input.qty ?? null,
    note: input.note?.trim() || null,
    priced_at: new Date().toISOString(),
  }, 'this item', input.path)
}

export async function updateBoardItem(id: string, path: string, values: Row) {
  return update('board_item', id, values, 'this item', path)
}

export async function deleteBoardItem(id: string, path: string) {
  return remove('board_item', id, 'this item', path)
}

// ------------------------------------------------------------------ quotes

/**
 * Build a quote from every approved board on the project.
 *
 * Lines are copied, not referenced. A quote that reprices itself when someone
 * later edits a board is a quote that cannot be sent to a client, and the
 * snapshot is why `quote_line` carries its own sku / rate / unit columns.
 * Items with no quantity are SKIPPED and reported — a zero-quantity line in a
 * client-facing quote reads as "free".
 */
export async function buildQuoteFromApprovedBoards(projectId: string, markupPct: number) {
  const sb = await supabaseServer()

  const { data: areas, error: areaErr } = await sb
    .from('project_area').select('id, name, area_type').eq('project_id', projectId)
  if (areaErr) return fail(`Could not read the rooms: ${areaErr.message}`)
  if (!areas?.length) return fail('This project has no rooms yet, so there is nothing to quote.')

  const { data: boards, error: boardErr } = await sb
    .from('board').select('id, area_id, name').in('area_id', areas.map((a) => a.id)).eq('status', 'approved')
  if (boardErr) return fail(`Could not read the approved boards: ${boardErr.message}`)
  if (!boards?.length) return fail('No board has been approved yet. Approve one option per room, then build the quote.')

  const { data: items, error: itemErr } = await sb
    .from('board_item').select('*').in('board_id', boards.map((b) => b.id)).eq('kind', 'product')
  if (itemErr) return fail(`Could not read the products on those boards: ${itemErr.message}`)

  const areaById = new Map(areas.map((a) => [a.id, a]))
  const boardById = new Map(boards.map((b) => [b.id, b]))

  const lines: Row[] = []
  const skipped: string[] = []
  for (const it of items ?? []) {
    const board = boardById.get(it.board_id as string)
    const area = board ? areaById.get(board.area_id as string) : undefined
    if (!it.qty || Number(it.qty) <= 0) {
      skipped.push(`${it.product_name ?? 'item'}${area ? ` (${area.name})` : ''} — no quantity set`)
      continue
    }
    if (!it.unit) {
      skipped.push(`${it.product_name ?? 'item'} — no unit on the row, so it cannot be priced`)
      continue
    }
    lines.push({
      board_item_id: it.id,
      area_id: area?.id ?? null,
      area_label: area?.name ?? null,
      description: [it.product_name, it.size, it.surface].filter(Boolean).join(' · '),
      sku: it.sku,
      variant_id: it.variant_id,
      qty: it.qty,
      unit: it.unit,
      rate: it.rate ?? 0,
      gst_pct: it.gst_pct ?? 0,
      sort_order: lines.length,
    })
  }

  if (!lines.length) {
    return fail(
      `Nothing could be quoted. ${skipped.length ? `${skipped.length} item(s) were skipped: ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '…' : ''}` : ''}`,
    )
  }

  const { data: existing } = await sb.from('quote').select('version').eq('project_id', projectId).order('version', { ascending: false }).limit(1)
  const version = (existing?.[0]?.version ?? 0) + 1

  // Older drafts become 'superseded' so there is one live quote per project.
  await sb.from('quote').update({ status: 'superseded' }).eq('project_id', projectId).eq('status', 'draft')

  const { data: quote, error: qErr } = await sb
    .from('quote')
    .insert({ project_id: projectId, version, markup_pct: markupPct, title: `Quote v${version}` })
    .select().single()
  if (qErr) return fail(`Could not create the quote: ${qErr.message}`)

  const { error: lineErr } = await sb.from('quote_line').insert(lines.map((l) => ({ ...l, quote_id: quote.id })))
  if (lineErr) {
    // The quote exists but is empty — say so rather than returning success on a
    // half-built quote the architect would then send.
    return fail(`Quote v${version} was created but its lines failed to save: ${lineErr.message}. Delete it and try again.`)
  }

  revalidatePath(`/workspace/projects/${projectId}`)
  return ok({ quote_id: quote.id as string, version, lines: lines.length, skipped })
}

export async function updateQuote(id: string, projectId: string, values: Row) {
  return update('quote', id, values, 'this quote', `/workspace/projects/${projectId}`)
}

export async function updateQuoteLine(id: string, projectId: string, values: Row) {
  return update('quote_line', id, values, 'this line', `/workspace/projects/${projectId}`)
}

export async function deleteQuoteLine(id: string, projectId: string) {
  return remove('quote_line', id, 'this line', `/workspace/projects/${projectId}`)
}

/**
 * Accepting a quote is the moment a project moves from design to procurement,
 * so it does both: marks the quote accepted and seeds the procurement list from
 * its lines. One action, because a project sitting in 'design' with an accepted
 * quote and an empty procurement list is a state nobody can act on.
 */
export async function acceptQuote(quoteId: string, projectId: string) {
  const sb = await supabaseServer()

  const { data: lines, error: lineErr } = await sb.from('quote_line').select('*').eq('quote_id', quoteId)
  if (lineErr) return fail(`Could not read the quote lines: ${lineErr.message}`)
  if (!lines?.length) return fail('This quote has no lines, so there is nothing to procure.')

  const { error: qErr } = await sb
    .from('quote')
    .update({ status: 'accepted', decided_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (qErr) return fail(`Could not mark the quote accepted: ${qErr.message}`)

  // Only seed rows that are not already there, so accepting twice does not
  // double the procurement list.
  const { data: already } = await sb.from('procurement_item').select('quote_line_id').eq('project_id', projectId)
  const have = new Set((already ?? []).map((r) => r.quote_line_id))
  const fresh = lines.filter((l) => !have.has(l.id))

  if (fresh.length) {
    const { error } = await sb.from('procurement_item').insert(
      fresh.map((l) => ({
        project_id: projectId,
        quote_line_id: l.id,
        area_id: l.area_id,
        area_label: l.area_label,
        description: l.description,
        sku: l.sku,
        variant_id: l.variant_id,
        unit: l.unit,
        qty_required: l.qty,
        rate: l.rate,
      })),
    )
    if (error) return fail(`Quote accepted, but the procurement list could not be seeded: ${error.message}`)
  }

  const { error: pErr } = await sb.from('project').update({ stage: 'procurement' }).eq('id', projectId)
  if (pErr) return fail(`Quote accepted and list seeded, but the project stage did not move: ${pErr.message}`)

  revalidatePath(`/workspace/projects/${projectId}`)
  revalidatePath('/workspace/projects')
  return ok({ seeded: fresh.length, alreadyThere: lines.length - fresh.length })
}

// ------------------------------------------------------------- procurement

export async function updateProcurementItem(id: string, projectId: string, values: Row) {
  return update('procurement_item', id, values, 'this line', `/workspace/projects/${projectId}`)
}

export async function addProcurementItem(input: {
  project_id: string
  description: string
  unit: string
  qty_required: number
  rate: number
  area_label?: string | null
}) {
  if (!input.description?.trim()) return fail('The line needs a description.')
  if (!input.unit?.trim()) return fail('The line needs a unit.')
  return insert('procurement_item', {
    project_id: input.project_id,
    description: input.description.trim(),
    unit: input.unit.trim(),
    qty_required: input.qty_required,
    rate: input.rate,
    area_label: input.area_label || null,
  }, 'this line', `/workspace/projects/${input.project_id}`)
}

export async function deleteProcurementItem(id: string, projectId: string) {
  return remove('procurement_item', id, 'this line', `/workspace/projects/${projectId}`)
}

// ----------------------------------------------------------------- finance

export async function addFinanceEntry(input: {
  project_id: string
  direction: 'cost' | 'income'
  category: string
  description: string
  amount: number
  entry_date: string
  settled?: boolean
  counterparty?: string | null
  reference?: string | null
}) {
  if (!input.description?.trim()) return fail('The entry needs a description.')
  if (!Number.isFinite(input.amount) || input.amount === 0) return fail('The entry needs an amount.')
  return insert('finance_entry', {
    project_id: input.project_id,
    direction: input.direction,
    category: input.category,
    description: input.description.trim(),
    amount: Math.abs(input.amount),
    entry_date: input.entry_date,
    settled: input.settled ?? false,
    counterparty: input.counterparty?.trim() || null,
    reference: input.reference?.trim() || null,
  }, 'this entry', `/workspace/projects/${input.project_id}`)
}

export async function updateFinanceEntry(id: string, projectId: string, values: Row) {
  return update('finance_entry', id, values, 'this entry', `/workspace/projects/${projectId}`)
}

export async function deleteFinanceEntry(id: string, projectId: string) {
  return remove('finance_entry', id, 'this entry', `/workspace/projects/${projectId}`)
}

// --------------------------------------------------------------- referrals

/**
 * PRD §9.2 — refer a client.
 *
 * The form carries more than a name and a number now, and two of the additions
 * are not cosmetic:
 *
 * **Consent.** §14.5 makes the partner's tick a REQUIRED field, because without
 * it Material Depot has no lawful basis to show that client's store visits and
 * cart to a third party at all. It is stored as `consent_claimed_at` — the
 * partner saying the client agreed — and NOT as `consent_given`, which only
 * Material Depot can set after confirming it with the client directly. A firm
 * that could set the second one could unlock another person's purchase history
 * by ticking a box about them.
 *
 * **The duplicate pre-check runs before this** (`checkReferralPhone`), not here.
 * §9.2: "never let a partner submit blind and get rejected later." This function
 * is still the backstop, because a pre-check is advisory and the unique index is
 * not.
 */
export async function createReferral(input: {
  client_name: string
  md_phone: string
  client_id?: string | null
  project_id?: string | null
  notes?: string | null
  email?: string | null
  city?: string | null
  locality?: string | null
  project_type?: 'residential' | 'commercial' | 'other' | null
  budget_band?: string | null
  timeline?: string | null
  categories?: string[]
  consent?: boolean
}) {
  const pid = await partnerId()
  if (!pid.ok) return pid
  if (!input.client_name?.trim()) return fail('The referral needs the client’s name.')

  const phone = phone10(input.md_phone)
  if (!phone) {
    return fail(
      'A referral needs the client’s exact 10-digit mobile number — that is the only thing that links their store visits and orders back to you.',
    )
  }
  // Hard-gated, not soft-gated. Everywhere else in Material Depot's apps a
  // "mandatory" field is soft-gated and logged, because a blocked field stops
  // real work in a store. This one is different: it is the lawful basis under
  // the DPDP Act for showing one person's shopping to somebody else, and §14.5
  // names it as a launch blocker for the journey view.
  if (input.consent !== true) {
    return fail(
      'We need you to confirm the client is happy for Material Depot to contact them and to share what they do with us. Without that we cannot show you their visits or their cart.',
    )
  }

  const values: Row = {
    partner_id: pid.data,
    client_id: input.client_id || null,
    project_id: input.project_id || null,
    client_name: input.client_name.trim(),
    md_phone: phone,
    notes: input.notes?.trim() || null,
    consent_claimed_at: new Date().toISOString(),
  }
  const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)
  for (const k of ['email', 'city', 'locality', 'budget_band', 'timeline'] as const) {
    const v = text(input[k])
    if (v !== undefined) values[k] = v
  }
  if (input.project_type) values.project_type = input.project_type
  if (input.categories?.length) values.categories = input.categories

  const r = await insert('referral', values, 'this referral', '/referrals')

  if (!r.ok && /duplicate key|unique/i.test(r.error)) {
    return fail(`You have already referred ${phone}. Open that referral to see where it has got to.`)
  }
  if (!r.ok && /consent_claimed_at|column .* does not exist/i.test(r.error)) {
    // 005_studio.sql has not been pasted into this project yet. Say which file,
    // rather than showing the raw Postgres message — the fix is a paste, and
    // the person reading this is the person who can do it.
    return fail(
      'This Material Depot workspace has not had supabase/migrations/005_studio.sql applied yet, so the referral form cannot save the consent record. Tell your key account manager; nothing you typed has been lost.',
    )
  }
  return r
}

/**
 * §9.2's real-time duplicate check, run as the partner types the number.
 *
 * "If the number is already attributed elsewhere or belongs to an existing
 * customer, show an inline warning BEFORE submission — never let a partner
 * submit blind and get rejected later."
 *
 * Four outcomes, and the fourth is the one that makes this honest:
 *
 * - `free`      — nobody has referred this number.
 * - `yours`     — you already have. Opens your existing referral.
 * - `taken`     — another firm holds it. §6.3's first-approved-claim-wins.
 * - `unknown`   — the check itself failed. Says so, and lets the partner submit
 *                 anyway, because a check that silently reports "free" when it
 *                 could not run is worse than no check: it is a promise.
 *
 * What it deliberately does NOT do is tell the partner WHO holds the number.
 * That is another firm's client list.
 */
export type PhoneCheck =
  | { state: 'free' }
  | { state: 'yours'; referralId: string; clientName: string }
  | { state: 'taken' }
  | { state: 'invalid' }
  | { state: 'unknown'; why: string }

export async function checkReferralPhone(raw: string): Promise<PhoneCheck> {
  const phone = phone10(raw)
  if (!phone) return { state: 'invalid' }

  const pid = await partnerId()
  if (!pid.ok) return { state: 'unknown', why: pid.error }

  const sb = await supabaseServer()
  // RLS scopes this to the caller's own firm, so a hit here is always "yours".
  const mine = await sb.from('referral').select('id, client_name').eq('md_phone', phone).maybeSingle()
  if (mine.error) return { state: 'unknown', why: mine.error.message }
  if (mine.data) return { state: 'yours', referralId: mine.data.id, clientName: mine.data.client_name }

  // Whether ANOTHER firm holds it cannot be read through RLS — by design, that
  // is another firm's data. `referral_phone_taken()` (005_studio.sql) answers
  // yes/no and nothing about who. If 005 has not been pasted into this project
  // the RPC 404s and this reports `unknown`, so the form says the check could
  // not run rather than reporting `free`. A check that answers "clear" when it
  // did not run is worse than no check, because it is a promise.
  const other = await sb.rpc('referral_phone_taken', { p_phone: phone })
  if (other.error) return { state: 'unknown', why: other.error.message }
  return other.data === true ? { state: 'taken' } : { state: 'free' }
}

/**
 * §14.5 — revealing a masked phone number, and logging that it happened.
 *
 * The log is the reason the mask is a control rather than decoration. It
 * returns the number only after the write succeeds: a reveal that is shown but
 * not recorded is exactly the reveal somebody would want.
 */
export async function revealPhone(referralId: string, surface: string): Promise<Result<string>> {
  const pid = await partnerId()
  if (!pid.ok) return pid

  const sb = await supabaseServer()
  const { data, error } = await sb.from('referral').select('md_phone').eq('id', referralId).maybeSingle()
  if (error) return fail(`Could not read that client: ${error.message}`)
  if (!data) return fail('That client is not on your list.')

  const logged = await sb.from('phone_reveal').insert({
    partner_id: pid.data,
    referral_id: referralId,
    surface,
  })
  if (logged.error) return fail(`Could not record the reveal, so the number is not shown: ${logged.error.message}`)
  return ok(data.md_phone as string)
}

// ------------------------------------------------------------- escalations

/**
 * PRD §9.4. Raised against a client or one of their orders, routed to the KAM,
 * auto-escalated to Admin if unacknowledged in 24h.
 *
 * An open one HOLDS that order's maturation (§10.5), which is why the form says
 * so: a partner who raises a ticket about a delivery and then finds their
 * cashback delayed, with no warning, reads it as a punishment.
 */
export async function raiseEscalation(input: {
  category: 'delivery_delay' | 'quality_damage' | 'wrong_item' | 'billing_gst' | 'other'
  subject: string
  description: string
  referral_id?: string | null
  order_id?: string | null
}) {
  const pid = await partnerId()
  if (!pid.ok) return pid
  if (!input.subject?.trim()) return fail('Give the escalation a one-line subject.')
  if (!input.description?.trim()) return fail('Tell us what happened — the detail is what the store team acts on.')

  const r = await insert('escalation', {
    partner_id: pid.data,
    category: input.category,
    subject: input.subject.trim(),
    description: input.description.trim(),
    referral_id: input.referral_id || null,
    order_id: input.order_id || null,
  }, 'this escalation', '/referrals')
  if (r.ok) revalidatePath('/dashboard')
  return r
}

export async function commentOnEscalation(escalationId: string, body: string) {
  if (!body?.trim()) return fail('Nothing to send.')
  // `internal: false` and `author_side: 'partner'` are BOTH in the policy's
  // WITH CHECK, so this cannot become an internal note even if a caller lies.
  return insert('escalation_comment', {
    escalation_id: escalationId,
    body: body.trim(),
    internal: false,
    author_side: 'partner',
  }, 'your reply', '/referrals')
}

/** §9.4: "On resolution, partner can accept or reopen once." */
export async function reopenEscalation(id: string, why: string) {
  if (!why?.trim()) return fail('Tell us why it is not resolved — that is what reopens it.')
  const sb = await supabaseServer()
  const { error } = await sb.rpc('reopen_escalation', { p_id: id, p_why: why.trim() })
  if (error) return fail(`Could not reopen that escalation: ${error.message}`)
  revalidatePath('/referrals')
  return ok(true as const)
}

/** §13.4. Upsert, because a firm that has never opened Settings has no row and
 *  a missing row reads as "everything on". */
export async function saveNotificationPrefs(prefs: Record<string, { in_app?: boolean; email?: boolean; whatsapp?: boolean }>) {
  const pid = await partnerId()
  if (!pid.ok) return pid
  const sb = await supabaseServer()
  const { error } = await sb
    .from('notification_pref')
    .upsert({ partner_id: pid.data, prefs, updated_at: new Date().toISOString() }, { onConflict: 'partner_id' })
  if (error) return fail(`Could not save your notification settings: ${error.message}`)
  revalidatePath('/settings')
  return ok(true as const)
}

export async function deleteReferral(id: string) {
  return remove('referral', id, 'this referral', '/referrals')
}

// --------------------------------------------------------------- portfolio

/**
 * The work a partner wants on materialdepot.com.
 *
 * A firm owns its own portfolio right up to the point it asks to be published,
 * and not past it: the RLS policies in `004_roles_rls.sql` let a firm move an
 * item draft → submitted and rework a rejected one, and refuse a firm the
 * `published` status entirely. Nothing here re-checks that — if a write of the
 * wrong status succeeds, the policy is wrong and gets fixed there.
 */
export async function createPortfolioItem(input: {
  title: string
  summary?: string | null
  project_type?: string | null
  city?: string | null
  completed_on?: string | null
  area_sqft?: number | null
  cover_url?: string | null
  credits?: string | null
}) {
  if (!input.title?.trim()) return fail('Give the project a name — that is what appears on the site.')
  const pid = await partnerId()
  if (!pid.ok) return pid

  return insert(
    'portfolio_item',
    {
      partner_id: pid.data,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      project_type: input.project_type?.trim() || null,
      city: input.city?.trim() || null,
      completed_on: input.completed_on || null,
      area_sqft: input.area_sqft ?? null,
      cover_url: input.cover_url?.trim() || null,
      credits: input.credits?.trim() || null,
      status: 'draft',
    },
    'this portfolio piece',
    '/portfolio',
  )
}

export async function updatePortfolioItem(id: string, values: Row) {
  return update('portfolio_item', id, values, 'this portfolio piece', '/portfolio')
}

/**
 * Hand a piece to Material Depot to look at.
 *
 * Reports the row-level-security refusal rather than swallowing it: a partner
 * who clicks Submit on a published piece needs to be told it is already live,
 * not left looking at a button that does nothing.
 */
export async function submitPortfolioItem(id: string) {
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('portfolio_item')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  if (error) return fail(`Could not send this for review: ${error.message}`)
  if (!data?.length) {
    return fail(
      'This piece cannot be sent for review — a published piece is locked, and a piece already waiting on us cannot be sent twice.',
    )
  }
  revalidatePath('/portfolio')
  return ok(data[0])
}

export async function deletePortfolioItem(id: string) {
  return remove('portfolio_item', id, 'this portfolio piece', '/portfolio')
}

/**
 * The firm's own studio profile — the part of `partner` a firm is allowed to
 * write. Every other column on that table is frozen by the trigger in
 * `004_roles_rls.sql`, so this deliberately names the writable fields one by one
 * rather than spreading a payload: a stray key would come back as a permission
 * error the user cannot act on.
 */
export async function updateStudioProfile(input: {
  firm_name?: string
  contact_name?: string
  email?: string | null
  city?: string | null
  gst?: string | null
  bio?: string | null
  website?: string | null
  instagram?: string | null
  logo_url?: string | null
  // 005_studio.sql — PRD §13.1's remaining profile fields and §13.3's theme.
  legal_name?: string | null
  pan?: string | null
  registered_address?: string | null
  office_address?: string | null
  pincode?: string | null
  operating_area?: string | null
  linkedin?: string | null
  team_size?: string | null
  budget_range?: string | null
  established_year?: number | null
  theme_preset?: string
  theme_primary?: string | null
  theme_accent?: string | null
  theme_base?: 'light' | 'dark'
  market_signal_opt_in?: boolean
}) {
  const pid = await partnerId()
  if (!pid.ok) return pid

  const values: Row = {}
  const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)
  if (input.firm_name !== undefined) {
    if (!input.firm_name.trim()) return fail('A studio needs a name.')
    values.firm_name = input.firm_name.trim()
  }
  if (input.contact_name !== undefined) {
    if (!input.contact_name.trim()) return fail('Your own name cannot be blank.')
    values.contact_name = input.contact_name.trim()
  }
  for (const k of [
    'email', 'city', 'gst', 'bio', 'website', 'instagram', 'logo_url',
    'legal_name', 'pan', 'registered_address', 'office_address', 'operating_area',
    'linkedin', 'team_size', 'budget_range', 'theme_primary', 'theme_accent',
  ] as const) {
    const v = text(input[k])
    if (v !== undefined) values[k] = v
  }
  // §2.5 wants pincode captured NOW so that pincode-based KAM assignment in
  // Phase 2 is a configuration change rather than a rebuild. A wrong one is
  // worse than none: it would route the firm to the wrong KAM silently.
  if (input.pincode !== undefined) {
    const p = input.pincode?.trim() || null
    if (p && !/^[1-9][0-9]{5}$/.test(p)) return fail('That is not a six-digit Indian pincode.')
    values.pincode = p
  }
  if (input.established_year !== undefined) values.established_year = input.established_year || null
  if (input.theme_preset !== undefined) values.theme_preset = input.theme_preset
  if (input.theme_base !== undefined) values.theme_base = input.theme_base
  if (input.market_signal_opt_in !== undefined) values.market_signal_opt_in = input.market_signal_opt_in
  if (!Object.keys(values).length) return fail('Nothing to save.')

  const r = await update<unknown>('partner', pid.data, values, 'your studio profile', '/portfolio')
  if (r.ok) {
    revalidatePath('/dashboard')
    revalidatePath('/settings')
  }
  return r
}
