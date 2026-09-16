import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from 'node:crypto'

/**
 * Characters that cannot be misread off a screen or a printed slip. No `I`,
 * `l`, `1`, `O` or `0` — these passwords are read out on a call or typed off a
 * WhatsApp message by someone who has never seen this app, and "was that an ell
 * or a one" is a support ticket.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/**
 * A one-time password for a newly provisioned login.
 *
 * `randomInt` from `node:crypto`, not `Math.random` — this is a credential.
 * Grouped into fours so it can be read aloud.
 *
 * It is shown to the admin when it is issued and — since
 * `006_credentials.sql` — also **sealed and kept** so the admin can find it
 * again from the person's name, until its owner changes it. `seal()` below is
 * how; the migration is why. Before that change it was thrown away, and the
 * repair for a message that never got sent was to invalidate a password the
 * firm might already have been given.
 *
 * Nothing writes the plaintext to a log or to a page that can be reloaded
 * without an admin check, and Supabase still keeps only a hash of it for
 * signing in.
 */
export function generatePassword(groups = 4, size = 4): string {
  const out: string[] = []
  for (let g = 0; g < groups; g++) {
    let s = ''
    for (let i = 0; i < size; i++) s += ALPHABET[randomInt(ALPHABET.length)]
    out.push(s)
  }
  return out.join('-')
}

// ============================================================ sealing

/**
 * The issued password is kept until its owner changes it, and it is kept
 * ENCRYPTED. `supabase/migrations/006_credentials.sql` holds the rest of the
 * argument; this file holds the key, which is the half that must never reach
 * Postgres. A dump of `issued_credential`, or a browse through the Supabase
 * dashboard, gets `v1.…` and nothing else.
 *
 * The key is derived from `SUPABASE_SERVICE_ROLE_KEY` rather than being a new
 * environment variable, so there is nothing to forget to set on a new
 * deployment: the secret that could already read this table is the secret that
 * unlocks it, and adding a variable that is missing in Preview would mean a
 * feature that silently stops retaining passwords there.
 *
 * `CREDENTIAL_KEY` overrides it, and exists for one case: **rotating the
 * service-role key**. Rotation changes the derived key, and every password
 * sealed under the old one then opens as `unreadable` — a third state the
 * console reports as "we cannot read this, issue a new one", never as "they
 * changed it". Setting `CREDENTIAL_KEY` once decouples the two.
 */
function key(): Buffer {
  const ikm = process.env.CREDENTIAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!ikm) throw new Error('Neither CREDENTIAL_KEY nor SUPABASE_SERVICE_ROLE_KEY is set')
  return Buffer.from(hkdfSync('sha256', ikm, 'b2b issued credential', 'aes-256-gcm v1', 32))
}

const b64 = (b: Buffer) => b.toString('base64url')

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plaintext: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return ['v1', b64(iv), b64(c.getAuthTag()), b64(ct)].join('.')
}

export type Unsealed = { ok: true; value: string } | { ok: false; reason: string }

/**
 * The other half, and it has three outcomes rather than two. A password that
 * cannot be opened — wrong key after a rotation, a truncated column, a tampered
 * row — is NOT the same fact as "there is no password on file", and the console
 * says which it is. GCM's auth tag is what makes tampering a failure here
 * instead of a plausible-looking wrong answer.
 */
export function unseal(sealed: string): Unsealed {
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return { ok: false, reason: 'the stored value is not in a format this app wrote' }
  }
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1], 'base64url'))
    d.setAuthTag(Buffer.from(parts[2], 'base64url'))
    const out = Buffer.concat([d.update(Buffer.from(parts[3], 'base64url')), d.final()])
    return { ok: true, value: out.toString('utf8') }
  } catch {
    return {
      ok: false,
      reason:
        'it could not be decrypted. That normally means the service-role key has been rotated since it was issued — issue a new password.',
    }
  }
}
