import { currentSession } from '@/lib/data/session'
import { WorkspaceOff } from '@/components/shell/WorkspaceOff'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Mail, MapPin, Phone } from 'lucide-react'
import { getClient, listProjects, listReferralEvents, listReferralOrders, listReferrals } from '@/lib/data/queries'
import { PageHead } from '@/components/shell/PageHead'
import { ReferralFeed } from '@/components/referrals/ReferralFeed'
import { CartPanel } from '@/components/referrals/CartPanel'
import { cartState } from '@/lib/domain/referrals'
import { Badge, Card, CardHead, Empty, Problem, Stat } from '@/components/ui'
import { STAGES } from '@/lib/domain/project'
import { date, inr, inrShort } from '@/lib/format'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  // The project workspace is opt-in per firm. Checked here as well as in
  // the nav: a nav item that is merely hidden is still a URL anyone can type.
  const gate = await currentSession()
  if (gate.ok && gate.data && !gate.data.partner.workspace_enabled) return <WorkspaceOff what="Clients" />

  const { id } = await params
  const [client, projects, referrals] = await Promise.all([getClient(id), listProjects(), listReferrals()])

  if (!client.ok) {
    return (
      <>
        <PageHead title="Client" />
        <div className="px-4 py-5 md:px-6"><Problem title="This client could not be loaded" detail={client.error} /></div>
      </>
    )
  }
  if (!client.data) notFound()

  const c = client.data
  const mine = projects.ok ? projects.data.filter((p) => p.client_id === c.id) : []

  // Match this client to a referral EXACTLY, by id first and phone second.
  // Never by name: two clients called "Sharma" are not one person, and showing
  // one client another's store visits would be worse than showing nothing.
  const referral = referrals.ok
    ? (referrals.data.find((r) => r.client_id === c.id) ??
       (c.phone ? referrals.data.find((r) => r.md_phone === c.phone) : undefined))
    : undefined

  const [events, orders] = await Promise.all([
    listReferralEvents(referral ? [referral.id] : [], 40),
    listReferralOrders(referral ? [referral.id] : []),
  ])
  const spent = orders.ok ? orders.data.reduce((s, o) => s + Number(o.order_value || 0), 0) : 0
  const budget = mine.reduce((s, p) => s + Number(p.budget || 0), 0)

  return (
    <>
      <PageHead
        title={c.name}
        crumbs={[{ href: '/workspace/clients', label: 'Clients' }, { label: c.name }]}
        hint={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {c.phone ? <span className="tnum inline-flex items-center gap-1"><Phone size={12} /> {c.phone}</span> : null}
            {c.email ? <span className="inline-flex items-center gap-1"><Mail size={12} /> {c.email}</span> : null}
            {c.city || c.address ? (
              <span className="inline-flex items-center gap-1"><MapPin size={12} /> {c.address ?? c.city}</span>
            ) : null}
          </span>
        }
      />

      <div className="space-y-5 px-4 py-5 md:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Projects" value={mine.length} hint={mine.filter((p) => p.status === 'active').length + ' active'} />
          <Stat label="Budget on the books" value={budget ? inrShort(budget) : '—'} hint="Across their projects" />
          <Stat
            label="Bought from Material Depot"
            value={referral ? inr(spent) : '—'}
            hint={
              referral
                ? `${orders.ok ? orders.data.length : 0} order(s) — counts towards your rewards`
                : 'Not referred to us yet'
            }
            tone={referral && spent > 0 ? 'good' : undefined}
          />
        </div>

        <Card>
          <CardHead title="Projects" hint="Everything you are building for this client" />
          {mine.length === 0 ? (
            <Empty title="No projects yet" body="Create a project to start adding rooms and boards." />
          ) : (
            <ul className="divide-y divide-line">
              {mine.map((p) => (
                <li key={p.id}>
                  <Link href={`/workspace/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-faint">
                        started {date(p.started_on)}
                        {p.target_on ? ` · target ${date(p.target_on)}` : ''}
                      </p>
                    </div>
                    <Badge tone={p.stage === 'design' ? 'info' : p.stage === 'procurement' ? 'warn' : 'good'}>
                      {STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}
                    </Badge>
                    <ArrowRight size={14} className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead
            title="At Material Depot"
            hint={
              referral
                ? `Matched on ${referral.md_phone} — referred ${date(referral.referred_on)}`
                : 'Refer this client to see their store visits, carts and orders here'
            }
          />
          {!referral ? (
            <Empty
              title="Not referred yet"
              body="Refer them from the Referrals tab with their exact mobile number, and everything they do with us appears here — and counts towards your rewards."
              action={
                <Link href="/referrals" className="text-sm font-medium text-brand hover:underline">
                  Go to Referrals →
                </Link>
              }
            />
          ) : (
            <>
              {/* The cart first: a client with things in a cart and no order is
                  the one state on this page that is worth a phone call today. */}
              {events.ok ? (
                <div className="border-b border-line">
                  <CartPanel
                    cart={cartState(events.data, orders.ok ? orders.data : [])}
                    emptyBody="Nothing of theirs is sitting in a Material Depot cart right now."
                  />
                </div>
              ) : null}
              <ReferralFeed
                events={events.ok ? events.data : []}
                names={new Map([[referral.id, c.name]])}
                error={events.ok ? null : events.error}
                emptyBody="Nothing has come through for them yet."
              />
            </>
          )}
        </Card>
      </div>
    </>
  )
}
