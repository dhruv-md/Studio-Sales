# Getting a firm onto the platform

**Covers:** `components/console/ApplicationForm.tsx · components/console/ApplicationQueue.tsx · lib/data/console-actions.ts · lib/auth/credentials.ts · partner_application · outreach_prospect · outreach_touch`

Two ways a firm arrives, and they meet at the same form.

## 1. They are already buying from us

Material Depot has their details because they have placed an order. They get a
partner row, a KAM, and a login — provisioned the same way as anyone else, with
`onboarding_source = 'existing_client'`. From then on the KAM's job splits in
two, and the console names both:

- **Active** — ordering. Nothing to do but keep the relationship.
- **Needs a call** — no verified order in 90 days (`DORMANT_AFTER_DAYS` in
  `lib/domain/tiering.ts`). This is the reactivation list, and it is the first
  card on a KAM's console home.

A third state is kept separate from both: **never ordered**. A firm that was
onboarded and has never had an order come through is an onboarding that did not
land, not a relationship going cold, and sending a KAM into a reactivation call
with one is a wasted call. `engagement()` returns three outcomes, never two.

## 2. They are not with us yet

The outreach manager's pipeline, in `/console/prospects`:

```
to_contact → contacted → meeting_set → met → onboarding → onboarded
                                     ↘ not_interested
```

Every call, message, visit and meeting goes on `outreach_touch` against the
firm. A firm that says no lands on `not_interested` rather than being deleted —
"we spoke to them in March, they had a supplier tie-up until next year" is the
single most useful thing to know before ringing them again, and a deleted row
cannot say it.

Prospects are scoped by market, so the Bangalore outreach manager does not work
the Hyderabad list and vice versa.

## The form, and the verification step

"Onboard them" opens `/console/applications/new`, pre-filled from the prospect
and linked back to it. Filing it creates a `partner_application` — **not a
login**. The form says so, because a partner who is told to expect credentials
and gets nothing is a worse outcome than one who is told it takes a day.

```
submitted ──(admin verifies)──> approved ──(admin issues)──> provisioned
    └──────────────────(admin declines)──────────────> rejected
```

Verifying and issuing are **two separate buttons** on purpose. "Verified" means
an admin has read the form and believes the firm and the number; "Issue login"
creates an account and a password that a human then has to be sent. Collapsing
them into one click makes it too easy to create an account nobody is expecting.

`provisionFromApplication()` refuses a form that is not `approved`.

### One live application per phone

A partial unique index — `partner_application_live_phone_idx`, on `phone`
`where status <> 'rejected'` — means two outreach managers working the same firm
collide loudly instead of producing two logins for one studio. The action turns
the constraint violation into a sentence that tells them to go and find each
other. Rejected forms are excluded, so a firm that said no in March can be
re-applied for in September.

The phone itself is validated hard and never guessed at. It is the exact key
every order this firm ever refers is matched on; a number that cannot be parsed
is refused rather than stored as something plausible, because a wrong one is a
firm whose orders silently never appear.

## Issuing the credentials

`provisionFromApplication()`, admin only, service role:

1. Check the form is `approved`, and that no `partner` already holds that phone
   — **exact match, never a name**. A firm already on that number is either a
   duplicate application or a second login for a real firm, and which of those it
   is needs a person.
2. `auth.admin.createUser` with `email_confirm: true` and a generated password.
3. Insert `partner`, then `partner_user`.
4. Write the welcome and KAM notes to `partner_activity`.
5. Mark the form `provisioned`.

Ordering matters. If the partner row or the link fails, the auth user is deleted
again — a half-provisioned firm is an account somebody can sign in to and find
nothing behind. If step 5 fails the firm is real and usable, so it is not rolled
back; the error says so loudly and includes the password, because the alternative
is losing a credential that has already been created.

### The password is kept until they change it, and nothing is emailed

`generatePassword()` uses `randomInt` from `node:crypto` and an alphabet with no
`I`, `l`, `1`, `O` or `0` — these get read out on a call or typed off a WhatsApp
message by someone who has never seen this app.

Since `006_credentials.sql` it is **sealed and kept** until its owner changes it,
so an admin who closes the panel can find it again from the firm's page
(**Their login**) or, for staff, by tapping the name on **Team**. It used to be
thrown away, and the repair for a message that never got sent was to issue a new
password over an account the firm might already have been given.

`docs/auth.md` holds the full argument and the four states the lookup can return.
The short version: encrypted with a key that never enters Postgres, unreachable
by any signed-in session including an admin's own, erased the moment the password
changes, and every lookup counted. Retention is **best-effort** — if it fails, or
if `006` has not been pasted yet, the panel says the password was not retained
and to copy it now, rather than promising something the database did not do.

`resetPartnerPassword()` and `resetStaffPassword()` still exist for the case
where there is nothing to read back. Reach for them second: issuing a new
password invalidates whatever the firm was already sent.

**Nothing is emailed from here, and that is a gap, not a design.** This
deployment has no mail transport of its own. Pretending to send one would leave
an admin believing a designer had been written to when nobody had, so the panel
says plainly that the admin sends it, and offers the whole message on the
clipboard. `auth.admin.inviteUserByEmail()` is the alternative when Supabase SMTP
is configured for this project; it would replace step 2 and the panel.

## The internal classification

Admin and KAM only, never shown to a partner. From `lib/domain/tiering.ts`, on
**verified orders**:

| | Orders |
|---|---|
| Power | 5 or more |
| Mid | 2, 3 or 4 |
| Basic | 0 or 1 |

Derived at read time from `referral_order`, never stored — a stored "power user"
flag goes stale the moment an order syncs and then disagrees with the order list
on the same screen.

Telling an architect they are a "Basic User" is a way to lose them. Everything
in that module lives under `components/console/` and is imported by console
pages only; if you find yourself importing it from `app/(app)/`, that is the bug.
