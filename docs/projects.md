# Projects — mood boards and inspiration spaces

**Covers:** `app/(app)/projects/** · app/p/** · app/api/upload · components/studio/** ·
lib/studio/pdf.ts · studio_project · studio_project_space · studio_project_item ·
studio_project_template`

## Not the workspace

This is a new, always-on core tab, built for the client-facing revamp. It is
a completely different feature from the opt-in design/quote/procurement
workspace that used to live at `/projects` (now `/workspace/projects`,
`docs/roles.md`) — different tables (`studio_project`, prefixed to keep that
separation obvious), different purpose. A project here has no quote, no
procurement list and no P&L; it is a place to collect design inspiration for
a job, referred client or not.

```
studio_project → studio_project_space (a room)  → studio_project_item (a photo, a video, a Palette link, a product link)
```

One polymorphic item table rather than three near-identical ones — to this
schema, an image, a video, a saved Palette link and a product reference are
the same shape: a URL, a caption, a position.

## A project's client is optional, and three-way

`createStudioProject()` takes one of: `referral_id` (a client already
referred — autofills from `referral`, never re-typed), `client_name` +
`client_phone` (typed by hand, for someone not referred), or neither (a
project-only mood board). Never both a `referral_id` and manual fields at
once — the action enforces that by clearing whichever the caller did not
choose.

## The trust boundary is the same as the workspace's

No staff read policy exists on `studio_project`, `studio_project_space`,
`studio_project_item` or `studio_project_template`, and none should. This is
a firm's own creative work for its own clients — house rule 7 in `CLAUDE.md`
("Material Depot staff see the relationship, never the work") applies here
exactly as it does to the older `client`/`project`/`board` tables.
`supabase/test/rlstest.js` group 26 checks an admin and a KAM both read
nothing.

## Sharing — a public page with no session

"Get a link" (`ensureProjectShareToken()` / `ensureSpaceShareToken()` in
`lib/data/actions.ts`) is idempotent — a project or space keeps the same
token once shared, so a link already handed to someone never quietly stops
working. The public pages, `app/p/[token]` and `app/p/space/[token]`, read by
**service role**, not by an RLS grant to `anon`: a policy that let anon
select by token would also let anon enumerate every shared project by
guessing or brute force. The token itself is the whole capability.

**`proxy.ts` exempts `/p/`** from the sign-in requirement, the same way it
exempts `/login` — without that, an unauthenticated viewer opening a shared
link would be bounced to a login screen for an app they were never given
credentials to. This is the one thing to remember if the middleware is ever
touched: a public share page with a session gate is not a public share page.

## Uploads — the first one in this app

Nothing in this codebase touched Supabase Storage before this. The
`studio-media` bucket (public-read) has **no `storage.objects` policy for
`authenticated`** — every upload goes through `app/api/upload/route.ts`,
which checks the caller's own session first (same as every other partner
write) and then writes with the service role. A client-side storage policy
permissive enough to let a firm upload would also be permissive enough to
let it overwrite another firm's files by guessing a path; routing every
upload through one checked endpoint avoids that entirely. 15MB cap, images
and short video only — this is inspiration media, not a general file drop.
`Uploader` (`components/shell/Uploader.tsx`) is the one control, reused on
Portfolio's cover-image field as an upgrade over paste-a-URL.

## The PDF is generated client-side, from the same data as the page

`lib/studio/pdf.ts` mirrors `lib/quote/pdf.ts`'s shape: the firm's own
branding, never Material Depot's — this is the architect's document to hand
their client. Images are fetched and embedded as data URLs; a fetch that
fails (most often a non-Supabase host with no CORS header) prints the link as
text instead of silently dropping the item, because a downloadable record
should account for everything that was meant to be in it. An optional
`studio_project_template` (an accent colour and an intro note, saved per
firm) is applied automatically when one exists — the "template" the brief
asked for, kept to the smallest thing worth naming and reusing, since the
firm's own name and logo already come from `partner` automatically.

## What is deliberately not built

- **Palette is a link, not an embed.** "Browse Palette" opens
  palette.materialdepot.com in a new tab; saving something back is a partner
  pasting the link in, matching what `docs/design.md` already establishes is
  technically available today (no round-trip API, no per-scene deep link
  here since a mood-board space isn't tied to the room-type taxonomy the
  workspace's boards use).
- **Templates are one saved style per firm**, not a template library —
  `studio_project_template` has no UI for managing more than one yet; the
  schema does not prevent it.
- **No drag-to-reorder.** `sort_order` exists on every table for it; items
  and spaces render in creation order until a UI is built to change that.
