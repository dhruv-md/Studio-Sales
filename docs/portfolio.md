# Partner portfolios

**Covers:** `app/(app)/portfolio · components/portfolio/PortfolioView.tsx · portfolio_item · partner.bio/website/instagram/logo_url`

Material Depot puts its partners' work on its own site. A partner adds projects
here; an admin reads them and publishes.

## The field list — client-facing revamp

The submission form was rewritten: project name, project details, inspiration
behind it, a Google Drive link for the full image set, a cover image (still a
pasted URL), rough cost, and an aspects-covered checklist (`PORTFOLIO_ASPECTS`
in `lib/domain/types.ts` — Design, Execution, Turnkey, Furniture, Lighting,
Styling, easy to extend). `completed_on`, `area_sqft` and `credits` are
dropped from the form on instruction; the columns stay in the schema
untouched, so an already-submitted piece keeps whatever it had.

## The review gate is in the policy, not the UI

```
draft ──> submitted ──(admin)──> published
  ↑                └──(admin)──> rejected ──┐
  └────────────────────────────────────────┘
```

Two RLS policies do the whole thing, and between them a firm can never publish
its own work:

```sql
using       (app_can_write(partner_id) and status in ('draft','rejected'))
with check  (app_can_write(partner_id) and status in ('draft','submitted'))
```

`using` reads the row as it is now, `with check` the row as it would be. Together
they allow draft → submitted, let a rejected item be reworked and re-sent, and
freeze a published one. `published` is a status the firm can never write.

Only `review_portfolio_item()` sets it, and that function re-checks
`app_is_admin()` inside Postgres. `supabase/test/rlstest.js` group 11 asserts
each arm, including that an admin can and a partner cannot.

A rejection always carries a note, and the partner sees it word for word above
the project — that is what they act on.

## Images are links, not uploads

`cover_url` and `image_urls` take URLs. Nothing uploads to Supabase Storage yet,
so the form asks for a link to wherever the photographs already live and says so
rather than showing an upload control that does not work.

When that changes, remember the landmine: a `200` on an image URL means a
response arrived, not that it is a picture. Check the byte size.

## The studio profile

`partner.bio`, `website`, `instagram` and `logo_url` sit above the projects on
the partners page, and the firm owns them — they are in the small set of columns
`partner_guard_md_fields()` lets a non-admin write. `updateStudioProfile()` names
the writable fields one by one rather than spreading a payload: a stray key would
come back as a permission error the user cannot act on.

## What is not built

There is no rendering of any of this on materialdepot.com. This app holds the
submissions and the review state; whatever builds the public partners page reads
`portfolio_item where status = 'published'`. That producer does not exist yet and
is named here rather than implied.
