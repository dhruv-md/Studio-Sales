# Auth and onboarding

**Covers:** `app/login · proxy.ts · lib/data/session.ts · components/shell/Onboarding.tsx · onboard_partner()`

## Email + password, for now

Supabase Auth with email and password. `proxy.ts` refreshes the session on every
request (Server Components cannot set cookies, so it cannot happen in a layout)
and redirects a signed-out user to `/login?next=<where they were going>`.

**Phone + OTP is the right production login and is not wired in.** Material
Depot's own identity is a phone number: `palette.materialdepot.com` signs in with
`/api/login-otp?contact=<10 digits>&country_code=91` then
`/api/verify-otp?…&otp=<4 digits>`, and gets a bearer token back. Using it here
would mean a partner has one account across the storefront, palette and this
dashboard — the same account their wishlist and their referrals hang off.

It is not wired in because those endpoints need allowlisting for this origin
(the same wall as `docs/catalogue.md`). So sign-up takes the partner's phone as
a field instead, and `partner.phone` is the exact join key regardless of how
they log in. **Swapping the login later touches no other table.**

## `onboard_partner()` — why signing up is an RPC

A user cannot `INSERT` into `partner_user`. If they could, anyone could join any
firm by guessing a uuid and would then read that firm's clients and margins.

So `onboard_partner()` (SECURITY DEFINER, in `002_rls.sql`) creates the firm and
links the caller as its principal in one transaction, and:

- refuses if the caller already belongs to a firm,
- normalises the phone to bare ten digits (accepting `+91…`, `91…`, spaces) and
  refuses anything that is not a real Indian mobile,
- refuses if a firm is **already registered on that phone**, naming the number.
  A second login for an existing firm is a real case but not a self-serve one —
  it needs whoever owns the firm to agree, so it is a support action.

## The three states of `currentSession()`

| Result | Means | What the layout does |
|---|---|---|
| `ok: true, data: Session` | signed in, firm resolved | render the app |
| `ok: true, data: null` | signed in, **no firm yet** | render `<Onboarding>` |
| `ok: false` | the query failed | render `<Problem>` |

The third must never fall through to the second. Offering the sign-up form when
the database is merely unreachable would invite a partner to create a **second
firm on top of their real one**, and the phone-uniqueness check is the only
thing that would stop them.

`Onboarding` also picks up the `pending_firm` blob that `/login` stashes in
`localStorage`: with email confirmation on, sign-up has no session to create the
firm with, so the answers are kept and used on first real sign-in rather than
being asked for twice.

## Roles

`partner_user.role` is `principal` | `associate` | `viewer`. RLS reads through
`app_can_write()`, which admits the first two — so a `viewer` can see everything
the firm has and change none of it. Nothing in the UI creates additional logins
yet; that is a support action today.

## The issued password is kept until its owner changes it

`006_credentials.sql`, and it is the one place this app deliberately trades
security for an operational fact.

The old design showed a generated password once and threw it away. What actually
happened: an admin issues a login, the WhatsApp message does not get sent, and a
week later the only repair is a **new** password — which invalidates the one the
firm may already have been given off somebody's screenshot. Two people then
believe different things about the same account.

So the password is now retained, and bounded as tightly as it can be:

| | |
|---|---|
| **Encrypted** | AES-256-GCM. `seal()` / `unseal()` in `lib/auth/credentials.ts`. The key is derived from `SUPABASE_SERVICE_ROLE_KEY` and **never enters Postgres**, so a table dump or a browse through the Supabase dashboard yields `v1.…` and nothing else. |
| **Unreachable by any session** | `issued_credential` has RLS on and **no policies at all**, and `select` is revoked from `anon` and `authenticated`. An admin's own signed-in session cannot read one row of it. Only the service role, from a server action that has already called `requireStaff(['admin'])`. |
| **Erased on change** | A trigger on `auth.users` nulls the secret whenever `encrypted_password` changes — our settings page, a Supabase reset email, the dashboard. `app_read_credential()` re-checks the password fingerprint on every read as well, so the guarantee does not depend on the trigger having been created. |
| **Audited** | Every lookup stamps `revealed_at` / `revealed_by` and counts. |

**What is true and must stay written down: an admin of this console can read the
password of anyone provisioned since this migration, until they change it.** The
console says so on the person's own Settings page rather than leaving it implied.

### The four states, and why not two

`readIssuedCredential()` returns `current`, `changed`, `none` or `unreadable`,
and `CredentialPeek` says a different sentence for each. The two that would be
easy to collapse are the two that cost something:

- **`changed`** — they set their own password and we erased ours. The system
  working.
- **`none`** — we never kept one. Every login issued before this migration, and
  any where retention failed.

Telling an admin "no password on file" when somebody has simply changed theirs
invites a reset over a perfectly good account. `unreadable` is the third: a row
that will not open, which after a service-role key rotation is the expected
answer and is still not the same as "they changed it". Setting `CREDENTIAL_KEY`
explicitly decouples the sealing key from the service-role key, and is worth
doing before ever rotating the latter.

### Changing your own password

`changeMyPassword()` in `lib/data/account-actions.ts`, on both sides:
**Settings → Sign-in** for a partner and **Settings** in the console. It asks
for the current password first, verified against a throwaway client that does
not touch the session cookie — an unlocked laptop in a store should not be
enough to lock somebody out of their own account.

This is the only exit from retention, which is why the console's Settings page
is on **every** staff role's sidebar rather than just an admin's. Before it
existed, every welcome message ended with "please change the password after your
first sign-in" and there was nowhere in either app to do it.
