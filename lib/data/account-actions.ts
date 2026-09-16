'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { supabaseServer, supabaseService } from '@/lib/supabase/server'
import { currentActor } from './session'
import { fail, ok, type Result } from './result'
import { phone10 } from '@/lib/format'

/**
 * The things a signed-in person may change about their OWN account — partner or
 * Material Depot staff, one file for both.
 *
 * It exists because of a gap the console had from the start: every issued
 * password came with "please change it after your first sign-in" and there was
 * nowhere in the app to do that. A password that cannot be changed is a password
 * that stays exactly as it was typed into a WhatsApp message — and since
 * `006_credentials.sql` retains that password until it is changed, the change
 * screen is also what makes retention bounded rather than permanent.
 *
 * Role, market and active are NOT here. They decide what somebody can see, so
 * they belong to an admin — `updateStaffMember` in `console-actions.ts`.
 */

const MIN_LENGTH = 10

/**
 * Change your own password.
 *
 * The current one is checked first, against a throwaway client that does not
 * touch the session cookie. That check is not ceremony: an unlocked console on a
 * shared store laptop is the ordinary case here, and without it anybody walking
 * past could lock the account's owner out of it.
 *
 * On success Supabase writes `auth.users.encrypted_password`, and the trigger
 * from `006_credentials.sql` erases the copy the console was holding — which is
 * what "kept until the user changes it" means in practice. That erasure happens
 * inside the database, so it also covers a password changed through a Supabase
 * reset email, where this code never runs.
 */
export async function changeMyPassword(input: {
  current: string
  next: string
  confirm: string
}): Promise<Result<{ changed: true }>> {
  const actor = await currentActor()
  if (!actor.ok) return actor
  if (!actor.data) return fail('You are not signed in.')

  const email = actor.data.email
  if (!email) {
    return fail(
      'This login has no email address on it, so there is nothing to check the current password against. Ask an admin to issue a new one.',
    )
  }

  const current = input.current ?? ''
  const next = input.next ?? ''
  if (!current) return fail('Type your current password first.')
  if (next.length < MIN_LENGTH) return fail(`A new password needs at least ${MIN_LENGTH} characters.`)
  if (next !== input.confirm) return fail('The two new passwords do not match.')
  if (next === current) return fail('That is the password you already have.')

  // A separate client with no cookie storage. `signInWithPassword` on the
  // request-scoped one would rotate the session cookie mid-action as a side
  // effect of a check.
  const probe = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: wrong } = await probe.auth.signInWithPassword({ email, password: current })
  if (wrong) return fail('That is not your current password.')

  const sb = await supabaseServer()
  const { error } = await sb.auth.updateUser({ password: next })
  if (error) return fail(`Your password was not changed: ${error.message}`)

  return ok({ changed: true })
}

/**
 * Your own name and mobile, for somebody on the Material Depot team.
 *
 * `staff_user` has no update policy for anybody — every write to it goes through
 * the service role after a check in app code, exactly as `updateStaffMember`
 * does. The check here is "this row is yours", and the columns that decide
 * visibility are not in the payload at all, so this cannot widen anybody's
 * access even if the caller forges the form.
 *
 * The mobile matters beyond vanity: it is what a partner sees on their KAM card.
 */
export async function updateMyStaffProfile(input: {
  name: string
  phone?: string | null
}): Promise<Result<{ name: string; phone: string | null }>> {
  const actor = await currentActor()
  if (!actor.ok) return actor
  if (!actor.data) return fail('You are not signed in.')
  if (actor.data.kind !== 'staff') return fail('This is a Material Depot console action.')

  const name = (input.name ?? '').trim()
  if (!name) return fail('A name is needed — it is what partners see on their KAM card.')

  const raw = (input.phone ?? '').trim()
  let phone: string | null = null
  if (raw) {
    phone = phone10(raw)
    if (!phone) return fail(`"${raw}" is not a 10-digit Indian mobile number.`)
  }

  const svc = supabaseService()
  const { error } = await svc
    .from('staff_user')
    .update({ name, phone })
    .eq('user_id', actor.data.userId)
  if (error) return fail(`Your details were not saved: ${error.message}`)

  revalidatePath('/console/settings')
  revalidatePath('/console/staff')
  return ok({ name, phone })
}
