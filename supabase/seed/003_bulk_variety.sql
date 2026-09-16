-- ============================================================================
-- BULK VARIETY DEMO DATA — Material Depot for Partners
-- Target project: vmwvxwqzqxhwesjokztf. Run AFTER 001_demo.sql and
-- 002_console.sql (both must be applied first — this file assumes their rows
-- exist and adds to them rather than repeating them).
--
-- WHY THIS FILE EXISTS: 001+002 give you exactly one testable firm (Studio
-- Terra) and an empty console (002's staff/prospects/applications never got
-- linked because the demo.*@materialdepot.com auth users did not exist yet).
-- This file assumes you have now created those auth users — see
-- supabase/seed/003_README.md in this same folder for the exact list — and
-- fills in everything 001+002 left thin: five more testable partner logins
-- covering every lifecycle state, the Projects (mood board) tab, portfolio
-- images, escalations, visit requests, team invites and per-firm notification
-- preferences.
--
-- Paste the whole file into Supabase → SQL Editor → Run, AFTER re-running
-- 002_console.sql (it will now actually link the staff rows and the two extra
-- firms it defines — Verandah Interiors and Chettinad Design Works — which
-- this file gives real logins and much more depth).
--
-- Idempotent: every row has a fixed id, so re-running updates rather than
-- duplicates.
--
-- THIS IS ALL INVENTED. This repo is public — nothing real goes in here, ever.
-- Every image URL below is a REAL, currently-live photograph fetched from
-- palette.materialdepot.com's scene gallery or materialdepot.com's own product
-- pages (both verified reachable and correctly sized, not just 200 OK — see
-- docs/catalogue.md's warning about the near-transparent compositing layers).
-- The product names, SKUs and rupee figures pinned to them are still made up,
-- same convention 001_demo.sql already uses for board covers.
-- ============================================================================

-- ============================================================================
-- 1. FOUR MORE PARTNER FIRMS
--
--   Verandah Interiors      — Hyderabad, Basic, never ordered, workspace off
--                              (partner row already in 002; this section only
--                              gives it a real login and depth)
--   Chettinad Design Works  — Bangalore, dormant Power firm, workspace off
--                              (partner row already in 002; login + depth here)
--   Foundry Design Studio   — brand new, self-signup, NO KAM yet, workspace
--                              off, deliberately EMPTY everywhere else — the
--                              empty-state test for every tab in the app
--   Aranya Architects       — inbound-sourced, workspace off (a high performer
--                              who never asked for the project workspace,
--                              which is the common real shape per docs/roles.md),
--                              gold-tier rewards, full referral/escalation/
--                              visit-request/team-invite/portfolio/mood-board
--                              variety
-- ============================================================================

insert into partner (id, firm_name, contact_name, phone, email, city, gst, firm_type, onboarded_on) values
  ('1d1d1d1d-0000-4000-8000-000000000001', 'Foundry Design Studio', 'Naveen Kutty', '9880556677',
   'demo.foundry@materialdepot.com', 'Bengaluru', null, 'architect', current_date - 3),
  ('1d1d1d1d-0000-4000-8000-000000000002', 'Aranya Architects', 'Ritika Chandran', '9845667788',
   'demo.aranya@materialdepot.com', 'Bengaluru', '29AABCA9988K1Z4', 'architect', current_date - 300)
on conflict (id) do update set
  firm_name = excluded.firm_name, contact_name = excluded.contact_name, phone = excluded.phone,
  city = excluded.city, gst = excluded.gst;

-- Foundry: self-signup, the one onboarding_source value nothing else uses, and
-- deliberately no KAM — the fallback KamCard state (docs CLAUDE.md § Deploying,
-- NEXT_PUBLIC_B2B_DESK_PHONE unset) has never been exercised by the demo firm
-- until this row exists.
update partner set
  market = 'bangalore', onboarding_source = 'self_signup', workspace_enabled = false
where id = '1d1d1d1d-0000-4000-8000-000000000001';

-- Aranya: the one onboarding_source value nothing else uses either (inbound),
-- onboarded by the inbound manager and handed to the Bangalore KAM — the first
-- row in this whole dataset that gives demo.inbound@materialdepot.com anything
-- to point at.
update partner set
  market = 'bangalore', onboarding_source = 'inbound', workspace_enabled = false,
  kam_user_id = (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'),
  onboarded_by = (select user_id from staff_user where email = 'demo.inbound@materialdepot.com'),
  bio = 'A twelve-person practice doing residential villas and boutique commercial fit-outs across Bengaluru. Heavy Material Depot buyer for three years running.',
  website = 'https://example.com/aranya-architects', instagram = 'aranya.architects.demo',
  internal_note = 'Our best-performing referral partner by attributed spend. No interest in the project workspace so far — happy running quotes their own way.',
  theme_preset = 'indigo', theme_base = 'dark',
  established_year = 2018, team_size = '11-25', services = array['Architecture','Interior Design'],
  project_types = array['residential','commercial']
where id = '1d1d1d1d-0000-4000-8000-000000000002';

-- Verandah and Chettinad already exist from 002_console.sql. Give both a real
-- login (see the auth-provisioning note at the top of this file) — 002 left
-- them deliberately loginless ("onboarded on paper, waiting on credentials"),
-- and that IS a real state worth keeping somewhere, so Frame & Form Studio and
-- Third Space Interiors in the outreach pipeline stay in that state. These two
-- move forward instead, so the Basic-tier and dormant-Power-tier partner VIEWS
-- are actually reachable, not just visible from the console side.
do $$
declare v_verandah uuid; v_chettinad uuid;
begin
  select id into v_verandah from auth.users where email = 'demo.verandah@example.in';
  select id into v_chettinad from auth.users where email = 'demo.chettinad@example.in';

  if v_verandah is null or v_chettinad is null then
    raise notice 'demo.verandah@example.in / demo.chettinad@example.in not found in auth.users yet — create them (see 003_README.md), then re-run this file. Everything else below still loads.';
  end if;

  if v_verandah is not null then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_verandah;
    insert into partner_user (user_id, partner_id, role) values (v_verandah, '0d0d0d0d-0000-4000-8000-000000000011', 'principal')
    on conflict (user_id) do update set partner_id = excluded.partner_id;
  end if;
  if v_chettinad is not null then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_chettinad;
    insert into partner_user (user_id, partner_id, role) values (v_chettinad, '0d0d0d0d-0000-4000-8000-000000000012', 'principal')
    on conflict (user_id) do update set partner_id = excluded.partner_id;
  end if;
end $$;

-- Foundry and Aranya's own logins.
do $$
declare v_foundry uuid; v_aranya uuid;
begin
  select id into v_foundry from auth.users where email = 'demo.foundry@materialdepot.com';
  select id into v_aranya  from auth.users where email = 'demo.aranya@materialdepot.com';

  if v_foundry is null or v_aranya is null then
    raise notice 'demo.foundry@materialdepot.com / demo.aranya@materialdepot.com not found in auth.users yet — create them (see 003_README.md), then re-run this file.';
  end if;

  if v_foundry is not null then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_foundry;
    insert into partner_user (user_id, partner_id, role) values (v_foundry, '1d1d1d1d-0000-4000-8000-000000000001', 'principal')
    on conflict (user_id) do update set partner_id = excluded.partner_id;
  end if;
  if v_aranya is not null then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_aranya;
    insert into partner_user (user_id, partner_id, role) values (v_aranya, '1d1d1d1d-0000-4000-8000-000000000002', 'principal')
    on conflict (user_id) do update set partner_id = excluded.partner_id;
  end if;
end $$;

-- Foundry gets exactly one row anywhere else in this dataset: the welcome
-- activity entry a real signup gets. Everything else about this firm —
-- clients, referrals, projects, portfolio, escalations — stays empty on
-- purpose. Walk every tab as this login and you are looking at <Problem>'s
-- sibling, the deliberate EMPTY state, not a bug.
insert into partner_activity (id, partner_id, kind, title, detail, occurred_at, visible_to_partner, by_user) values
  ('1d2d3d4d-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000001', 'onboarded',
   'Welcome to Material Depot for Partners', 'Your account is ready. Refer your first client to get started.',
   now() - interval '3 days', true, null)
on conflict (id) do update set title = excluded.title, detail = excluded.detail;

-- ============================================================================
-- 2. ARANYA'S REFERRALS — the eight `referral.status` values, all in one
-- dataset once combined with Studio Terra (active, submitted) and Chettinad
-- (dormant, below): active, approved, under_review, rejected, duplicate,
-- expired here; dormant on Chettinad; submitted on Studio Terra's Iyer.
-- ============================================================================

insert into referral (id, partner_id, client_name, md_phone, referred_on, notes) values
  ('30303030-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000002',
   'Kapoor Builders', '9845990011', current_date - 75, 'Clubhouse interiors for their Sarjapur project. Buys on commercial rates.'),
  ('30303030-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002',
   'Whitefield Heights Association', '9845990022', current_date - 48, 'Sample villa for the association''s show unit.'),
  ('30303030-0000-4000-8000-000000000003', '1d1d1d1d-0000-4000-8000-000000000002',
   'Reddy Family', '9845990033', current_date - 4, 'Just referred. KAM reviewing the form before the SLA clock runs out.'),
  ('30303030-0000-4000-8000-000000000004', '1d1d1d1d-0000-4000-8000-000000000002',
   'Sunrise Interiors Trade', '9845990044', current_date - 20, 'Turned out to already be a direct Material Depot trade account.'),
  ('30303030-0000-4000-8000-000000000005', '1d1d1d1d-0000-4000-8000-000000000002',
   'Malhotra Residence', '9845990055', current_date - 10, 'Same client, submitted twice from two different site visits.'),
  ('30303030-0000-4000-8000-000000000006', '1d1d1d1d-0000-4000-8000-000000000002',
   'Legacy Client 2025', '9845990066', current_date - 410, 'One of the firm''s first referrals, from before the attribution window policy existed.')
on conflict (id) do update set
  client_name = excluded.client_name, md_phone = excluded.md_phone, notes = excluded.notes;

update referral set status = 'active', consent_given = true, consent_at = now() - interval '70 days',
       project_type = 'commercial', budget_band = '₹25 – 50 L', timeline = 'Within 3 months',
       city = 'Bengaluru', locality = 'Sarjapur', categories = array['Tiles','Louvers & Panels']
 where id = '30303030-0000-4000-8000-000000000001';

update referral set status = 'approved', consent_given = null,
       project_type = 'residential', budget_band = '₹10 – 25 L', timeline = 'Within a month',
       city = 'Bengaluru', locality = 'Whitefield', categories = array['Wallpaper','Tiles']
 where id = '30303030-0000-4000-8000-000000000002';

update referral set status = 'under_review', consent_given = null,
       project_type = 'residential', budget_band = '₹5 – 10 L', city = 'Bengaluru', locality = 'HSR Layout'
 where id = '30303030-0000-4000-8000-000000000003';

update referral set status = 'rejected', rejection_reason = 'EXISTING_CUSTOMER', consent_given = false,
       consent_at = now() - interval '19 days',
       reviewed_by = (select user_id from staff_user where email = 'demo.admin@materialdepot.com'),
       reviewed_at = now() - interval '18 days',
       review_note = 'Already an active Material Depot trade account under their own GSTIN. Nothing to attribute.'
 where id = '30303030-0000-4000-8000-000000000004';

update referral set status = 'duplicate', rejection_reason = 'DUPLICATE_SUBMISSION',
       reviewed_by = (select user_id from staff_user where email = 'demo.admin@materialdepot.com'),
       reviewed_at = now() - interval '9 days',
       review_note = 'Same phone number as a form submitted three days earlier. Keeping the first one.'
 where id = '30303030-0000-4000-8000-000000000005';

update referral set status = 'expired', consent_given = true, consent_at = now() - interval '405 days',
       attribution_expires_on = current_date - 40,
       project_type = 'residential', budget_band = '₹15 – 30 L', city = 'Bengaluru', locality = 'Koramangala'
 where id = '30303030-0000-4000-8000-000000000006';

-- Chettinad's two referrals (from 002) get the same treatment: one live, one
-- gone quiet — which is the 'dormant' status value nothing else in this
-- dataset uses, and matches the firm's own "ordering monthly, then nothing"
-- story in 002's internal_note.
update referral set status = 'active', consent_given = true, consent_at = now() - interval '375 days'
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01';
update referral set status = 'dormant', consent_given = true, consent_at = now() - interval '250 days'
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02';

-- Verandah's two referrals: never asked (null) and refused — the Basic /
-- never-ordered firm should not read as having a clean confirmed-consent book.
update referral set status = 'submitted', consent_given = null
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01';
-- (Verandah's second referral does not exist in 002 — it only has one. Nothing
-- to update on a second id.)

-- referral_phone: 007's backfill only ran once, over whatever referrals
-- existed at the time. Everything created after that (Aranya's six, above)
-- needs its own 'client' row, and two of them get a genuine SECOND number to
-- exercise the multi-phone UI 007 was built for.
insert into referral_phone (referral_id, phone, label)
select r.id, r.md_phone, 'client' from referral r
where r.id::text like '30303030-%'
on conflict (referral_id, phone) do nothing;

insert into referral_phone (referral_id, phone, label) values
  ('30303030-0000-4000-8000-000000000001', '9900110022', 'additional'),
  ('30303030-0000-4000-8000-000000000002', '9900110033', 'partner')
on conflict (referral_id, phone) do nothing;

-- ============================================================================
-- 3. ARANYA'S ORDERS — reaches the gold-coin monthly slab AND lifetime tier 4,
-- and covers 'rejected' approval_status and two of the not_counted_reason
-- codes (ATTRIBUTION_EXPIRED, DUPLICATE_ORDER), both zero elsewhere in this
-- dataset. July is old enough to be CONFIRMED; August is inside the 30-day
-- maturation window and reads PROVISIONAL; September is still with an admin.
-- ============================================================================

insert into referral_order (
  id, referral_id, md_enq_id, order_value, ordered_on, delivered_on, store, status,
  approval_status, approved_by, approved_at, review_note, not_counted_reason, coupon_code, discount_availed
) values
  -- July — ₹6,20,000 lands in slab 4 (₹5,00,001–7,50,000), Gold Coin, confirmed
  ('50505050-0000-4000-8000-000000000001', '30303030-0000-4000-8000-000000000001', 'ENQDEMOAR0001',
   620000, current_date - 71, current_date - 57, 'Whitefield', 'Delivered', 'approved',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), now() - interval '53 days',
   null, null, 'MDPRO3', 12400),

  -- September — still with an admin, so it counts towards nothing yet
  ('50505050-0000-4000-8000-000000000002', '30303030-0000-4000-8000-000000000001', 'ENQDEMOAR0002',
   350000, current_date - 9, null, 'Whitefield', 'Processing', 'pending',
   null, null, null, null, null, null),

  -- August — ₹4,10,000 lands in slab 3, Silver Coin, still inside the 30-day
  -- window (delivered 28 days ago) so this month reads PROVISIONAL. No coupon
  -- data on purpose — the net-cashback-unstateable case, same as Studio
  -- Terra's September order, now shown on a SECOND firm so it reads as a
  -- general rule and not a one-off.
  ('50505050-0000-4000-8000-000000000003', '30303030-0000-4000-8000-000000000002', 'ENQDEMOAR0003',
   410000, current_date - 43, current_date - 28, 'Sarjapur', 'Delivered', 'approved',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), now() - interval '25 days',
   null, null, null, null),

  -- A rejected order — approval_status = 'rejected' has no other example in
  -- this dataset. Same client, re-synced from two stores by mistake.
  ('50505050-0000-4000-8000-000000000004', '30303030-0000-4000-8000-000000000002', 'ENQDEMOAR0004',
   45000, current_date - 22, null, 'Sarjapur', 'Cancelled', 'rejected',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), now() - interval '20 days',
   'Duplicate of ENQDEMOAR0003 — same client, same cart, synced twice from two stores on the same afternoon.',
   'DUPLICATE_ORDER', null, null),

  -- A real order, honestly approved, that STILL counts towards nothing: the
  -- attribution window on this referral lapsed before this order was placed.
  ('50505050-0000-4000-8000-000000000005', '30303030-0000-4000-8000-000000000006', 'ENQDEMOAR0005',
   180000, current_date - 45, current_date - 30, 'Whitefield', 'Delivered', 'approved',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), now() - interval '44 days',
   'Order placed after the referral''s attribution window closed. Verified genuine, correctly excluded from the ladder.',
   'ATTRIBUTION_EXPIRED', null, null)
on conflict (id) do update set
  order_value = excluded.order_value, ordered_on = excluded.ordered_on, delivered_on = excluded.delivered_on,
  store = excluded.store, status = excluded.status, approval_status = excluded.approval_status,
  approved_at = excluded.approved_at, review_note = excluded.review_note,
  not_counted_reason = excluded.not_counted_reason, coupon_code = excluded.coupon_code,
  discount_availed = excluded.discount_availed;

-- Reward claims: Aranya's approved, in-window total is 6,20,000 + 4,10,000 =
-- ₹10,30,000 — tiers 1–4 all reached (the ATTRIBUTION_EXPIRED order does not
-- count, on purpose). Tier 4 is new to this dataset; Studio Terra never
-- reached past tier 2.
insert into reward_claim (id, partner_id, tier_id, status, unlocked_at, fulfilled_on, notes) values
  ('90909090-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000002', 1, 'fulfilled',
   now() - interval '52 days', current_date - 45, 'Handed over at the Whitefield store.'),
  ('90909090-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002', 2, 'fulfilled',
   now() - interval '52 days', current_date - 40, 'Handed over with the tier 1 coin, same visit.'),
  ('90909090-0000-4000-8000-000000000003', '1d1d1d1d-0000-4000-8000-000000000002', 3, 'claimed',
   now() - interval '52 days', null, 'Claimed — courier arranged, in transit.'),
  ('90909090-0000-4000-8000-000000000004', '1d1d1d1d-0000-4000-8000-000000000002', 4, 'unlocked',
   now() - interval '25 days', null, 'Crossed with the August order confirming. KAM to arrange the courier.')
on conflict (partner_id, tier_id) do update set
  status = excluded.status, unlocked_at = excluded.unlocked_at, fulfilled_on = excluded.fulfilled_on, notes = excluded.notes;

-- referral_event — a client-journey timeline for Aranya's two live referrals,
-- same shape as Studio Terra's.
insert into referral_event (id, referral_id, event_type, occurred_at, store, title, detail, amount, payload, external_id) values
  ('40404040-0000-4000-8000-000000000001', '30303030-0000-4000-8000-000000000001', 'store_visit',
   current_date - 74 + interval '11 hours', 'Whitefield', 'Site team walk-in',
   'Two associates from Kapoor Builders, looked at the louver range for the lobby.', null,
   '{"advisor":"Sandeep K"}', 'demo:visit:kapoor:1'),
  ('40404040-0000-4000-8000-000000000002', '30303030-0000-4000-8000-000000000001', 'quote_shared',
   current_date - 72 + interval '15 hours', 'Whitefield', 'Material Depot quote shared',
   'Commercial rate card applied.', 620000, '{}', 'demo:quote:kapoor:1'),
  ('40404040-0000-4000-8000-000000000003', '30303030-0000-4000-8000-000000000001', 'order_placed',
   current_date - 71 + interval '16 hours', 'Whitefield', 'Order placed — ENQDEMOAR0001',
   'Clubhouse lobby and washrooms, full supply.', 620000, '{"enq":"ENQDEMOAR0001"}', 'demo:order:kapoor:1'),
  ('40404040-0000-4000-8000-000000000004', '30303030-0000-4000-8000-000000000001', 'store_visit',
   current_date - 10 + interval '10 hours', 'Whitefield', 'Second visit',
   'Back for the phase 2 tile selection.', null, '{"advisor":"Sandeep K"}', 'demo:visit:kapoor:2'),
  ('40404040-0000-4000-8000-000000000005', '30303030-0000-4000-8000-000000000002', 'store_visit',
   current_date - 46 + interval '17 hours', 'Sarjapur', 'Walk-in, association secretary',
   'Sample villa for the residents'' association.', null, '{"advisor":"Praveen M"}', 'demo:visit:whitefieldha:1'),
  ('40404040-0000-4000-8000-000000000006', '30303030-0000-4000-8000-000000000002', 'order_placed',
   current_date - 43 + interval '13 hours', 'Sarjapur', 'Order placed — ENQDEMOAR0003',
   'Kitchen and living wallpaper, sample villa.', 410000, '{"enq":"ENQDEMOAR0003"}', 'demo:order:whitefieldha:1')
on conflict (id) do update set
  event_type = excluded.event_type, occurred_at = excluded.occurred_at, title = excluded.title,
  detail = excluded.detail, amount = excluded.amount;

-- ============================================================================
-- 4. ESCALATIONS — the six `escalation.status` values, spread across firms:
-- open + in_progress here, resolved already exists (Studio Terra), closed and
-- acknowledged and reopened added below.
-- ============================================================================

insert into escalation (id, partner_id, referral_id, order_id, category, subject, description,
                        status, raised_by, raised_at, acknowledged_at, resolved_at, ack_due_at)
values
  -- open: freshly raised, nobody has acknowledged it yet
  ('70707070-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000002',
   '30303030-0000-4000-8000-000000000002', '50505050-0000-4000-8000-000000000003',
   'quality_damage', 'Cracked pieces in the kitchen wallpaper roll',
   'Two of the eight rolls delivered have creasing damage along the fold. Site is holding installation.',
   'open', (select user_id from partner_user where partner_id = '1d1d1d1d-0000-4000-8000-000000000002' limit 1),
   now() - interval '2 days', null, null, now() - interval '2 days' + interval '24 hours'),

  -- in_progress: acknowledged, being worked
  ('70707070-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002',
   '30303030-0000-4000-8000-000000000001', '50505050-0000-4000-8000-000000000001',
   'billing_gst', 'GST on the invoice does not match the quote',
   'Quote showed 18% throughout; the tax invoice has one line at 12%. Needs a corrected copy for our accountant.',
   'in_progress', (select user_id from partner_user where partner_id = '1d1d1d1d-0000-4000-8000-000000000002' limit 1),
   now() - interval '6 days', now() - interval '5 days', null, now() - interval '6 days' + interval '24 hours')
on conflict (id) do update set status = excluded.status, description = excluded.description;

update escalation set assigned_to = (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com')
 where partner_id = '1d1d1d1d-0000-4000-8000-000000000002';

insert into escalation_comment (id, escalation_id, body, internal, author_side, created_at) values
  ('80808080-0000-4000-8000-000000000001', '70707070-0000-4000-8000-000000000001',
   'Attaching photos of both damaged rolls — sending separately over WhatsApp, this form has no upload yet.',
   false, 'partner', now() - interval '2 days' + interval '1 hour'),
  ('80808080-0000-4000-8000-000000000002', '70707070-0000-4000-8000-000000000002',
   'Checked with billing — one line was keyed at the wrong GST slab. Corrected invoice going out today.',
   false, 'md', now() - interval '4 days'),
  ('80808080-0000-4000-8000-000000000003', '70707070-0000-4000-8000-000000000002',
   'Flag this SKU''s tax slab in the master sheet, this is the second time this month.',
   true, 'md', now() - interval '4 days')
on conflict (id) do nothing;

-- acknowledged: on Verandah, the never-ordered firm — a support issue can
-- exist even with no attributed spend to hold hostage.
insert into escalation (id, partner_id, referral_id, category, subject, description,
                        status, raised_by, raised_at, acknowledged_at, ack_due_at)
values
  ('70707070-0000-4000-8000-000000000003', '0d0d0d0d-0000-4000-8000-000000000011',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01', 'other', 'Sample kit never arrived',
   'Requested a laminate sample kit at the Jubilee Hills store three weeks ago. Following up.',
   'acknowledged', null, now() - interval '3 days', now() - interval '1 day', now() - interval '3 days' + interval '24 hours')
on conflict (id) do update set status = excluded.status;

update escalation set assigned_to = (select user_id from staff_user where email = 'demo.kam.hyd@materialdepot.com')
 where id = '70707070-0000-4000-8000-000000000003';

insert into escalation_comment (id, escalation_id, body, internal, author_side, created_at) values
  ('80808080-0000-4000-8000-000000000004', '70707070-0000-4000-8000-000000000003',
   'Checking with the Jubilee Hills sample desk, will confirm by tomorrow.', false, 'md', now() - interval '1 day')
on conflict (id) do nothing;

-- closed: old, on Chettinad — plausibly part of why the firm went quiet.
insert into escalation (id, partner_id, referral_id, category, subject, description,
                        status, raised_by, raised_at, acknowledged_at, resolved_at, closed_at,
                        resolution_note, ack_due_at)
values
  ('70707070-0000-4000-8000-000000000004', '0d0d0d0d-0000-4000-8000-000000000012',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02', 'delivery_delay', 'Lakeview order arrived three weeks late',
   'Delivery for ENQDEMO0000005 was quoted at 10 days and took 31. Site was idle most of that time.',
   'closed', null, now() - interval '200 days', now() - interval '199 days', now() - interval '190 days',
   now() - interval '185 days', 'Warehouse capacity issue at the time, since resolved. One-time goodwill credit issued.',
   now() - interval '200 days' + interval '24 hours')
on conflict (id) do update set status = excluded.status;

-- reopened: the SAME issue Studio Terra thought was resolved, back again.
insert into escalation (id, partner_id, referral_id, order_id, category, subject, description,
                        status, raised_by, raised_at, acknowledged_at, resolved_at, resolution_note, ack_due_at)
values
  ('70707070-0000-4000-8000-000000000005', '0d0d0d0d-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
   'wrong_item', 'Wrong tile size sent for the bedroom order — again',
   'Same 1200x600 vs 1800x1200 mix-up from three weeks ago. Second box on site has the wrong size again.',
   'reopened', (select user_id from partner_user where partner_id = '0d0d0d0d-0000-4000-8000-000000000001' limit 1),
   now() - interval '25 days', now() - interval '24 days', now() - interval '20 days',
   'Replacement boxes dispatched and confirmed on site — reopened when the SECOND delivery repeated the error.',
   now() - interval '25 days' + interval '24 hours')
on conflict (id) do update set status = excluded.status, description = excluded.description;

update escalation set assigned_to = (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com')
 where id = '70707070-0000-4000-8000-000000000005';

insert into escalation_comment (id, escalation_id, body, internal, author_side, created_at) values
  ('80808080-0000-4000-8000-000000000005', '70707070-0000-4000-8000-000000000005',
   'Reopening — the replacement batch has the same wrong-size problem. Please send someone to check the warehouse pick list.',
   false, 'partner', now() - interval '1 day'),
  ('80808080-0000-4000-8000-000000000006', '70707070-0000-4000-8000-000000000005',
   'This is the second short-pick from the same bin. Escalating to the warehouse lead, not just re-dispatching.',
   true, 'md', now() - interval '20 hours')
on conflict (id) do nothing;

-- ============================================================================
-- 5. VISIT REQUESTS — all four `visit_request.status` values.
-- ============================================================================

insert into visit_request (id, referral_id, ec_name, scheduled_on, scheduled_time, categories, requirements,
                           status, assigned_bm_name, assigned_bm_phone, assigned_bm_email, notes) values
  -- bm_assigned: Studio Terra, upcoming
  ('a0a0a0a0-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'Nikhil Rao',
   current_date + 4, '11:00 AM', array['Wooden Flooring','Laminates'], 'Want to compare the two oak finishes in person before the kitchen order.',
   'bm_assigned', 'Deepak S', '9845771122', 'deepak.s@materialdepot.com', 'Confirmed for the Indiranagar store.'),

  -- completed: Aranya, Kapoor Builders
  ('a0a0a0a0-0000-4000-8000-000000000002', '30303030-0000-4000-8000-000000000001', 'Kapoor Builders — site engineer',
   current_date - 68, '3:00 PM', array['Tiles','Louvers & Panels'], 'Commercial rate discussion and slab-bay walkthrough.',
   'completed', 'Sandeep K', '9845771133', 'sandeep.k@materialdepot.com', 'Led straight to ENQDEMOAR0001.'),

  -- requested: Aranya, Reddy Family — still under review, no BM yet
  ('a0a0a0a0-0000-4000-8000-000000000003', '30303030-0000-4000-8000-000000000003', 'Reddy Family',
   current_date + 6, '5:30 PM', array['Tiles'], 'First visit, browsing only.',
   'requested', null, null, null, null),

  -- cancelled: Verandah
  ('a0a0a0a0-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01', 'Raghav Builders',
   current_date - 5, '1:00 PM', array['Tiles'], null,
   'cancelled', null, null, null, 'Client postponed the site visit indefinitely.')
on conflict (id) do update set
  status = excluded.status, scheduled_on = excluded.scheduled_on, notes = excluded.notes,
  assigned_bm_name = excluded.assigned_bm_name, assigned_bm_phone = excluded.assigned_bm_phone,
  assigned_bm_email = excluded.assigned_bm_email;

-- ============================================================================
-- 6. TEAM INVITES — all three `partner_team_invite.status` values, and one
-- actually provisioned into a working second login for Aranya.
-- ============================================================================

insert into partner_team_invite (id, partner_id, name, email, role, status, requested_by, requested_at) values
  ('b0b0b0b0-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000002',
   'Meera Iyer', 'meera.demo@example.in', 'design_team', 'requested',
   (select user_id from partner_user where partner_id = '1d1d1d1d-0000-4000-8000-000000000002' limit 1),
   now() - interval '2 days'),
  ('b0b0b0b0-0000-4000-8000-000000000003', '1d1d1d1d-0000-4000-8000-000000000002',
   'Farhan Sheikh', 'farhan.demo@example.in', 'design_team', 'rejected',
   (select user_id from partner_user where partner_id = '1d1d1d1d-0000-4000-8000-000000000002' limit 1),
   now() - interval '20 days')
on conflict (id) do update set status = excluded.status;

update partner_team_invite set
  reviewed_by = (select user_id from staff_user where email = 'demo.admin@materialdepot.com'),
  reviewed_at = now() - interval '18 days',
  review_note = 'We already have two design-team seats on this account — revisit once the clubhouse project wraps.'
where id = 'b0b0b0b0-0000-4000-8000-000000000003';

do $$
declare v_associate uuid;
begin
  select id into v_associate from auth.users where email = 'demo.aranya.associate@materialdepot.com';
  if v_associate is null then
    raise notice 'demo.aranya.associate@materialdepot.com not found in auth.users yet — create it (see 003_README.md), then re-run this file.';
  else
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_associate;
    insert into partner_user (user_id, partner_id, role, title)
    values (v_associate, '1d1d1d1d-0000-4000-8000-000000000002', 'associate', 'Procurement')
    on conflict (user_id) do update set partner_id = excluded.partner_id, title = excluded.title;

    insert into partner_team_invite (id, partner_id, name, email, role, status, requested_by, requested_at,
                                     reviewed_by, reviewed_at, provisioned_user_id) values
      ('b0b0b0b0-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002',
       'Kabir Rao', 'demo.aranya.associate@materialdepot.com', 'procurement', 'approved',
       (select user_id from partner_user where partner_id = '1d1d1d1d-0000-4000-8000-000000000002' and role = 'principal'),
       now() - interval '30 days',
       (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), now() - interval '29 days',
       v_associate)
    on conflict (id) do update set status = excluded.status, provisioned_user_id = excluded.provisioned_user_id;
  end if;
end $$;

-- ============================================================================
-- 7. NOTIFICATION PREFERENCES — two firms with an explicit, non-default row;
-- everyone else stays on the "no row = everything on" default on purpose.
-- ============================================================================

insert into notification_pref (partner_id, prefs) values
  ('1d1d1d1d-0000-4000-8000-000000000002',
   '{"cashback_confirmed": {"whatsapp": false}, "escalation_update": {"in_app": true, "email": true, "whatsapp": true}}'::jsonb),
  ('0d0d0d0d-0000-4000-8000-000000000011',
   '{"reward_unlocked": {"email": false}}'::jsonb)
on conflict (partner_id) do update set prefs = excluded.prefs, updated_at = now();

-- ============================================================================
-- 8. PORTFOLIO — real photographs on Studio Terra's existing three rows
-- (submitted with cover_url/image_urls null until now), plus Aranya's
-- 'published' and 'rejected' rows — the fourth `status` value nothing else
-- in this dataset used.
-- ============================================================================

update portfolio_item set
  cover_url = 'https://palette.materialdepot.com/cdn-img/azure/application_image/livingroom-with-decorative-wall-mouldings-medres.jpg?width=800&format=webp',
  image_urls = jsonb_build_array(
    'https://palette.materialdepot.com/cdn-img/azure/application_image/livingroom-with-decorative-wall-mouldings-medres.jpg?width=800&format=webp',
    'https://palette.materialdepot.com/cdn-img/azure/application_image/dining-wall-01-original_medres.jpg?width=800&format=webp',
    'https://palette.materialdepot.com/cdn-img/azure/application_image/bedroom-with-multiple-arches_medres.jpg?width=800&format=webp',
    'https://palette.materialdepot.com/cdn-img/azure/application_image/bathroom-indian-linear-layout-original_medres.png?width=800&format=webp'
  ),
  inspiration = 'The client wanted the whole apartment to feel like one continuous material story instead of a room-by-room catalogue.',
  rough_cost = 3800000,
  aspects_covered = array['Flooring','Feature Walls','Lighting','Furniture']
where id = '0b0b0b0b-0000-4000-8000-000000000001';

update portfolio_item set
  cover_url = 'https://palette.materialdepot.com/cdn-img/azure/application_image/L-shape-highlighter-subway-tile-bathroom-linear-layout-medres.jpg?width=800&format=webp',
  image_urls = jsonb_build_array(
    'https://palette.materialdepot.com/cdn-img/azure/application_image/L-shape-highlighter-subway-tile-bathroom-linear-layout-medres.jpg?width=800&format=webp',
    'https://palette.materialdepot.com/cdn-img/azure/application_image/linear-kitchen-kitchen-highres-original_medres.png?width=800&format=webp'
  ),
  inspiration = 'Anti-skid porcelain underfoot and a hand-glazed subway counter wall the customers actually lean on.',
  rough_cost = 1400000,
  aspects_covered = array['Flooring','Counters']
where id = '0b0b0b0b-0000-4000-8000-000000000002';

insert into portfolio_item (id, partner_id, title, summary, project_type, city, cover_url, image_urls,
                            inspiration, rough_cost, aspects_covered, credits, status, submitted_at,
                            reviewed_at, review_note, reviewed_by, sort_order) values
  ('c0c0c0c0-0000-4000-8000-000000000001', '1d1d1d1d-0000-4000-8000-000000000002',
   'Kapoor Builders Clubhouse, Sarjapur',
   'A 6,200 sqft clubhouse lobby and lounge — Moroccan floor tile underfoot and a fluted TV feature wall in the lounge.',
   'commercial', 'Bengaluru',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/designer-tvunit-with-curved-featurewall-medres.jpg?width=800&format=webp',
   jsonb_build_array(
     'https://palette.materialdepot.com/cdn-img/azure/application_image/designer-tvunit-with-curved-featurewall-medres.jpg?width=800&format=webp',
     'https://palette.materialdepot.com/cdn-img/azure/application_image/floating-tv-console-feature-wall-medres.jpg?width=800&format=webp'
   ),
   'The association wanted the clubhouse to feel like a boutique hotel lobby, not a leftover amenity space.',
   6200000, array['Flooring','Feature Walls','Furniture'], 'Photography by Aranya Architects',
   'published', now() - interval '20 days', now() - interval '15 days',
   'Strong set, the feature wall shot especially. Going on the partners page.',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), 0),

  ('c0c0c0c0-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002',
   'Duplex Renovation, Sarjapur',
   'A full duplex reno — before/after story across three floors.',
   'residential', 'Bengaluru',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/bedroom-floor-wall02-original_medres.jpg?width=800&format=webp',
   jsonb_build_array('https://palette.materialdepot.com/cdn-img/azure/application_image/bedroom-floor-wall02-original_medres.jpg?width=800&format=webp'),
   null, 4100000, array['Flooring'], null,
   'rejected', now() - interval '12 days', now() - interval '10 days',
   'These look upscaled from thumbnails — please resend at full resolution before we can list it.',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), 1)
on conflict (id) do update set
  title = excluded.title, cover_url = excluded.cover_url, image_urls = excluded.image_urls,
  status = excluded.status, review_note = excluded.review_note;

-- ============================================================================
-- 9. PROJECTS (mood boards) — the tab 007 shipped and almost nothing has
-- populated. Deliberately separate from `project` (the opt-in workspace) —
-- every firm gets this regardless of workspace_enabled.
-- ============================================================================

insert into studio_project (id, partner_id, name, description, project_type, city, referral_id, cover_url) values
  ('d0d0d0d0-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000001',
   'Sharma Weekend Home — Mood Board', 'Reference board built ahead of the formal design brief.',
   'residential', 'Bengaluru', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/bedroom-with-louver-wallpaper-combo_medres.jpg?width=800&format=webp'),
  ('d0d0d0d0-0000-4000-8000-000000000002', '0d0d0d0d-0000-4000-8000-000000000001',
   'Personal Farmhouse Inspiration', 'Not tied to a client yet — just what caught our eye for the Nandi Hills plot.',
   'other', 'Chikkaballapur', null,
   'https://palette.materialdepot.com/cdn-img/azure/application_image/terrace-highres-original_medres.jpeg?width=800&format=webp'),
  ('d0d0d0d0-0000-4000-8000-000000000003', '1d1d1d1d-0000-4000-8000-000000000002',
   'Kapoor Builders — Clubhouse Interiors', 'Lobby, lounge and washroom references for the Sarjapur clubhouse.',
   'commercial', 'Bengaluru', '30303030-0000-4000-8000-000000000001',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/floating-tv-unit-with-louver-laminate_medres.jpg?width=800&format=webp'),
  ('d0d0d0d0-0000-4000-8000-000000000004', '1d1d1d1d-0000-4000-8000-000000000002',
   'Whitefield Heights — Sample Villa', 'Kitchen and bedroom suite references for the association''s show unit.',
   'residential', 'Bengaluru', '30303030-0000-4000-8000-000000000002',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/kitchen-mockup-original.jpeg?width=800&format=webp')
on conflict (id) do update set name = excluded.name, description = excluded.description, cover_url = excluded.cover_url;

insert into studio_project_space (id, project_id, name, sort_order) values
  ('e0e0e0e0-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001', 'Living Room Moodboard', 1),
  ('e0e0e0e0-0000-4000-8000-000000000002', 'd0d0d0d0-0000-4000-8000-000000000001', 'Master Bath Ideas', 2),
  ('e0e0e0e0-0000-4000-8000-000000000003', 'd0d0d0d0-0000-4000-8000-000000000002', 'Outdoor & Terrace', 1),
  ('e0e0e0e0-0000-4000-8000-000000000004', 'd0d0d0d0-0000-4000-8000-000000000003', 'Lobby & Lounge', 1),
  ('e0e0e0e0-0000-4000-8000-000000000005', 'd0d0d0d0-0000-4000-8000-000000000003', 'Washrooms', 2),
  ('e0e0e0e0-0000-4000-8000-000000000006', 'd0d0d0d0-0000-4000-8000-000000000004', 'Kitchen', 1),
  ('e0e0e0e0-0000-4000-8000-000000000007', 'd0d0d0d0-0000-4000-8000-000000000004', 'Bedroom Suite', 2)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into studio_project_item (id, space_id, kind, url, caption, source, sort_order) values
  -- Sharma — Living Room Moodboard
  ('f0f0f0f0-0000-4000-8000-000000000001', 'e0e0e0e0-0000-4000-8000-000000000001', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/livingroom-with-rectangular-wall-mouldings-medres.jpg?width=800&format=webp',
   'Moulding detail we liked for the TV wall', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000002', 'e0e0e0e0-0000-4000-8000-000000000001', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/living-room-floor-highres-original_medres.jpeg?width=800&format=webp',
   'Floor tone reference', 'palette', 2),
  ('f0f0f0f0-0000-4000-8000-000000000003', 'e0e0e0e0-0000-4000-8000-000000000001', 'palette_link',
   'https://palette.materialdepot.com/?scene=living-room-with-arch-mouldings-original',
   'Same scene, open in Palette to try our own tile', 'palette', 3),
  ('f0f0f0f0-0000-4000-8000-000000000004', 'e0e0e0e0-0000-4000-8000-000000000001', 'product_link',
   'https://materialdepot.com/tl-05697-moroccan-floor-wall-tile-zellige-star-taupe-12-x-12-inch-vitrified-finish-9-mm/product',
   'TL 05697 — for the console table backsplash', 'manual', 4),
  -- Sharma — Master Bath Ideas
  ('f0f0f0f0-0000-4000-8000-000000000005', 'e0e0e0e0-0000-4000-8000-000000000002', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/marble-subway-split-half-bathroom-medres.jpg?width=800&format=webp',
   'Split-half layout, marble upper / subway lower', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000006', 'e0e0e0e0-0000-4000-8000-000000000002', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/highlighter-shower-basin-area-with-subway-tiles-medres.jpg?width=800&format=webp',
   'Highlighter band idea for the shower niche', 'palette', 2),
  ('f0f0f0f0-0000-4000-8000-000000000007', 'e0e0e0e0-0000-4000-8000-000000000002', 'product_link',
   'https://materialdepot.com/tl-04961-e-subway-wall-tile-piedra-seam-silver-12-x-3-inch-ceramic-matte-finish-6-5-mm/product',
   'TL 04961 E — close to the lower-wall subway shown here', 'manual', 3),
  -- Farmhouse — Outdoor & Terrace
  ('f0f0f0f0-0000-4000-8000-000000000008', 'e0e0e0e0-0000-4000-8000-000000000003', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/balcony01-original_medres.jpg?width=800&format=webp',
   'Deck tile tone for the pool-facing terrace', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000009', 'e0e0e0e0-0000-4000-8000-000000000003', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/house-entry-area-with-parking-medres.jpg?width=800&format=webp',
   'Driveway and entry paving reference', 'palette', 2),
  ('f0f0f0f0-0000-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-000000000003', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/entry-area-with-ceiling-louvers-medres.jpg?width=800&format=webp',
   'Louvered ceiling over the porch', 'palette', 3),
  -- Aranya — Kapoor Builders, Lobby & Lounge
  ('f0f0f0f0-0000-4000-8000-00000000000b', 'e0e0e0e0-0000-4000-8000-000000000004', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/floating-tv-unit-with-louver-laminate_medres.jpg?width=800&format=webp',
   'Lounge feature wall direction the board liked', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-00000000000c', 'e0e0e0e0-0000-4000-8000-000000000004', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/designer-tv-unit-with-side-shelves-medres.jpg?width=800&format=webp',
   'Alternate — side shelving instead of a full media wall', 'palette', 2),
  ('f0f0f0f0-0000-4000-8000-00000000000d', 'e0e0e0e0-0000-4000-8000-000000000004', 'product_link',
   'https://materialdepot.com/tl-05724-moroccan-floor-wall-tile-radiance-gilded-tesserae-2-ft-x-2-ft-vitrified-finish-9-mm/product',
   'TL 05724 — lobby floor, matches the gold accent in the branding', 'manual', 3),
  ('f0f0f0f0-0000-4000-8000-00000000000e', 'e0e0e0e0-0000-4000-8000-000000000004', 'palette_link',
   'https://palette.materialdepot.com/?category=Living Room', 'Browsing more lounge scenes here', 'palette', 4),
  -- Aranya — Kapoor Builders, Washrooms
  ('f0f0f0f0-0000-4000-8000-00000000000f', 'e0e0e0e0-0000-4000-8000-000000000005', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/moroccan-style-bathroom-linear-layout-medres.jpg?width=800&format=webp',
   'Common washroom, linear layout', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000010', 'e0e0e0e0-0000-4000-8000-000000000005', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/basin-accent-wall_medres.jpg?width=800&format=webp',
   'Accent wall behind the basin counter', 'palette', 2),
  -- Aranya — Whitefield Heights, Kitchen
  ('f0f0f0f0-0000-4000-8000-000000000011', 'e0e0e0e0-0000-4000-8000-000000000006', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/linear-kitchen-kitchen-highres-original_medres.png?width=800&format=webp',
   'Layout reference for the show-unit kitchen', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000012', 'e0e0e0e0-0000-4000-8000-000000000006', 'product_link',
   'https://materialdepot.com/wp-02269-c-wk150-44-9-5-meter-x-20-8-inch-florals-look-wallpaper-57-sq-ft/product',
   'WP 02269 C — shortlisted for the breakfast nook wall', 'manual', 2),
  -- Aranya — Whitefield Heights, Bedroom Suite
  ('f0f0f0f0-0000-4000-8000-000000000013', 'e0e0e0e0-0000-4000-8000-000000000007', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/bedroom-with-flat-mouldings-lights_medres.jpg?width=800&format=webp',
   'Headboard wall direction', 'palette', 1),
  ('f0f0f0f0-0000-4000-8000-000000000014', 'e0e0e0e0-0000-4000-8000-000000000007', 'image',
   'https://palette.materialdepot.com/cdn-img/azure/application_image/sliding-wardrobe_medres.jpg?width=800&format=webp',
   'Wardrobe finish reference', 'palette', 2)
on conflict (id) do update set url = excluded.url, caption = excluded.caption;

insert into studio_project_template (id, partner_id, name, accent_color, intro_note) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000001',
   'Signed Proposal', '#bd5318', 'Thank you for the opportunity to work on your home. Everything below reflects what we walked through together on site.'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '1d1d1d1d-0000-4000-8000-000000000002',
   'Client Presentation', '#3a4a8c', 'Prepared by Aranya Architects. All rates are indicative until the final BOQ is signed off.')
on conflict (id) do update set name = excluded.name, accent_color = excluded.accent_color, intro_note = excluded.intro_note;

-- ============================================================================
-- 10. OUTREACH — the seventh `outreach_prospect.stage` value 002 left out
-- (onboarded), retrofitted onto Verandah's own history.
-- ============================================================================

insert into outreach_prospect (id, firm_name, contact_name, phone, email, city, market, firm_type,
                               source, stage, owner_id, application_id, notes) values
  ('eeeeeeee-0000-4000-8000-000000000007', 'Verandah Interiors', 'Nithya Raghavan', '9701120011',
   'demo.verandah@example.in', 'Hyderabad', 'hyderabad', 'interior_designer', 'referral', 'onboarded',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   'dcdcdcdc-0000-4000-8000-000000000003',
   'Full circle — this is the prospect record behind the Verandah Interiors application and login.')
on conflict (id) do update set stage = excluded.stage, application_id = excluded.application_id;

-- Aranya's own application, source = 'inbound' — the one source value nothing
-- else in this dataset uses (002's three are all 'outreach').
insert into partner_application (id, firm_name, contact_name, phone, email, city, market, firm_type,
                                 gst, team_size, typical_projects, source, proposed_kam, status,
                                 reviewed_by, reviewed_at, review_note, partner_id, credentials_issued_at) values
  ('dcdcdcdc-0000-4000-8000-000000000004', 'Aranya Architects', 'Ritika Chandran', '9845667788',
   'demo.aranya@materialdepot.com', 'Bengaluru', 'bangalore', 'architect', '29AABCA9988K1Z4', '11-25',
   'Villas, boutique commercial fit-outs', 'inbound',
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'), 'provisioned',
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'), current_date - 300,
   'Called our inbound line directly asking to become a referral partner after buying as a walk-in client for a year.',
   '1d1d1d1d-0000-4000-8000-000000000002', current_date - 300)
on conflict (id) do update set status = excluded.status, partner_id = excluded.partner_id;

-- ============================================================================
-- Sanity check.
-- ============================================================================
select
  (select count(*) from partner)                                              as firms,
  (select count(*) from partner_user)                                        as logins,
  (select count(*) from staff_user)                                          as staff,
  (select count(distinct status) from referral)                              as referral_statuses_seen,
  (select count(distinct approval_status) from referral_order)               as order_approval_states_seen,
  (select count(distinct status) from escalation)                            as escalation_statuses_seen,
  (select count(distinct status) from visit_request)                         as visit_statuses_seen,
  (select count(distinct status) from partner_team_invite)                   as invite_statuses_seen,
  (select count(distinct status) from portfolio_item)                        as portfolio_statuses_seen,
  (select count(*) from studio_project)                                      as mood_board_projects,
  (select count(*) from studio_project_item)                                 as mood_board_items,
  (select count(*) from reward_claim where tier_id >= 3)                     as gold_tier_claims;

-- ============================================================================
-- TEARDOWN
--   delete from partner where id in ('1d1d1d1d-0000-4000-8000-000000000001',
--                                    '1d1d1d1d-0000-4000-8000-000000000002');
--   delete from partner_application where id like 'dcdcdcdc-0000-4000-8000-00000000000_'
--     and id not in (select id from partner_application limit 0); -- see 002's teardown for the rest
-- ============================================================================
