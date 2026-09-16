-- ============================================================================
-- DEMO DATA - the staff console
-- Target project: vmwvxwqzqxhwesjokztf. Run AFTER 003_roles.sql, 004_roles_rls.sql
-- and seed/001_demo.sql.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Idempotent: every row
-- has a fixed id, so re-running updates rather than duplicates.
--
-- THIS IS ALL INVENTED - firms, people, phone numbers, meeting notes and rupee
-- figures alike. This repo is public. Nothing real goes in here, ever.
--
-- Written in plain ASCII, with no dollar-quoted blocks, no apostrophes in prose
-- comments and no semicolons inside string literals. That is not fussiness: an
-- earlier version of this file was valid SQL, ran clean against Postgres 18, and
-- still died in the Supabase SQL Editor with `42P01 relation "another" does not
-- exist` - a parse of the words inside a string literal, which only happens when
-- something between the file and the server has lost track of the quoting. None
-- of those constructs is worth a second afternoon.
--
-- Staff logins cannot be created from SQL: an auth user is made by GoTrue, not
-- by an insert. So every staff row below is attached BY EMAIL to an auth user
-- if one exists, and skipped with a notice if it does not. To make them exist,
-- either create the five addresses in Authentication -> Users, or provision them
-- from /console/staff once one admin is bootstrapped - the bootstrap snippet is
-- in supabase/migrations/README.md.
-- ============================================================================

-- ------------------------------------------------------------ 1. the team
--
-- Two markets, each with its own outreach manager and its own KAM, which is the
-- segregation the B2B team actually runs on. The admin and the inbound manager
-- have no market: they work the whole list.
insert into staff_user (user_id, name, email, phone, role, market)
select u.id, v.name, v.email, v.phone, v.role, v.market
from (values
  ('demo.admin@materialdepot.com',       'Priya Menon',     '9845100001', 'admin',    null),
  ('demo.kam.blr@materialdepot.com',     'Rahul Desai',     '9845100002', 'kam',      'bangalore'),
  ('demo.kam.hyd@materialdepot.com',     'Fatima Sheikh',   '9845100003', 'kam',      'hyderabad'),
  ('demo.outreach.blr@materialdepot.com','Sneha Kulkarni',  '9845100004', 'outreach', 'bangalore'),
  ('demo.outreach.hyd@materialdepot.com','Arjun Reddy',     '9845100005', 'outreach', 'hyderabad'),
  ('demo.inbound@materialdepot.com',     'Vikram Nair',     '9845100006', 'inbound',  null)
) as v(email, name, phone, role, market)
join auth.users u on lower(u.email) = v.email
on conflict (user_id) do update set
  name = excluded.name, email = excluded.email, phone = excluded.phone,
  role = excluded.role, market = excluded.market, active = true;

-- If this comes back 0, none of the demo addresses exist in auth.users yet.
-- Create them in Authentication -> Users, or bootstrap one admin per
-- supabase/migrations/README.md, then run this file again. Everything below
-- still loads either way; the staff columns just stay null.
select count(*) as staff_rows_linked from staff_user;

-- --------------------------------------------- 2. the demo firm, in context
--
-- Studio Terra came in through outreach in Bangalore and has a KAM. The full
-- project workspace is ON for them, because the whole point of the seed is that the
-- design / quote / procurement tabs have something in them to look at. A real
-- firm starts with it off.
update partner set
  market            = 'bangalore',
  onboarding_source = 'outreach',
  workspace_enabled = true,
  kam_user_id       = (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'),
  onboarded_by      = (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com'),
  bio               = 'A five-person studio working on residential interiors and small hospitality projects across Bengaluru. Material-led, warm, and fond of terrazzo.',
  website           = 'https://example.com/studio-terra',
  instagram         = 'studioterra.demo',
  internal_note     = 'Responsive, sends briefs early. Wants the quote module - enabled 2 weeks in.'
where id = '0d0d0d0d-0000-4000-8000-000000000001';

-- ------------------------------------------- 3. two more firms, for contrast
--
-- Neither has a login yet, which is a real state: onboarded on paper, waiting on
-- credentials. They exist so the console classification and the reactivation
-- list have something in them:
--
--   Verandah Interiors - Hyderabad, 0 approved orders   -> Basic, never ordered
--   Chettinad Design Works - Bangalore, 5 approved, last one 140 days ago
--                                                       -> Power, and DORMANT
--
-- Power-and-dormant together is the case the reactivation list exists for: the
-- firm that used to buy a lot and stopped.
insert into partner (id, firm_name, contact_name, phone, email, city, market, firm_type,
                     onboarded_on, onboarding_source, workspace_enabled, kam_user_id, internal_note) values
  ('0d0d0d0d-0000-4000-8000-000000000011', 'Verandah Interiors', 'Nithya Raghavan', '9701120011',
   'demo.verandah@example.in', 'Hyderabad', 'hyderabad', 'interior_designer',
   current_date - 12, 'outreach', false,
   (select user_id from staff_user where email = 'demo.kam.hyd@materialdepot.com'),
   'Met at the Jubilee Hills store. Two live villas. Credentials issued, not signed in yet.'),
  ('0d0d0d0d-0000-4000-8000-000000000012', 'Chettinad Design Works', 'Karthik Subramanian', '9845120012',
   'demo.chettinad@example.in', 'Bengaluru', 'bangalore', 'design_build',
   current_date - 400, 'existing_client', false,
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'),
   'Was ordering monthly until March. Nothing since. Worth a call before the next project cycle.')
on conflict (id) do update set
  firm_name = excluded.firm_name, contact_name = excluded.contact_name, phone = excluded.phone,
  email = excluded.email, city = excluded.city, market = excluded.market,
  firm_type = excluded.firm_type, onboarding_source = excluded.onboarding_source,
  kam_user_id = excluded.kam_user_id, internal_note = excluded.internal_note;

insert into referral (id, partner_id, client_name, md_phone, referred_on, notes) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01', '0d0d0d0d-0000-4000-8000-000000000012',
   'Raghav Builders', '9845220011', current_date - 380, 'Repeat trade client.'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02', '0d0d0d0d-0000-4000-8000-000000000012',
   'Lakeview Residences', '9845220022', current_date - 260, 'Four-unit apartment fit-out.')
on conflict (id) do update set client_name = excluded.client_name, md_phone = excluded.md_phone;

insert into referral_order (id, referral_id, md_enq_id, order_value, ordered_on, store, status, approval_status, approved_at) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccca01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01', 'ENQDEMO0000001', 210000, current_date - 370, 'Sarjapur',   'Delivered', 'approved', now() - interval '369 days'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccca02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01', 'ENQDEMO0000002', 165000, current_date - 300, 'Sarjapur',   'Delivered', 'approved', now() - interval '299 days'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccca03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02', 'ENQDEMO0000003', 402000, current_date - 250, 'Whitefield', 'Delivered', 'approved', now() - interval '249 days'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccca04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02', 'ENQDEMO0000004', 118000, current_date - 190, 'Whitefield', 'Delivered', 'approved', now() - interval '189 days'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccca05', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab02', 'ENQDEMO0000005', 240000, current_date - 140, 'Whitefield', 'Delivered', 'approved', now() - interval '139 days')
on conflict (id) do update set
  order_value = excluded.order_value, ordered_on = excluded.ordered_on,
  store = excluded.store, status = excluded.status, approval_status = excluded.approval_status;

-- --------------------------------------------- 4. the outreach pipeline
--
-- What a Bangalore and a Hyderabad outreach manager are each working. Stages run
-- to_contact -> contacted -> meeting_set -> met -> onboarding -> onboarded, and
-- anything that dies lands on not_interested rather than being deleted.
insert into outreach_prospect (id, firm_name, contact_name, phone, email, city, market, firm_type,
                               source, stage, owner_id, next_action_on, notes) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'Frame & Form Studio', 'Ananya Bhat', '9845330011',
   'demo.frameform@example.in', 'Bengaluru', 'bangalore', 'architect', 'instagram', 'meeting_set',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com'),
   current_date + 2, 'Wants to see the Whitefield slab bay before committing to anything.'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'Third Space Interiors', 'Rohan Gupta', '9845330022',
   'demo.thirdspace@example.in', 'Bengaluru', 'bangalore', 'interior_designer', 'walk_by', 'contacted',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com'),
   current_date + 5, 'Asked for the partner deck. Follow up Friday.'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'Courtyard Architects', 'Deepa Shenoy', '9845330033',
   'demo.courtyard@example.in', 'Bengaluru', 'bangalore', 'architect', 'referral', 'to_contact',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com'),
   current_date + 1, 'Referred by Studio Terra. Warm intro already made over WhatsApp.'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'Deccan Interior Co', 'Sai Prasad', '9701330044',
   'demo.deccan@example.in', 'Hyderabad', 'hyderabad', 'design_build', 'cold_call', 'met',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   current_date + 3, 'Good meeting. Wants the referral scheme in writing before signing up.'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'Banjara Studio', 'Meera Rao', '9701330055',
   'demo.banjara@example.in', 'Hyderabad', 'hyderabad', 'interior_designer', 'instagram', 'onboarding',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   current_date, 'Form filled and sent for verification.'),
  ('eeeeeeee-0000-4000-8000-000000000006', 'Kondapur Design Loft', 'Imran Qureshi', '9701330066',
   'demo.kondapur@example.in', 'Hyderabad', 'hyderabad', 'architect', 'cold_call', 'not_interested',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   null, 'Has a supplier tie-up until next year. Try again in Q2.')
on conflict (id) do update set
  firm_name = excluded.firm_name, contact_name = excluded.contact_name, phone = excluded.phone,
  email = excluded.email, city = excluded.city, market = excluded.market,
  stage = excluded.stage, owner_id = excluded.owner_id,
  next_action_on = excluded.next_action_on, notes = excluded.notes;

insert into outreach_touch (id, prospect_id, kind, occurred_at, outcome, note, by_user) values
  ('ffffffff-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'call',
   now() - interval '9 days', 'reached', 'Introduced the partner programme. Interested in the referral ladder.',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com')),
  ('ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001', 'whatsapp',
   now() - interval '4 days', 'replied', 'Sent the deck. Asked for a store walkthrough.',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com')),
  ('ffffffff-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'meeting',
   now() + interval '2 days', 'scheduled', 'Whitefield, 11am. Slab bay then the laminate wall.',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com')),
  ('ffffffff-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004', 'meeting',
   now() - interval '3 days', 'met', 'Their office, 45 minutes. Two villas and a clubhouse in the pipeline.',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com')),
  ('ffffffff-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000006', 'call',
   now() - interval '18 days', 'not_interested', 'Locked into a rival supplier until next year.',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'))
on conflict (id) do update set
  kind = excluded.kind, occurred_at = excluded.occurred_at,
  outcome = excluded.outcome, note = excluded.note;

-- ------------------------------------------ 5. applications, at three stages
--
--   submitted   -> sitting in the verification queue for an admin
--   approved    -> verified, credentials not generated yet
--   provisioned -> a login exists and the firm is on the platform
insert into partner_application (id, firm_name, contact_name, phone, email, city, market, firm_type,
                                 gst, team_size, typical_projects, met_on, meeting_notes, source,
                                 proposed_kam, status, created_by, reviewed_by, reviewed_at,
                                 review_note, partner_id, credentials_issued_at) values
  ('dcdcdcdc-0000-4000-8000-000000000001', 'Banjara Studio', 'Meera Rao', '9701330055',
   'demo.banjara@example.in', 'Hyderabad', 'hyderabad', 'interior_designer',
   '36AABCB1234C1Z9', '4-10', 'Residential interiors, 1500-3000 sqft villas',
   current_date - 2, 'Met at their Banjara Hills office. Four live projects. Buys tiles and laminates monthly from a local dealer and wants better rates and the sample service.',
   'outreach',
   (select user_id from staff_user where email = 'demo.kam.hyd@materialdepot.com'),
   'submitted',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   null, null, null, null, null),

  ('dcdcdcdc-0000-4000-8000-000000000002', 'Frame & Form Studio', 'Ananya Bhat', '9845330011',
   'demo.frameform@example.in', 'Bengaluru', 'bangalore', 'architect',
   null, '1-3', 'Boutique residential, occasional cafes',
   current_date - 6, 'Small practice, two principals. Comfortable with the referral model, wary of putting client pricing in a supplier portal - told them the workspace is optional and off by default.',
   'outreach',
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'),
   'approved',
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com'),
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'),
   now() - interval '1 day', 'GST not provided - fine for a sole practice. Verified the number on the call.',
   null, null),

  ('dcdcdcdc-0000-4000-8000-000000000003', 'Verandah Interiors', 'Nithya Raghavan', '9701120011',
   'demo.verandah@example.in', 'Hyderabad', 'hyderabad', 'interior_designer',
   '36AADCV5678D1Z2', '4-10', 'Villas and apartment fit-outs',
   current_date - 14, 'Two live villas in Kokapet. Wants to start with the referral scheme only.',
   'outreach',
   (select user_id from staff_user where email = 'demo.kam.hyd@materialdepot.com'),
   'provisioned',
   (select user_id from staff_user where email = 'demo.outreach.hyd@materialdepot.com'),
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com'),
   now() - interval '12 days', 'Verified. GST checked against the certificate they sent.',
   '0d0d0d0d-0000-4000-8000-000000000011', now() - interval '12 days')
on conflict (id) do update set
  firm_name = excluded.firm_name, status = excluded.status, market = excluded.market,
  meeting_notes = excluded.meeting_notes, review_note = excluded.review_note,
  partner_id = excluded.partner_id, credentials_issued_at = excluded.credentials_issued_at;

update outreach_prospect set application_id = 'dcdcdcdc-0000-4000-8000-000000000001'
 where id = 'eeeeeeee-0000-4000-8000-000000000005';

-- --------------------------------------------------------- 6. portfolios
--
-- One published, one waiting on the admin, one the firm is still writing. The
-- published one is frozen to the firm by policy - only review_portfolio_item()
-- can move it.
insert into portfolio_item (id, partner_id, title, summary, project_type, city, completed_on,
                            area_sqft, cover_url, image_urls, credits, status, submitted_at,
                            reviewed_at, review_note, sort_order) values
  ('0b0b0b0b-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000001',
   'Terrazzo House, Koramangala',
   'A 2,400 sqft duplex built around a terrazzo stair core, with warm oak and brushed brass throughout.',
   'residential', 'Bengaluru', current_date - 120, 2400, null, '[]'::jsonb,
   'Photography by the studio', 'published', now() - interval '40 days', now() - interval '35 days',
   'Lovely set. Going on the partners page.', 0),
  ('0b0b0b0b-0000-4000-8000-000000000002', '0d0d0d0d-0000-4000-8000-000000000001',
   'Ficus Cafe, Indiranagar',
   'A 900 sqft cafe - anti-skid porcelain underfoot, hand-glazed subway on the counter wall.',
   'hospitality', 'Bengaluru', current_date - 60, 900, null, '[]'::jsonb,
   null, 'submitted', now() - interval '3 days', null, null, 1),
  ('0b0b0b0b-0000-4000-8000-000000000003', '0d0d0d0d-0000-4000-8000-000000000001',
   'Whitefield Apartment (draft)',
   null, 'residential', 'Bengaluru', null, null, null, '[]'::jsonb,
   null, 'draft', null, null, null, 2)
on conflict (id) do update set
  title = excluded.title, summary = excluded.summary, status = excluded.status,
  submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at,
  review_note = excluded.review_note, sort_order = excluded.sort_order;

-- ------------------------------------------------------- 7. what we did
--
-- The history of this firm with Material Depot, readable by the firm. Internal
-- rows (visible_to_partner = false) are the ones a KAM writes for themselves.
insert into partner_activity (id, partner_id, kind, title, detail, occurred_at, visible_to_partner, by_user) values
  ('0c0c0c0c-0000-4000-8000-000000000001', '0d0d0d0d-0000-4000-8000-000000000001', 'onboarded',
   'Welcome to Material Depot for Partners', 'Your account was created after the meeting at Whitefield.',
   now() - interval '210 days', true,
   (select user_id from staff_user where email = 'demo.outreach.blr@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000002', '0d0d0d0d-0000-4000-8000-000000000001', 'kam_assigned',
   'Rahul Desai is looking after your account', 'Your first point of contact for rates, samples and site queries.',
   now() - interval '209 days', true,
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000003', '0d0d0d0d-0000-4000-8000-000000000001', 'order_approved',
   'Order ENQ2026072884321 verified', 'Rs 3,84,500 added to your reward progress.',
   now() - interval '28 days', true,
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000004', '0d0d0d0d-0000-4000-8000-000000000001', 'reward',
   '30 GM silver coin unlocked', 'Courier arranged - your KAM will confirm the address.',
   now() - interval '30 days', true,
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000005', '0d0d0d0d-0000-4000-8000-000000000001', 'portfolio',
   'Terrazzo House is live on materialdepot.com', 'Published on the partners page.',
   now() - interval '35 days', true,
   (select user_id from staff_user where email = 'demo.admin@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000006', '0d0d0d0d-0000-4000-8000-000000000001', 'note',
   'Asked about the quote module', 'Wants to trial it on one project before moving anything real in.',
   now() - interval '14 days', false,
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com')),
  ('0c0c0c0c-0000-4000-8000-000000000007', '0d0d0d0d-0000-4000-8000-000000000012', 'note',
   'Gone quiet since March', 'Five orders then nothing. Call before the next project cycle starts.',
   now() - interval '20 days', false,
   (select user_id from staff_user where email = 'demo.kam.blr@materialdepot.com'))
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, detail = excluded.detail,
  occurred_at = excluded.occurred_at, visible_to_partner = excluded.visible_to_partner;

-- ============================================================================
-- Sanity check.
-- ============================================================================
select
  (select count(*) from staff_user)                                             as staff,
  (select count(*) from partner)                                                as firms,
  (select count(*) from partner where kam_user_id is not null)                  as firms_with_a_kam,
  (select count(*) from outreach_prospect)                                      as prospects,
  (select count(*) from partner_application where status = 'submitted')         as awaiting_verification,
  (select count(*) from referral_order where approval_status = 'pending')       as orders_awaiting_admin,
  (select count(*) from portfolio_item where status = 'submitted')              as portfolio_awaiting_review;

-- ============================================================================
-- TEARDOWN
--   delete from partner where id in ('0d0d0d0d-0000-4000-8000-000000000011',
--                                    '0d0d0d0d-0000-4000-8000-000000000012');
--   delete from outreach_prospect where id like 'eeeeeeee-%';
--   delete from partner_application where id like 'dcdcdcdc-%';
--   delete from staff_user where email like 'demo.%@materialdepot.com';
-- ============================================================================
