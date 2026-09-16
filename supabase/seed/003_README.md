# 003_bulk_variety.sql — auth users it depends on

`003_bulk_variety.sql` (and a re-run of `002_console.sql`) needs these
`auth.users` rows to exist before the SQL that links them will do anything.
Like `002_console.sql` says: **staff and partner logins cannot be created from
SQL** — an auth user is made by GoTrue, not by an insert.

These eleven were provisioned via the Supabase Admin API
(`POST /auth/v1/admin/users`, `email_confirm: true`) rather than through the
app's own sign-up form, because this project has email confirmation ON and the
admin API is the only way to create an already-confirmed user without a real
inbox to click a link from.

| Email | Password | Becomes |
|---|---|---|
| demo.admin@materialdepot.com | DemoAdmin2026! | Staff — admin |
| demo.kam.blr@materialdepot.com | DemoKamBlr2026! | Staff — KAM, Bangalore |
| demo.kam.hyd@materialdepot.com | DemoKamHyd2026! | Staff — KAM, Hyderabad |
| demo.outreach.blr@materialdepot.com | DemoOutreachBlr2026! | Staff — outreach, Bangalore |
| demo.outreach.hyd@materialdepot.com | DemoOutreachHyd2026! | Staff — outreach, Hyderabad |
| demo.inbound@materialdepot.com | DemoInbound2026! | Staff — inbound |
| demo.verandah@example.in | DemoVerandah2026! | Partner — Verandah Interiors (Basic, never ordered) |
| demo.chettinad@example.in | DemoChettinad2026! | Partner — Chettinad Design Works (dormant Power firm) |
| demo.foundry@materialdepot.com | DemoFoundry2026! | Partner — Foundry Design Studio (brand new, empty state) |
| demo.aranya@materialdepot.com | DemoAranya2026! | Partner — Aranya Architects (gold-tier, principal) |
| demo.aranya.associate@materialdepot.com | DemoAranyaAssoc2026! | Partner — Aranya Architects (associate, Procurement) |

Existing login, unchanged: `demo.studio@materialdepot.com` / `DemoStudio2026!`
(Studio Terra, principal).

## Order

1. These auth users exist (this file).
2. Run `supabase/seed/002_console.sql` — confirmed 2026-09-17 that it has
   never actually been pasted into the live project (`partner` had 1 row, not
   the 3 this file describes). It will now link the six staff rows correctly
   since their auth users exist.
3. Run `supabase/seed/003_bulk_variety.sql`.

Re-running any of the three is safe — every row has a fixed id.

## Teardown

Deleting the four partner rows this file adds is in `003_bulk_variety.sql`'s
own teardown block. To remove the auth users too:

```sql
delete from auth.users where email in (
  'demo.admin@materialdepot.com','demo.kam.blr@materialdepot.com','demo.kam.hyd@materialdepot.com',
  'demo.outreach.blr@materialdepot.com','demo.outreach.hyd@materialdepot.com','demo.inbound@materialdepot.com',
  'demo.verandah@example.in','demo.chettinad@example.in',
  'demo.foundry@materialdepot.com','demo.aranya@materialdepot.com','demo.aranya.associate@materialdepot.com'
);
```
