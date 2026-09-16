'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { Button, Field, Input, Problem, Select, Textarea } from '@/components/ui'
import { checkReferralPhone, createReferral, type PhoneCheck } from '@/lib/data/actions'
import { EV, friction, track } from '@/lib/analytics/track'
import { phone10 } from '@/lib/format'
import { INTEREST_CATEGORIES } from '@/lib/domain/categories'

/**
 * Refer a client — always a brand-new one. Picking from an existing client
 * list used to live here, pulled from the opt-in workspace's own clients,
 * which is a different concept from a referred client and just confused the
 * two. Scheduling a further visit for someone already referred is
 * `ScheduleVisitForm`, on that client's own page — it does not re-ask any of
 * this.
 *
 * **The duplicate check still runs before submit.** "On phone entry, run a
 * real-time duplicate check… show an inline warning before submission — never
 * let a partner submit blind and get rejected later." A rejection two days
 * later, for a client the partner has already told they are sorted, is how
 * attribution disputes actually happen.
 *
 * **The check has an `unknown` state and it is shown.** If the lookup itself
 * fails, this says the check could not run and lets the partner submit
 * anyway. A check that silently reports "clear" when it did not run is worse
 * than no check, because it is a promise.
 */
export function ReferClientForm({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [check, setCheck] = useState<PhoneCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [projectType, setProjectType] = useState<'residential' | 'commercial' | 'other'>('residential')
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [touched, setTouched] = useState<string | null>(null)

  function runCheck(raw: string) {
    const ten = phone10(raw)
    if (!ten) {
      setCheck(raw.replace(/\D/g, '').length >= 10 ? { state: 'invalid' } : null)
      return
    }
    setChecking(true)
    // Not debounced on a timer — fired when the field has ten valid digits,
    // which happens once. A keystroke debounce would fire this three or four
    // times per number for no extra information.
    checkReferralPhone(ten)
      .then(setCheck)
      .finally(() => setChecking(false))
  }

  function submit(form: FormData) {
    setError(null)
    start(async () => {
      const res = await createReferral({
        client_name: String(form.get('client_name') ?? ''),
        md_phone: phone,
        city: String(form.get('city') ?? ''),
        email: String(form.get('email') ?? ''),
        project_type: projectType,
        project_type_other: projectType === 'other' ? String(form.get('project_type_other') ?? '') : null,
        categories,
        requirements: String(form.get('requirements') ?? ''),
        notes: String(form.get('notes') ?? ''),
        ec_name: String(form.get('ec_name') ?? ''),
        scheduled_on: String(form.get('scheduled_on') ?? ''),
        scheduled_time: String(form.get('scheduled_time') ?? ''),
      })
      if (!res.ok) {
        friction.error('referral_create_failed', 'refer_client')
        return setError(res.error)
      }
      track(EV.referral_submitted, {
        has_email: Boolean(form.get('email')),
        category_count: categories.length,
        duplicate_check: check?.state ?? 'not_run',
      })
      onDone()
      router.refresh()
    })
  }

  return (
    <form
      action={submit}
      onFocus={(e) => {
        const name = (e.target as HTMLElement).getAttribute('name')
        if (name) setTouched(name)
        if (!touched) track(EV.referral_started)
      }}
      className="space-y-3"
    >
      {error ? <Problem title="Could not save" detail={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client name" required>
          <Input name="client_name" autoComplete="off" required />
        </Field>
        <Field
          label="Their mobile number"
          required
          hint="10 digits, exactly as they will give it in store. It is the only thing that links their orders back to you."
        >
          <Input
            name="md_phone"
            inputMode="numeric"
            placeholder="9876543210"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setCheck(null)
            }}
            onBlur={(e) => runCheck(e.target.value)}
            required
          />
        </Field>
      </div>

      <PhoneCheckNote check={check} checking={checking} />

      <Field label="City">
        <Input name="city" autoComplete="off" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="EC expected to visit" hint="Who from your side is bringing them in.">
          <Input name="ec_name" autoComplete="off" />
        </Field>
        <Field label="Date" required>
          <Input name="scheduled_on" type="date" required />
        </Field>
        <Field label="Time" required>
          <Input name="scheduled_time" type="time" required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project type">
          <Select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as typeof projectType)}
          >
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="other">Something else</option>
          </Select>
        </Field>
        {projectType === 'other' ? (
          <Field label="Describe it">
            <Input name="project_type_other" autoComplete="off" />
          </Field>
        ) : null}
      </div>

      <Field label="Categories interested in" hint="Tick anything that applies. It tells the store team what to have ready.">
        <div className="flex flex-wrap gap-1.5">
          {INTEREST_CATEGORIES.map((c) => {
            const on = categories.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategories((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                ].join(' ')}
              >
                {c}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Description of requirements" hint="Their expectations, budget, preferences — whatever helps the store get it right.">
        <Textarea name="requirements" rows={3} />
      </Field>

      <Field label="Additional notes / comments" hint="Anything the store team should keep in mind while treating this client.">
        <Textarea name="notes" rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || check?.state === 'yours'}>
          {pending ? 'Saving…' : 'Refer them'}
        </Button>
      </div>
    </form>
  )
}

/**
 * The inline warning §9.2 asks for.
 *
 * What it does NOT say, in the `taken` case, is who holds the number. That is
 * another firm's client list, and `referral_phone_taken()` in the database
 * answers one bit for exactly this reason.
 */
function PhoneCheckNote({ check, checking }: { check: PhoneCheck | null; checking: boolean }) {
  if (checking) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
        <Loader2 size={12} className="animate-spin" /> Checking that number…
      </p>
    )
  }
  if (!check) return null

  if (check.state === 'free') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-good">
        <CheckCircle2 size={13} /> That number is clear — nobody has referred them.
      </p>
    )
  }
  if (check.state === 'yours') {
    return (
      <Note tone="warn">
        You have already referred this number{check.clientName ? ` as ${check.clientName}` : ''}. Open that referral to
        see where it has got to rather than creating a second one.
      </Note>
    )
  }
  if (check.state === 'taken') {
    return (
      <Note tone="warn">
        Another firm has already referred this number, so we could not credit their orders to you. If you believe that
        is wrong, your key account manager can take it to a Material Depot admin — the first approved claim holds the
        attribution until an admin decides otherwise.
      </Note>
    )
  }
  if (check.state === 'invalid') {
    return <Note tone="bad">That is not a ten-digit Indian mobile number. Orders are matched on it exactly.</Note>
  }
  return (
    <Note tone="warn">
      We could not run the duplicate check just now, so we do not know whether this number is already spoken for. You
      can still submit — we would rather tell you the check did not run than tell you it came back clear.
    </Note>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  return (
    <p
      className={[
        'flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-xs leading-relaxed',
        tone === 'bad' ? 'border-bad-soft bg-bad-soft text-ink' : 'border-warn-soft bg-warn-soft text-ink',
      ].join(' ')}
    >
      {tone === 'bad' ? (
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-bad" />
      ) : (
        <Info size={13} className="mt-0.5 shrink-0 text-warn" />
      )}
      <span>{children}</span>
    </p>
  )
}
