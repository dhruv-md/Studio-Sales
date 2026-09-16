'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui'
import type { IssuedCredentials } from '@/lib/data/console-actions'

/**
 * A password, the moment it is issued.
 *
 * It used to be the only time it was ever visible. Since
 * `006_credentials.sql` it is sealed and kept until its owner changes it, so an
 * admin who loses this window can find it again by tapping the person's name —
 * `CredentialPeek`. That is a deliberate trade and it is written on the panel,
 * because an admin who believes a password is unrecoverable behaves differently
 * from one who knows it is sitting there.
 *
 * `creds.notRetained` is the case where that failed — typically the migration
 * not having been run. Then this really IS the only time, and the panel says so
 * rather than repeating a promise the database did not keep.
 *
 * There is still no email sent. This deployment has no mail transport, and
 * pretending to send one would leave an admin thinking a designer had been
 * written to when nobody had. The admin copies this and sends it the way they
 * already talk to that firm.
 */
export function CredentialsIssued({
  creds,
  onDone,
}: {
  creds: IssuedCredentials
  onDone: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const message =
    `Welcome to Material Depot for Partners.\n\n` +
    `Sign in at ${typeof window === 'undefined' ? '' : window.location.origin}/login\n` +
    `Email: ${creds.email}\n` +
    `Password: ${creds.password}\n\n` +
    `Please change the password after your first sign-in — Settings → Sign-in.`

  async function copy(what: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard access can be refused. The text is on screen and selectable,
      // so this is a missing convenience rather than a failure worth an alert.
      setCopied(null)
    }
  }

  return (
    <div className="space-y-3">
      {creds.notRetained ? (
        <div className="rounded-[var(--radius-card)] border border-warn-soft bg-warn-soft px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warn">
            <KeyRound size={14} /> Shown once. Copy it now.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            The login works, but {creds.notRetained}. Close this without copying it and the only repair is to issue
            another one.
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-raised px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <KeyRound size={14} /> Kept until they change it
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            If you lose this window you can find this password again by tapping their name — it stays readable until
            they set their own, and is erased the moment they do. Nothing is emailed from here: send it to{' '}
            {creds.firmName} yourself, the way you already talk to them.
          </p>
        </div>
      )}

      <dl className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Email</dt>
            <dd className="truncate font-mono text-sm text-ink">{creds.email}</dd>
          </div>
          <Button size="sm" onClick={() => copy('email', creds.email)}>
            {copied === 'email' ? <Check size={13} /> : <Copy size={13} />} Copy
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Password</dt>
            <dd className="truncate font-mono text-base font-semibold tracking-wide text-ink">{creds.password}</dd>
          </div>
          <Button size="sm" onClick={() => copy('password', creds.password)}>
            {copied === 'password' ? <Check size={13} /> : <Copy size={13} />} Copy
          </Button>
        </div>
      </dl>

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => copy('all', message)}>
          {copied === 'all' ? <Check size={14} /> : <Copy size={14} />} Copy the whole message
        </Button>
        <Button variant="primary" onClick={onDone}>I have sent it</Button>
      </div>
    </div>
  )
}
