'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { Partner } from '@/lib/domain/types'
import { Button, Card, CardHead, Field, Input, Problem, Select, Textarea } from '@/components/ui'
import { Uploader } from '@/components/shell/Uploader'
import { updateStudioProfile } from '@/lib/data/actions'
import { EV, friction, track } from '@/lib/analytics/track'

/**
 * §13.1 — company profile.
 *
 * Two fields here are not cosmetic:
 *
 * **Pincode.** §2.5 requires it captured in Phase 1 so that pincode-based KAM
 * assignment in Phase 2 is "a configuration change, not a rebuild". Without a
 * key, automatic assignment later has nothing to work on. It is validated
 * rather than free text, because a wrong pincode routes a firm to the wrong KAM
 * silently — the worst kind of wrong.
 *
 * **GSTIN.** §13.1: "adding or removing a GSTIN requires Admin confirmation
 * because it affects order roll-up and slab computation." Orders on a linked
 * GSTIN roll up to the parent for reward computation, so a firm quietly adding
 * one would be adding to its own reward base. The field says so and the change
 * goes to an admin.
 */
const TEAM_SIZES = ['Just me', '2–5', '6–15', '16–40', '40+']
const BUDGET_RANGES = ['Under ₹10 L', '₹10 – 25 L', '₹25 – 50 L', '₹50 L – 1 Cr', 'Over ₹1 Cr']

export function ProfileForm({ partner }: { partner: Partner }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [logoUrl, setLogoUrl] = useState(partner.logo_url ?? '')
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setError(null)
    setSaved(false)
    start(async () => {
      const yearRaw = String(form.get('established_year') ?? '').trim()
      const res = await updateStudioProfile({
        firm_name: String(form.get('firm_name') ?? ''),
        legal_name: String(form.get('legal_name') ?? ''),
        contact_name: String(form.get('contact_name') ?? ''),
        email: String(form.get('email') ?? ''),
        city: String(form.get('city') ?? ''),
        pincode: String(form.get('pincode') ?? ''),
        registered_address: String(form.get('registered_address') ?? ''),
        office_address: String(form.get('office_address') ?? ''),
        pan: String(form.get('pan') ?? ''),
        website: String(form.get('website') ?? ''),
        instagram: String(form.get('instagram') ?? ''),
        linkedin: String(form.get('linkedin') ?? ''),
        logo_url: logoUrl,
        team_size: String(form.get('team_size') ?? ''),
        budget_range: String(form.get('budget_range') ?? ''),
        established_year: yearRaw ? Number(yearRaw) : null,
        bio: String(form.get('bio') ?? ''),
      })
      if (!res.ok) {
        friction.error('profile_save_failed', 'settings')
        return setError(res.error)
      }
      track(EV.profile_edited)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHead
        title="Your studio"
        hint="This is what appears beside your work on materialdepot.com, and what your key account manager sees."
      />
      <form action={submit} className="space-y-4 px-4 py-4">
        {error ? <Problem title="Could not save" detail={error} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Studio name" required>
            <Input name="firm_name" defaultValue={partner.firm_name} />
          </Field>
          <Field label="Registered legal name" hint="If it differs from the trading name.">
            <Input name="legal_name" defaultValue={partner.legal_name ?? ''} />
          </Field>
          <Field label="Your name" required>
            <Input name="contact_name" defaultValue={partner.contact_name} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={partner.email ?? ''} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City"><Input name="city" defaultValue={partner.city ?? ''} /></Field>
          {/* §2.5: captured now so automatic KAM assignment later is config. */}
          <Field
            label="Pincode"
            hint="Six digits. It is how we will match you to the right key account manager."
          >
            <Input name="pincode" inputMode="numeric" defaultValue={partner.pincode ?? ''} placeholder="560001" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registered address">
            <Textarea name="registered_address" rows={2} defaultValue={partner.registered_address ?? ''} />
          </Field>
          <Field label="Office address" hint="If samples should go somewhere else.">
            <Textarea name="office_address" rows={2} defaultValue={partner.office_address ?? ''} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* §13.1 — a GSTIN change moves the reward base, so it is read-only
              here and goes through an admin. Hiding the field entirely would
              just mean nobody knows what we have on file. */}
          <Field
            label="GSTIN"
            hint="Orders billed to this GST roll up into your rewards, so changing it goes through Material Depot. Ask your key account manager."
          >
            <Input defaultValue={partner.gst ?? ''} disabled readOnly />
          </Field>
          <Field label="PAN"><Input name="pan" defaultValue={partner.pan ?? ''} /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Team size">
            <Select name="team_size" defaultValue={partner.team_size ?? ''}>
              <option value="">Not saying</option>
              {TEAM_SIZES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Typical project budget">
            <Select name="budget_range" defaultValue={partner.budget_range ?? ''}>
              <option value="">Not saying</option>
              {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label="Founded">
            <Input name="established_year" inputMode="numeric" defaultValue={partner.established_year ?? ''} placeholder="2014" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Website"><Input name="website" defaultValue={partner.website ?? ''} placeholder="https://" /></Field>
          <Field label="Instagram"><Input name="instagram" defaultValue={partner.instagram ?? ''} placeholder="@studio" /></Field>
          <Field label="LinkedIn"><Input name="linkedin" defaultValue={partner.linkedin ?? ''} /></Field>
          <Field label="Logo" hint="Shows in your sidebar here, and beside your work on materialdepot.com.">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-10 rounded-md border border-line object-contain bg-surface" />
              ) : null}
              <Uploader accept="image/*" label={logoUrl ? 'Change logo' : 'Upload logo'} onUploaded={setLogoUrl} onError={setError} />
            </div>
          </Field>
        </div>

        <Field label="About the practice" hint="A few lines. This runs under your name on the public site.">
          <Textarea name="bio" rows={4} defaultValue={partner.bio ?? ''} maxLength={500} />
        </Field>

        <div className="flex items-center justify-end gap-3">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-good">
              <Check size={13} /> Saved
            </span>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
