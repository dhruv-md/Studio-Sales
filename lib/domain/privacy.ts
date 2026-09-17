/**
 * End-client privacy — PRD §14.5, under India's DPDP Act.
 *
 * A partner sees an end customer's store visits, cart contents and order
 * values. That is legitimate and it is also somebody else's personal data, so
 * two rules apply and both live here:
 *
 * 1. **Phone masking.** `98XXXXXX21` by default, with a reveal action that is
 *    LOGGED. The mask keeps the first two and last two digits, which is enough
 *    for an architect to recognise a client they already know and not enough to
 *    ring a client they do not.
 *
 * 2. **Never in an export.** Full numbers do not appear in a CSV for the Design
 *    Team or Procurement roles at all.
 *
 * There used to be a third rule here — no confirmed consent, no itemised
 * view — gating the client detail page down to aggregate facts. Removed on
 * instruction: every order on this platform already carries the client's
 * consent to be shared with the referring firm, so a per-client "we have not
 * asked yet" gate had nothing left to protect and just read as friction.
 * `consent_given` / `consent_claimed_at` stay on `referral` as historical
 * columns; nothing in the app reads them any more.
 */

import { phone10 } from '../format.ts'

/** `9876543210` → `98XXXXXX10`. Anything that is not a ten-digit mobile is
 *  masked whole rather than partly — a malformed number could be anything. */
export function maskPhone(raw: string | null | undefined): string {
  const p = phone10(raw)
  if (!p) return raw ? '•••••' : '—'
  return `${p.slice(0, 2)}XXXXXX${p.slice(8)}`
}
