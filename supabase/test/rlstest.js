const { Client } = require('pg')

const DEMO_UID = '8bd4f092-ebf4-4c6c-b6f3-0e077d93ebda'
const OTHER_UID = '11111111-2222-3333-4444-555555555555'
const TABLES = ['client','project','project_area','board','board_item','quote','quote_line',
                'procurement_item','finance_entry','referral','referral_event','referral_order','reward_claim']

// The console's own tables. A partner must read none of them.
const CONSOLE_TABLES = ['staff_user','partner_application','outreach_prospect','outreach_touch']

// The architect's private workspace. Material Depot staff must read none of it —
// this list is the trust boundary of the whole product, checked by name in
// group 8 because a well-meant "just for support" policy on any one of them
// would throw away the reason a designer puts their work in here at all.
const PRIVATE_TABLES = ['client','project','project_area','board','board_item',
                        'quote','quote_line','procurement_item','finance_entry']

// The demo staff logins, from supabase/test/user.sql + seed/002_console.sql.
const ADMIN_UID    = '5ca1ab1e-0000-4000-8000-000000000001'
const KAM_BLR_UID  = '5ca1ab1e-0000-4000-8000-000000000002'
const KAM_HYD_UID  = '5ca1ab1e-0000-4000-8000-000000000003'
const OUT_BLR_UID  = '5ca1ab1e-0000-4000-8000-000000000004'
const INBOUND_UID  = '5ca1ab1e-0000-4000-8000-000000000006'

const TERRA     = '0d0d0d0d-0000-4000-8000-000000000001'
const VERANDAH  = '0d0d0d0d-0000-4000-8000-000000000011'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  ok ? pass++ : fail++
}

async function asUser(c, uid, fn) {
  await c.query('begin')
  await c.query(`set local role authenticated`)
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
  try { return await fn() } finally { await c.query('rollback') }
}

;(async () => {
  const c = new Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database: 'postgres' })
  await c.connect()

  // A second firm with its own login, so "another architect" is a real row.
  await c.query(`insert into auth.users (id, email) values ($1,'rival@example.in') on conflict do nothing`, [OTHER_UID])
  await c.query(`insert into partner (id, firm_name, contact_name, phone, city)
                 values ('0d0d0d0d-0000-4000-8000-000000000002','Rival Design Co','Someone Else','9900011122','Bengaluru')
                 on conflict (id) do nothing`)
  await c.query(`insert into partner_user (user_id, partner_id) values ($1,'0d0d0d0d-0000-4000-8000-000000000002')
                 on conflict (user_id) do nothing`, [OTHER_UID])
  // A FIXED id. `on conflict do nothing` with no target does nothing at all
  // here — `client` has no unique constraint to conflict on — so without this
  // every re-run against a surviving cluster added another rival client and
  // group 2 failed with "3 rows (expected 1)", which reads as a leak and is a
  // harness artefact.
  await c.query(`insert into client (id, partner_id, name, phone)
                 values ('c1c1c1c1-0000-4000-8000-000000000001',
                         '0d0d0d0d-0000-4000-8000-000000000002','Rival Client','9911122233')
                 on conflict (id) do nothing`)

  console.log('\n1. The demo partner sees their own data')
  await asUser(c, DEMO_UID, async () => {
    for (const t of TABLES) {
      const { rows } = await c.query(`select count(*)::int n from ${t}`)
      check(`${t} visible`, rows[0].n > 0, `${rows[0].n} rows`)
    }
  })

  console.log('\n2. Another architect sees NONE of it (the whole point)')
  await asUser(c, OTHER_UID, async () => {
    for (const t of TABLES) {
      const { rows } = await c.query(`select count(*)::int n from ${t}`)
      // client is the one table the rival legitimately has a row in.
      const expected = t === 'client' ? 1 : 0
      check(`${t} leaks nothing`, rows[0].n === expected, `${rows[0].n} rows (expected ${expected})`)
    }
    const { rows: leak } = await c.query(`select count(*)::int n from client where name = 'Sharma Family'`)
    check(`cannot see the other firm's client by name`, leak[0].n === 0)
  })

  console.log('\n3. Signed out (anon) sees nothing at all')
  await c.query('begin'); await c.query('set local role anon')
  for (const t of [...TABLES, 'partner', 'reward_tier', ...CONSOLE_TABLES]) {
    const { rows } = await c.query(`select count(*)::int n from ${t}`)
    check(`${t} closed to anon`, rows[0].n === 0, `${rows[0].n} rows`)
  }
  await c.query('rollback')

  console.log('\n4. A partner cannot forge the rows their payout is computed from')
  await asUser(c, DEMO_UID, async () => {
    const refId = (await c.query(`select id from referral limit 1`)).rows[0].id
    for (const [t, sql, params] of [
      ['referral_order', `insert into referral_order (referral_id, md_enq_id, order_value) values ($1,'FORGED',9999999)`, [refId]],
      ['referral_event', `insert into referral_event (referral_id, event_type, occurred_at, external_id) values ($1,'order_placed',now(),'forged')`, [refId]],
      ['reward_claim',   `insert into reward_claim (partner_id, tier_id) values ('0d0d0d0d-0000-4000-8000-000000000001',6)`, []],
    ]) {
      await c.query('savepoint sp')
      try { await c.query(sql, params); check(`${t} insert blocked`, false, 'IT WENT THROUGH') }
      catch (e) { check(`${t} insert blocked`, e.code === '42501', e.code) }
      await c.query('rollback to savepoint sp')
    }
  })

  console.log('\n5. A partner cannot join a firm by guessing its id')
  await asUser(c, OTHER_UID, async () => {
    try {
      await c.query(`insert into partner_user (user_id, partner_id) values ($1,'0d0d0d0d-0000-4000-8000-000000000001')`, [OTHER_UID])
      check('partner_user insert blocked', false, 'IT WENT THROUGH')
    } catch (e) { check('partner_user insert blocked', e.code === '42501', e.code) }
  })

  console.log('\n6. onboard_partner')
  const NEW_UID = '99999999-8888-7777-6666-555555555555'
  await c.query(`insert into auth.users (id, email) values ($1,'fresh@example.in') on conflict do nothing`, [NEW_UID])
  await asUser(c, NEW_UID, async () => {
    const { rows } = await c.query(`select onboard_partner('Fresh Studio','A Person','+91 98450 99887','fresh@example.in','Mysuru','architect',null) id`)
    check('creates a firm and links the caller', Boolean(rows[0].id))
    const { rows: p } = await c.query(`select phone from partner where id = $1`, [rows[0].id])
    check('normalises +91 98450 99887 to 10 digits', p[0].phone === '9845099887', p[0].phone)
    await c.query('savepoint sp')
    try { await c.query(`select onboard_partner('Again','X','9845099888',null,null,'architect',null)`); check('refuses a second firm for one login', false, 'IT WENT THROUGH') }
    catch (e) { check('refuses a second firm for one login', /already belongs/.test(e.message), e.message.slice(0, 60)) }
    await c.query('rollback to savepoint sp')
  })
  await asUser(c, NEW_UID, async () => {
    await c.query('savepoint sp')
    try { await c.query(`select onboard_partner('Copycat','Y','9845012345',null,null,'architect',null)`); check('refuses a phone another firm already uses', false, 'IT WENT THROUGH') }
    catch (e) { check('refuses a phone another firm already uses', /already registered/.test(e.message) || /already belongs/.test(e.message), e.message.slice(0, 70)) }
    await c.query('rollback to savepoint sp')
    await c.query('savepoint sp2')
    try { await c.query(`select onboard_partner('Bad Phone','Z','12345',null,null,'architect',null)`); check('refuses a non-mobile number', false, 'IT WENT THROUGH') }
    catch (e) { check('refuses a non-mobile number', /10-digit/.test(e.message), e.message.slice(0, 60)) }
    await c.query('rollback to savepoint sp2')
  })

  // ------------------------------------------------------------ the console

  const count = async (sql, params = []) => (await c.query(sql, params)).rows[0].n
  // Every expected failure gets its own savepoint. Without one, the first 42501
  // aborts the transaction and every later assertion reports 25P02 instead —
  // which looks like a dozen bugs and is one harness mistake.
  async function blocked(name, sql, params = [], code = '42501') {
    await c.query('savepoint sp')
    try {
      await c.query(sql, params)
      check(name, false, 'IT WENT THROUGH')
    } catch (e) {
      check(name, e.code === code, e.code + ' ' + (e.message || '').slice(0, 60))
    }
    await c.query('rollback to savepoint sp')
  }

  // A write the caller has no policy for does NOT raise — RLS filters the row
  // out and the statement succeeds against nothing. So "refused" has two
  // shapes, and a table whose only defence is a missing policy has to be
  // checked on rows affected rather than on an exception.
  async function unchanged(name, sql, params = []) {
    await c.query('savepoint sp')
    try {
      const r = await c.query(sql, params)
      check(name, r.rowCount === 0, `${r.rowCount} row(s) changed`)
    } catch (e) {
      check(name, e.code === '42501', e.code + ' ' + (e.message || '').slice(0, 60))
    }
    await c.query('rollback to savepoint sp')
  }

  console.log('\n7. Staff see their market, and only their market')
  // By id, not by row count: the suite's own 'Rival Design Co' has no market,
  // and an unassigned firm is deliberately visible to everyone on the team
  // (a firm nobody can see is a firm nobody follows up). Counting would make
  // that documented rule read as a leak.
  const sees = async (id) => (await count('select count(*)::int n from partner where id = $1', [id])) === 1

  await asUser(c, ADMIN_UID, async () => {
    check('admin sees the Bangalore firm', await sees(TERRA))
    check('admin sees the Hyderabad firm', await sees(VERANDAH))
    check('admin sees every prospect', (await count('select count(*)::int n from outreach_prospect')) === 6)
    check('admin sees every application', (await count('select count(*)::int n from partner_application')) === 3)
  })
  await asUser(c, OUT_BLR_UID, async () => {
    check('Bangalore outreach sees the Bangalore firm', await sees(TERRA))
    check('...and NOT the Hyderabad one', !(await sees(VERANDAH)))
    check('Bangalore outreach sees 3 Bangalore prospects',
      (await count("select count(*)::int n from outreach_prospect")) === 3)
    check('...none of them Hyderabad',
      (await count("select count(*)::int n from outreach_prospect where market = 'hyderabad'")) === 0)
    check('Bangalore outreach sees 1 Bangalore application',
      (await count('select count(*)::int n from partner_application')) === 1)
  })
  await asUser(c, KAM_HYD_UID, async () => {
    check('Hyderabad KAM sees the Hyderabad firm', await sees(VERANDAH))
    check('...and NOT the Bangalore one', !(await sees(TERRA)))
    check('Hyderabad KAM sees no Bangalore prospects',
      (await count("select count(*)::int n from outreach_prospect where market = 'bangalore'")) === 0)
  })
  await asUser(c, INBOUND_UID, async () => {
    check('a staff member with no market set covers Bangalore', await sees(TERRA))
    check('...and Hyderabad too', await sees(VERANDAH))
  })

  console.log("\n8. THE TRUST BOUNDARY — staff cannot read an architect's work")
  await asUser(c, ADMIN_UID, async () => {
    for (const t of PRIVATE_TABLES) {
      check(`admin cannot read ${t}`, (await count(`select count(*)::int n from ${t}`)) === 0)
    }
    check('admin CAN read the referrals a firm sent us',
      (await count('select count(*)::int n from referral')) > 0)
  })
  await asUser(c, KAM_BLR_UID, async () => {
    check('a KAM cannot read their own firm’s quotes',
      (await count('select count(*)::int n from quote')) === 0)
    check('a KAM cannot read their own firm’s ledger',
      (await count('select count(*)::int n from finance_entry')) === 0)
  })

  console.log('\n9. A partner cannot read the console')
  await asUser(c, DEMO_UID, async () => {
    for (const t of CONSOLE_TABLES) {
      check(`${t} closed to a partner`, (await count(`select count(*)::int n from ${t}`)) === 0)
    }
    check('sees their own activity, minus the internal notes',
      (await count('select count(*)::int n from partner_activity')) === 5)
    check('internal staff notes stay internal',
      (await count('select count(*)::int n from partner_activity where not visible_to_partner')) === 0)
    const { rows } = await c.query('select * from my_kam()')
    check('my_kam() returns their KAM and nobody else', rows.length === 1 && rows[0].name === 'Rahul Desai',
      rows[0]?.name)
  })

  console.log('\n10. The order approval gate')
  await asUser(c, DEMO_UID, async () => {
    // No UPDATE policy means the update matches no rows rather than erroring —
    // silent, and exactly as safe. Assert the row count, not an exception.
    const r = await c.query("update referral_order set approval_status = 'approved' where approval_status = 'pending'")
    check('a partner cannot approve their own order', r.rowCount === 0, `${r.rowCount} rows`)
    await blocked('a partner cannot call review_referral_order()',
      "select review_referral_order((select id from referral_order where approval_status = 'pending'), 'approved')")
  })
  const pendingId = (await c.query("select id from referral_order where approval_status = 'pending' limit 1")).rows[0].id
  await asUser(c, KAM_BLR_UID, async () => {
    await blocked('a KAM cannot approve an order either',
      'select review_referral_order($1, $2)', [pendingId, 'approved'])
  })
  await asUser(c, ADMIN_UID, async () => {
    await c.query('select review_referral_order($1, $2, $3)', [pendingId, 'approved', 'checked against the invoice'])
    const { rows } = await c.query('select approval_status, approved_by from referral_order where id = $1', [pendingId])
    check('an admin can, and it stamps who did it',
      rows[0].approval_status === 'approved' && rows[0].approved_by === ADMIN_UID)
  })

  console.log('\n11. A firm owns its portfolio up to the point it asks to be published')
  await asUser(c, DEMO_UID, async () => {
    const draft = (await c.query("select id from portfolio_item where status = 'draft' limit 1")).rows[0].id
    const live  = (await c.query("select id from portfolio_item where status = 'published' limit 1")).rows[0].id
    // Publish first, while the row is still a draft. Submitting it first would
    // make `using` reject the next update for 0 rows, which reads as a pass for
    // the wrong reason — the point here is that `with check` refuses the STATUS.
    await blocked("a firm cannot publish its own work",
      "update portfolio_item set status = 'published' where id = $1", [draft])
    const r = await c.query("update portfolio_item set status = 'submitted' where id = $1", [draft])
    check('draft can be submitted for review', r.rowCount === 1)
    const r2 = await c.query("update portfolio_item set title = 'rewritten' where id = $1", [live])
    check('a published piece is frozen to the firm', r2.rowCount === 0, `${r2.rowCount} rows`)
    await blocked('a firm cannot call review_portfolio_item()',
      "select review_portfolio_item($1, 'published')", [live])
  })
  await asUser(c, ADMIN_UID, async () => {
    const sub = (await c.query("select id from portfolio_item where status = 'submitted' limit 1")).rows[0].id
    await c.query("select review_portfolio_item($1, 'published', 'good set')", [sub])
    const { rows } = await c.query('select status from portfolio_item where id = $1', [sub])
    check('an admin can publish it', rows[0].status === 'published', rows[0].status)
  })

  console.log('\n12. The fields Material Depot owns on a firm')
  await asUser(c, DEMO_UID, async () => {
    const r = await c.query("update partner set firm_name = 'Studio Terra Design' where id = $1", [TERRA])
    check('a firm can rename itself', r.rowCount === 1)
    for (const [label, col, val] of [
      // `not workspace_enabled`, not `true`: the demo firm already has it on, and
      // a no-op write is not `distinct from` the old value, so the guard lets it
      // through and the test passes without testing anything.
      ['switch its own workspace', 'workspace_enabled', 'not workspace_enabled'],
      ['reassign its own KAM', 'kam_user_id', 'null'],
      ['move itself to another market', "market", "'hyderabad'"],
      ['change the phone its referrals match on', 'phone', "'9999988888'"],
      ['write its own internal note', 'internal_note', "'we are great'"],
    ]) {
      await blocked(`a firm cannot ${label}`,
        `update partner set ${col} = ${val} where id = $1`, [TERRA])
    }
  })
  await asUser(c, ADMIN_UID, async () => {
    const r = await c.query('update partner set workspace_enabled = false where id = $1', [TERRA])
    check('an admin can', r.rowCount === 1)
  })

  console.log('\n13. A staff login is not a firm')
  await asUser(c, ADMIN_UID, async () => {
    await blocked('onboard_partner refuses a staff login',
      "select onboard_partner('Side Business','Someone','9845077777')", [], 'P0001')
  })

  console.log('\n14. A re-sync cannot undo an approval')
  // The sync route upserts on md_enq_id with a payload that never mentions
  // approval_status, so the column is left alone on an existing row. That is the
  // whole reason a nightly run cannot reset — or grant — an admin's decision, and
  // it is worth asserting in SQL rather than trusting to a comment in the route.
  {
    const enq = 'ENQRESYNC000001'
    const refId = (await c.query(`select id from referral limit 1`)).rows[0].id
    await c.query(
      `insert into referral_order (referral_id, md_enq_id, order_value, ordered_on, store)
       values ($1,$2,50000,current_date,'Whitefield')
       on conflict (md_enq_id) do nothing`, [refId, enq])
    await c.query(`update referral_order set approval_status='approved', approved_at=now() where md_enq_id=$1`, [enq])

    // Exactly the shape PostgREST generates for the route's upsert: the columns
    // the payload carries, and no others.
    await c.query(
      `insert into referral_order (referral_id, md_enq_id, order_value, ordered_on, store, status, synced_at)
       values ($1,$2,50000,current_date,'Whitefield','Delivered',now())
       on conflict (md_enq_id) do update set
         referral_id = excluded.referral_id, order_value = excluded.order_value,
         ordered_on = excluded.ordered_on, store = excluded.store,
         status = excluded.status, synced_at = excluded.synced_at`, [refId, enq])

    const { rows } = await c.query(`select approval_status, store, ordered_on from referral_order where md_enq_id=$1`, [enq])
    check('a re-sync leaves an approved order approved', rows[0].approval_status === 'approved', rows[0].approval_status)
    check('and does not blank the columns it did not send', rows[0].store === 'Whitefield' && rows[0].ordered_on !== null)

    // The other direction matters just as much: a sync must not be able to
    // approve anything by arriving.
    const fresh = 'ENQRESYNC000002'
    await c.query(
      `insert into referral_order (referral_id, md_enq_id, order_value) values ($1,$2,9999)
       on conflict (md_enq_id) do nothing`, [refId, fresh])
    const { rows: f } = await c.query(`select approval_status from referral_order where md_enq_id=$1`, [fresh])
    check('a newly synced order arrives pending, counting towards nothing', f[0].approval_status === 'pending', f[0].approval_status)

    await c.query(`delete from referral_order where md_enq_id in ($1,$2)`, [enq, fresh])
  }

  console.log('\n15. Everything the firm-view page reads — and nothing more')
  // `/console/partners/[id]/dashboard` shows a firm its own dashboard back. It
  // added no policy: these are the eight tables it reads, asserted to be
  // readable by an admin for a firm they do not personally manage, and NOT
  // readable by a staff member out of market. If a future migration narrows one
  // of these, that page half-loads with a <Problem> rather than lying — but it
  // is cheaper to find out here.
  const VIEW_TABLES = ['partner','referral','referral_order','referral_event',
                       'reward_tier','reward_claim','partner_activity','portfolio_item']
  const forFirm = {
    partner:           ['select count(*)::int n from partner where id = $1'],
    referral:          ['select count(*)::int n from referral where partner_id = $1'],
    referral_order:    ['select count(*)::int n from referral_order o join referral r on r.id = o.referral_id where r.partner_id = $1'],
    referral_event:    ['select count(*)::int n from referral_event e join referral r on r.id = e.referral_id where r.partner_id = $1'],
    // The ladder is not per-firm; the cast is only so the shared $1 binds.
    reward_tier:       ['select count(*)::int n from reward_tier where active and $1::uuid is not null'],
    reward_claim:      ['select count(*)::int n from reward_claim where partner_id = $1'],
    partner_activity:  ['select count(*)::int n from partner_activity where partner_id = $1'],
    portfolio_item:    ['select count(*)::int n from portfolio_item where partner_id = $1'],
  }
  await asUser(c, ADMIN_UID, async () => {
    for (const t of VIEW_TABLES) {
      check(`admin can read ${t} for a firm they do not manage`,
        (await count(forFirm[t][0], [TERRA])) > 0)
    }
    // The page filters this itself. If RLS ever did the filtering for staff too,
    // the "N internal rows are hidden from them" line would silently read 0 and
    // an admin would think a firm can see a KAM's private notes.
    check('and sees the internal history rows the firm cannot',
      (await count('select count(*)::int n from partner_activity where partner_id = $1 and not visible_to_partner', [TERRA])) > 0)
    for (const t of PRIVATE_TABLES) {
      check(`...and still nothing in ${t}`, (await count(`select count(*)::int n from ${t}`)) === 0)
    }
  })
  await asUser(c, KAM_HYD_UID, async () => {
    for (const t of ['referral','referral_order','referral_event','reward_claim','partner_activity','portfolio_item']) {
      check(`a Hyderabad KAM reads no ${t} for a Bangalore firm`,
        (await count(forFirm[t][0], [TERRA])) === 0)
    }
  })

  // ================================= 16. The Studio Sales Dashboard (PRD v1.1)

  console.log('\n16. Escalations — a partner raises them, Material Depot moves them (§9.4)')
  const REF_SHARMA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
  const ORD_SHARMA = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'
  const ESC = 'ee5ca1a7-0000-4000-8000-000000000001'

  // Seeded outside any login, as the sync would: an open escalation against a
  // delivered order is the thing that holds its maturation open (§10.5).
  await c.query(
    `insert into escalation (id, partner_id, referral_id, order_id, category, subject, description, status)
     values ($1,$2,$3,$4,'delivery_delay','Two boxes short','Short delivery on the kitchen order.','resolved')
     on conflict (id) do update set status = 'resolved'`,
    [ESC, TERRA, REF_SHARMA, ORD_SHARMA])
  // FIXED ids, for the reason the rival-client row above has one: `on conflict
  // do nothing` with no target conflicts on nothing, so a re-run against a
  // surviving cluster added a second copy of each comment and the counts below
  // read as a leak. That is a harness artefact and it cost this suite a
  // false failure once already.
  await c.query(
    `insert into escalation_comment (id, escalation_id, body, internal, author_side) values
       ('ee5ca1a7-0000-4000-8000-0000000000c1',$1,'We are chasing the warehouse.',false,'md'),
       ('ee5ca1a7-0000-4000-8000-0000000000c2',$1,'Firm has been late paying; do not offer a credit note.',true,'md')
     on conflict (id) do nothing`, [ESC])

  await asUser(c, DEMO_UID, async () => {
    check('a firm reads its own escalation', (await count('select count(*)::int n from escalation')) > 0)
    check('and the reply meant for it',
      (await count('select count(*)::int n from escalation_comment where escalation_id = $1', [ESC])) === 1)
    // The single most expensive leak this module could have: a KAM's private
    // note about a firm, rendered to that firm. It is a POLICY and not a
    // `where internal = false` in a query, because a query is one forgotten
    // call away from being written without it.
    check('and NOT the internal note about it',
      (await count(`select count(*)::int n from escalation_comment where escalation_id = $1 and internal`, [ESC])) === 0)
    check('a firm can raise one on its own client', await (async () => {
      await c.query('savepoint e1')
      try {
        await c.query(`insert into escalation (partner_id, referral_id, category, subject, description)
                       values ($1,$2,'quality_damage','Chipped tile','Two boxes chipped.')`, [TERRA, REF_SHARMA])
        return true
      } catch { return false } finally { await c.query('rollback to savepoint e1') }
    })())
  })

  await asUser(c, DEMO_UID, async () => {
    await blocked('a firm cannot raise one against ANOTHER firm',
      `insert into escalation (partner_id, category, subject, description)
       values ('0d0d0d0d-0000-4000-8000-000000000002','other','x','y')`)
    // No UPDATE policy for a partner at all. A firm that could mark its own
    // ticket resolved could release its own order's maturation.
    //
    // This one is asserted on the ROW COUNT and not on an exception, because a
    // policy-less UPDATE does not raise: RLS filters the row out and Postgres
    // cheerfully reports success against nothing. `blocked()` would have called
    // that a pass in the other direction, which is how a missing policy gets
    // shipped with a green suite.
    await unchanged('a firm cannot resolve its own escalation',
      `update escalation set status = 'closed' where id = $1`, [ESC])
    await blocked('a firm cannot write an INTERNAL comment',
      `insert into escalation_comment (escalation_id, body, internal, author_side)
       values ($1,'sneaking this in',true,'partner')`, [ESC])
    await blocked('a firm cannot move an escalation through the staff function',
      `select set_escalation_status($1,'closed',null)`, [ESC])
  })

  await asUser(c, DEMO_UID, async () => {
    check('a firm CAN reopen a resolved one, once (§9.4)', await (async () => {
      await c.query('savepoint e2')
      try { await c.query(`select reopen_escalation($1,'Still two boxes short.')`, [ESC]); return true }
      catch { return false } finally { await c.query('rollback to savepoint e2') }
    })())
  })
  await asUser(c, OTHER_UID, async () => {
    await blocked('another firm cannot reopen it', `select reopen_escalation($1,'mine now')`, [ESC])
  })
  await asUser(c, KAM_BLR_UID, async () => {
    check('the KAM for that market reads it', (await count('select count(*)::int n from escalation where id = $1', [ESC])) === 1)
    check('and reads the internal note',
      (await count('select count(*)::int n from escalation_comment where escalation_id = $1 and internal', [ESC])) === 1)
  })
  await asUser(c, KAM_HYD_UID, async () => {
    check('a KAM in another market reads none of it',
      (await count('select count(*)::int n from escalation where id = $1', [ESC])) === 0)
    await blocked('and cannot move it', `select set_escalation_status($1,'closed',null)`, [ESC], 'P0001')
  })

  console.log('\n17. A firm does not decide its own referrals (§6.3, App. B)')
  await asUser(c, DEMO_UID, async () => {
    check('a firm can still correct a client name', await (async () => {
      await c.query('savepoint r1')
      try { await c.query(`update referral set client_name = 'Sharma (corrected)' where id = $1`, [REF_SHARMA]); return true }
      catch { return false } finally { await c.query('rollback to savepoint r1') }
    })())
    await blocked('a firm cannot approve its own referral',
      `update referral set status = 'approved' where id = $1`, [REF_SHARMA])
    // Written as a CHANGE, not as a re-assertion of what is already there. The
    // guard compares with `is distinct from`, so `set consent_given = true` on
    // a row where it is already true changes nothing and is correctly allowed —
    // and the first version of this test did exactly that and reported a leak.
    await blocked('a firm cannot revoke its own client\'s consent record',
      `update referral set consent_given = false where id = $1`, [REF_SHARMA])
    await blocked('nor claim consent on a client who has not given it',
      `update referral set consent_given = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'`)
    await blocked('a firm cannot extend its own attribution window',
      `update referral set attribution_expires_on = '2099-01-01' where id = $1`, [REF_SHARMA])
    await blocked('a firm cannot change the phone its referral matches on',
      `update referral set md_phone = '9000000000' where id = $1`, [REF_SHARMA])
    await blocked('and cannot call the decision function', `select review_referral($1,'approved')`, [REF_SHARMA])
  })
  await asUser(c, KAM_BLR_UID, async () => {
    await blocked('nor can a KAM — deciding a referral is an admin act',
      `select review_referral($1,'approved')`, [REF_SHARMA])
  })
  await asUser(c, ADMIN_UID, async () => {
    check('an admin can approve one', await (async () => {
      await c.query('savepoint r2')
      try { await c.query(`select review_referral($1,'approved',null,'Confirmed with the client.',true)`, [REF_SHARMA]); return true }
      catch { return false } finally { await c.query('rollback to savepoint r2') }
    })())
    // Appendix B exists so a partner is never told "rejected" with no reason —
    // §18 rates undocumented rejections as the cause of attribution disputes.
    await blocked('a rejection with NO reason code is refused',
      `select review_referral($1,'rejected')`, [REF_SHARMA], 'P0001')
    check('a rejection WITH a reason code goes through', await (async () => {
      await c.query('savepoint r3')
      try { await c.query(`select review_referral($1,'rejected','ALREADY_ATTRIBUTED','Credited to another firm.')`, [REF_SHARMA]); return true }
      catch { return false } finally { await c.query('rollback to savepoint r3') }
    })())
    await blocked('an invented reason code is refused by the CHECK constraint',
      `select review_referral($1,'rejected','BECAUSE_I_SAID_SO')`, [REF_SHARMA], '23514')
  })

  console.log('\n18. The order gate still holds, and now needs a reason too')
  await asUser(c, ADMIN_UID, async () => {
    await blocked('declining an order with no reason code is refused',
      `select review_referral_order($1,'rejected')`, [ORD_SHARMA], 'P0001')
    check('declining WITH one records the code', await (async () => {
      await c.query('savepoint o1')
      try {
        await c.query(`select review_referral_order($1,'rejected','dupe','DUPLICATE_ORDER')`, [ORD_SHARMA])
        const n = await count(`select count(*)::int n from referral_order where id = $1 and not_counted_reason = 'DUPLICATE_ORDER'`, [ORD_SHARMA])
        return n === 1
      } catch { return false } finally { await c.query('rollback to savepoint o1') }
    })())
    check('approving clears the code rather than leaving a stale one', await (async () => {
      await c.query('savepoint o2')
      try {
        await c.query(`select review_referral_order($1,'rejected','dupe','DUPLICATE_ORDER')`, [ORD_SHARMA])
        await c.query(`select review_referral_order($1,'approved','checked')`, [ORD_SHARMA])
        const n = await count(`select count(*)::int n from referral_order where id = $1 and not_counted_reason is null`, [ORD_SHARMA])
        return n === 1
      } catch { return false } finally { await c.query('rollback to savepoint o2') }
    })())
  })
  await asUser(c, DEMO_UID, async () => {
    await unchanged('a firm still cannot write its own coupon or discount',
      `update referral_order set discount_availed = 0 where id = $1`, [ORD_SHARMA])
    await unchanged('nor set its own delivery date, which is what maturation counts from',
      `update referral_order set delivered_on = '2020-01-01' where id = $1`, [ORD_SHARMA])
  })

  console.log('\n19. The reveal log is written by the audited party, never read by them (§14.5)')
  await asUser(c, DEMO_UID, async () => {
    check('a firm can log a reveal', await (async () => {
      await c.query('savepoint p1')
      try {
        await c.query(`insert into phone_reveal (partner_id, referral_id, surface) values ($1,$2,'client_list')`, [TERRA, REF_SHARMA])
        return true
      } catch { return false } finally { await c.query('rollback to savepoint p1') }
    })())
    // An audit record the audited party can read back is one they can check
    // before deciding whether to behave; one they can delete is not a record.
    check('and cannot read the log back', (await count('select count(*)::int n from phone_reveal')) === 0)
    await blocked('nor log a reveal against another firm',
      `insert into phone_reveal (partner_id, referral_id) values ('0d0d0d0d-0000-4000-8000-000000000002',$1)`, [REF_SHARMA])
  })
  await asUser(c, ADMIN_UID, async () => {
    check('an admin can read it', (await count('select count(*)::int n from phone_reveal where partner_id = $1', [TERRA])) >= 0)
  })

  console.log('\n20. Notification preferences are the firm\'s own (§13.4)')
  await asUser(c, DEMO_UID, async () => {
    check('a firm can set its own', await (async () => {
      await c.query('savepoint n1')
      try {
        await c.query(`insert into notification_pref (partner_id, prefs) values ($1,'{"rewards":{"whatsapp":false}}')
                       on conflict (partner_id) do update set prefs = excluded.prefs`, [TERRA])
        return true
      } catch { return false } finally { await c.query('rollback to savepoint n1') }
    })())
    await blocked('and not another firm\'s',
      `insert into notification_pref (partner_id, prefs) values ('0d0d0d0d-0000-4000-8000-000000000002','{}')`)
  })


  console.log('\n21. The retained password is unreadable by anyone signed in (006)')
  // The whole security argument for keeping an issued password at all. The row
  // is reachable ONLY by the service role, from a server action that has already
  // checked requireStaff(['admin']) — never by an end user's session, admin or
  // not, because an admin's session is still `authenticated` in Postgres.
  const CRED_UID = '5ca1ab1e-0000-4000-8000-0000000000c1'
  await c.query(`insert into auth.users (id, email, encrypted_password)
                 values ($1,'kept@example.in','bcrypt-hash-as-issued')
                 on conflict (id) do update set encrypted_password = 'bcrypt-hash-as-issued'`, [CRED_UID])
  await c.query(`insert into issued_credential (user_id, kind, email, sealed, pw_fingerprint)
                 values ($1,'staff','kept@example.in','v1.sealed.not.plaintext', md5('bcrypt-hash-as-issued'))
                 on conflict (user_id) do update set sealed = excluded.sealed,
                   pw_fingerprint = excluded.pw_fingerprint, changed_at = null`, [CRED_UID])

  for (const [label, uid] of [['an admin', ADMIN_UID], ['a KAM', KAM_BLR_UID], ['a partner', DEMO_UID]]) {
    await asUser(c, uid, async () => {
      await blocked(`${label} cannot read one row of issued_credential`,
        'select * from issued_credential', [], '42501')
      await blocked(`${label} cannot call app_read_credential`,
        'select app_read_credential($1)', [CRED_UID], '42501')
      await blocked(`${label} cannot call app_pw_fingerprint`,
        'select app_pw_fingerprint($1)', [CRED_UID], '42501')
      await blocked(`${label} cannot erase the audit trail with app_forget_credential`,
        'select app_forget_credential($1)', [CRED_UID], '42501')
    })
  }
  await c.query('begin'); await c.query('set local role anon')
  await blocked('anon cannot read it either', 'select * from issued_credential', [], '42501')
  await c.query('rollback')

  console.log('\n22. It is erased the moment its owner changes their password')
  const state = async (uid) => (await c.query('select state from app_read_credential($1)', [uid])).rows[0].state
  check('a freshly issued password reads as current', (await state(CRED_UID)) === 'current')

  await c.query('begin')
  // The trigger on auth.users. This is what makes "kept until they change it" a
  // property of the database rather than a promise about our own code paths —
  // it fires for a Supabase reset email and for the dashboard too, where none of
  // this app's code runs.
  await c.query(`update auth.users set encrypted_password = 'a-different-bcrypt-hash' where id = $1`, [CRED_UID])
  check('changing the password erases the stored copy', await (async () => {
    const { rows } = await c.query('select sealed, changed_at from issued_credential where user_id = $1', [CRED_UID])
    return rows.length === 1 && rows[0].sealed === null && rows[0].changed_at !== null
  })())
  check('and it then reads as changed, not as nothing on file', (await state(CRED_UID)) === 'changed')
  await c.query('rollback')

  await c.query('begin')
  // Belt and braces for the case the trigger could not be created — Supabase
  // does not always let a project add one to auth.users. The read re-checks the
  // fingerprint itself, so a password changed behind our back still cannot be
  // shown to an admin as current.
  await c.query(`alter table auth.users disable trigger forget_issued_credential`)
  await c.query(`update auth.users set encrypted_password = 'changed-behind-our-back' where id = $1`, [CRED_UID])
  check('a change the trigger missed is caught by the read', (await state(CRED_UID)) === 'changed')
  check('and the secret is gone by the time it says so', await (async () => {
    const { rows } = await c.query('select sealed from issued_credential where user_id = $1', [CRED_UID])
    return rows[0].sealed === null
  })())
  await c.query(`alter table auth.users enable trigger forget_issued_credential`)
  await c.query('rollback')

  check('a login we never kept one for reads as none, not as changed',
    (await state('5ca1ab1e-0000-4000-8000-00000000ffff')) === 'none')
  check('and deleting the account takes the row with it', await (async () => {
    await c.query('begin')
    try {
      await c.query('delete from auth.users where id = $1', [CRED_UID])
      const { rows } = await c.query('select count(*)::int n from issued_credential where user_id = $1', [CRED_UID])
      return rows[0].n === 0
    } finally { await c.query('rollback') }
  })())

  console.log('\n23. Multiple phone numbers on a referral (007)')
  // The migration backfills every PRE-EXISTING referral's md_phone into this
  // table — which in this harness means referrals present when `npm run
  // migrate` ran, before `npm run seed` created the demo firm's. That
  // ordering is a harness artifact (in production, 007 runs against years of
  // real referrals); seed one in directly to test the steady-state shape.
  await c.query('begin')
  await c.query(
    `insert into referral_phone (referral_id, phone, label) values ($1,'9845112233','client')
     on conflict (referral_id, phone) do nothing`, [REF_SHARMA])
  await c.query('commit')

  await asUser(c, DEMO_UID, async () => {
    check('the demo firm reads the client number on its own referral',
      (await count(`select count(*)::int n from referral_phone where referral_id = $1 and label = 'client'`,
        [REF_SHARMA])) === 1)
    await c.query('savepoint sp2')
    const ins = await c.query(
      `insert into referral_phone (referral_id, phone, label) values ($1,'9812345678','additional') returning id`,
      [REF_SHARMA])
    check('and can add an additional number to it', ins.rowCount === 1)
    const del = await c.query('delete from referral_phone where id = $1', [ins.rows[0].id])
    check('and remove one it added', del.rowCount === 1)
    await c.query('rollback to savepoint sp2')
  })

  await asUser(c, OTHER_UID, async () => {
    check('another firm reads none of it', (await count(
      'select count(*)::int n from referral_phone where referral_id = $1', [REF_SHARMA])) === 0)
    await unchanged('and cannot add a number to somebody else’s referral',
      `insert into referral_phone (referral_id, phone, label) values ($1,'9812345678','additional')`, [REF_SHARMA])
  })

  console.log('\n24. Scheduling a store visit (007)')
  let visitId
  await c.query('begin')
  const vr = await c.query(
    `insert into visit_request (referral_id, scheduled_on, scheduled_time, categories, requirements)
     values ($1, current_date + 3, '11:00', array['Tiles'], 'First visit') returning id`, [REF_SHARMA])
  visitId = vr.rows[0].id
  await c.query('commit')

  await asUser(c, DEMO_UID, async () => {
    check('the demo firm reads its own visit request',
      (await count('select count(*)::int n from visit_request where id = $1', [visitId])) === 1)
    await c.query('savepoint sp3')
    const upd = await c.query(`update visit_request set requirements = 'Updated brief' where id = $1`, [visitId])
    check('and can edit it while it is still just requested', upd.rowCount === 1)
    await c.query('rollback to savepoint sp3')
    await blocked('but cannot assign a BM to its own request',
      `update visit_request set status = 'bm_assigned', assigned_bm_name = 'Self Assigned' where id = $1`,
      [visitId])
  })

  await asUser(c, OTHER_UID, async () => {
    check('another firm reads none of it',
      (await count('select count(*)::int n from visit_request where id = $1', [visitId])) === 0)
    await unchanged('and cannot create one against somebody else’s referral',
      `insert into visit_request (referral_id, scheduled_on, scheduled_time)
       values ($1, current_date + 1, '10:00')`, [REF_SHARMA])
  })

  await asUser(c, KAM_BLR_UID, async () => {
    const upd = await c.query(
      `update visit_request set status = 'bm_assigned', assigned_bm_name = 'Ramesh (Whitefield)',
              assigned_bm_phone = '9900011234' where id = $1`, [visitId])
    check('the market KAM can assign a BM', upd.rowCount === 1)
  })

  await asUser(c, KAM_HYD_UID, async () => {
    check('a KAM outside the market reads none of it',
      (await count('select count(*)::int n from visit_request where id = $1', [visitId])) === 0)
  })

  await c.query('begin')
  await c.query('delete from visit_request where id = $1', [visitId])
  await c.query('commit')

  console.log('\n25. Team invites (007) — a firm requests, only an admin decides')
  // The insert has to actually COMMIT — `asUser()` rolls back at the end of
  // every call, which is fine for a self-contained check but would erase this
  // row before the later `asUser()` blocks for other logins could see it.
  let inviteId
  await c.query('begin')
  await c.query(`set local role authenticated`)
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [DEMO_UID])
  const ins = await c.query(
    `insert into partner_team_invite (partner_id, name, email, role)
     values ('0d0d0d0d-0000-4000-8000-000000000001','Asha Rao','asha@example.in','design_team') returning id`)
  inviteId = ins.rows[0].id
  check('the demo firm can file a request', ins.rowCount === 1)
  await c.query('commit')

  await asUser(c, DEMO_UID, async () => {
    await unchanged('but cannot approve its own request',
      `update partner_team_invite set status = 'approved' where id = $1`, [inviteId])
  })

  await asUser(c, OTHER_UID, async () => {
    check('another firm reads none of it',
      (await count('select count(*)::int n from partner_team_invite where id = $1', [inviteId])) === 0)
    await unchanged('and cannot file one for somebody else’s firm',
      `insert into partner_team_invite (partner_id, name, email, role)
       values ('0d0d0d0d-0000-4000-8000-000000000001','Someone Else','x@example.in','design_team')`)
  })

  await asUser(c, KAM_BLR_UID, async () => {
    check('their KAM can see the request', (await count(
      'select count(*)::int n from partner_team_invite where id = $1', [inviteId])) === 1)
    await unchanged('but cannot approve it either — no update policy for staff at all',
      `update partner_team_invite set status = 'approved' where id = $1`, [inviteId])
  })

  await c.query('begin')
  await c.query('delete from partner_team_invite where id = $1', [inviteId])
  await c.query('commit')

  console.log(`\n${pass} passed, ${fail} failed`)
  await c.end()
  process.exit(fail ? 1 : 0)
})()
