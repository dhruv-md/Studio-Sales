'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { Button, Problem } from '@/components/ui'
import type { CredentialLookup } from '@/lib/data/console-actions'
import type { Result } from '@/lib/data/result'
import { dateTime } from '@/lib/format'

/**
 * The login we issued somebody, looked up by an admin who has to send it again.
 *
 * Four outcomes, and every one of them is a different sentence on screen. The
 * two that would be easy to collapse into each other are the two that matter:
 * **changed** means they set their own password and we erased ours, which is the
 * system working; **none** means we never had one — every login issued before
 * `006_credentials.sql`, which is most of them today. Telling an admin "no
 * password on file" when somebody has simply changed theirs would have them
 * issuing a new one over a working account.
 *
 * The password is behind a reveal rather than printed on open, and the reveal is
 * counted. Not because the click is a security control — the lookup already
 * happened — but because a password should not land in a screen-share or a
 * shoulder-glance just because somebody tapped a name.
 */
export function CredentialPeek({
  load,
  who,
  onReset,
  resetting,
}: {
  /** How to fetch it. A staff member is looked up by their auth id, a firm by
   *  its partner id, and neither caller should have to know the other's shape. */
  load: () => Promise<Result<CredentialLookup>>
  /** Whose login this is, for the message the admin sends. */
  who: string
  /** Issue a new one. Omitted hides the button — your own row, or a firm with
   *  no login yet. */
  onReset?: () => void
  resetting?: boolean
}) {
  const [look, setLook] = useState<CredentialLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    start(async () => {
      const res = await load()
      if (!res.ok) return setError(res.error)
      setLook(res.data)
    })
    // `load` is a fresh closure on every render of the parent, so it cannot be
    // a dependency — this panel is mounted by a modal and fetches once when it
    // opens, which is exactly the intended lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copy(what: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  if (error) return <Problem title="We could not look that up" detail={error} />
  if (pending && !look) return <p className="py-6 text-center text-sm text-ink-faint">Looking it up…</p>
  if (!look) return null

  const reset = onReset ? (
    <Button onClick={onReset} disabled={resetting}>
      <KeyRound size={14} /> {resetting ? 'Issuing…' : 'Issue a new password'}
    </Button>
  ) : null

  if (look.state === 'none') {
    return (
      <Explainer
        tone="neutral"
        title="We did not keep this one"
        body={`Either it was issued before the console started retaining passwords, or retention failed at the time. There is no way to recover it — issuing a new one is the only repair, and it stops whatever ${who} has now from working.`}
        action={reset}
      />
    )
  }

  if (look.state === 'changed') {
    return (
      <Explainer
        tone="good"
        icon={<ShieldCheck size={14} />}
        title="They have changed it"
        body={`${who} set their own password${look.changedAt ? ` on ${dateTime(look.changedAt)}` : ''}, so the one we issued was erased. That is the system working — nobody at Material Depot can read a password its owner has chosen.`}
        action={reset}
      />
    )
  }

  if (look.state === 'unreadable') {
    return (
      <Explainer
        tone="warn"
        icon={<AlertTriangle size={14} />}
        title="There is one on file, and it will not open"
        body={`We kept a password for ${who} but ${look.reason} This is not the same as them having changed it — their old password still works, we simply cannot read it.`}
        action={reset}
      />
    )
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const message =
    `Welcome to Material Depot for Partners.\n\n` +
    `Sign in at ${origin}/login\n` +
    `Email: ${look.email}\n` +
    `Password: ${look.password}\n\n` +
    `Please change the password after your first sign-in — Settings → Sign-in.`

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-line bg-raised px-3 py-2.5">
        <p className="text-xs leading-relaxed text-ink-soft">
          Issued {look.issuedAt ? dateTime(look.issuedAt) : 'earlier'} and not changed since, so this is the password{' '}
          {who} has now. It stops being readable the moment they change it.
          {look.revealCount > 1 ? ` Looked up ${look.revealCount} times.` : null}
        </p>
      </div>

      <dl className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Email</dt>
            <dd className="truncate font-mono text-sm text-ink">{look.email}</dd>
          </div>
          <Button size="sm" onClick={() => copy('email', look.email)}>
            {copied === 'email' ? <Check size={13} /> : <Copy size={13} />} Copy
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Password</dt>
            <dd className="truncate font-mono text-base font-semibold tracking-wide text-ink">
              {shown ? look.password : '•••• •••• •••• ••••'}
            </dd>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => setShown((s) => !s)}>
              {shown ? <EyeOff size={13} /> : <Eye size={13} />} {shown ? 'Hide' : 'Show'}
            </Button>
            <Button size="sm" onClick={() => copy('password', look.password)}>
              {copied === 'password' ? <Check size={13} /> : <Copy size={13} />} Copy
            </Button>
          </div>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {reset}
        <Button variant="primary" onClick={() => copy('all', message)}>
          {copied === 'all' ? <Check size={14} /> : <Copy size={14} />} Copy the whole message
        </Button>
      </div>
    </div>
  )
}

function Explainer({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: 'neutral' | 'good' | 'warn'
  icon?: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  const skin =
    tone === 'good'
      ? 'border-good-soft bg-good-soft text-good'
      : tone === 'warn'
        ? 'border-warn-soft bg-warn-soft text-warn'
        : 'border-line bg-raised text-ink'
  return (
    <div className="space-y-3">
      <div className={`rounded-[var(--radius-card)] border px-3 py-2.5 ${skin}`}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {icon} {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{body}</p>
      </div>
      {action ? <div className="flex justify-end">{action}</div> : null}
    </div>
  )
}
