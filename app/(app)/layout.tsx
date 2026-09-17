import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/data/session'
import { Sidebar } from '@/components/shell/Sidebar'
import { Onboarding } from '@/components/shell/Onboarding'
import { Problem } from '@/components/ui'
import { cssVariables } from '@/lib/domain/theme'
import { Analytics } from '@/lib/analytics/Analytics'

/**
 * The partner app. Everything under here belongs to one architecture or design
 * firm, and nobody from Material Depot can read any of it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor()

  // A failed read is NOT treated as "no firm". Offering the sign-up form here
  // would let a partner create a second firm over the top of their real one.
  if (!actor.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Problem
          title="We could not load your workspace"
          detail={
            <>
              {actor.error}
              <br />
              <br />
              Nothing has been lost. If this persists, it usually means the database schema has not been
              applied yet — see <code>supabase/migrations/README.md</code>.
            </>
          }
        />
      </main>
    )
  }

  if (!actor.data) redirect('/login')

  // Material Depot's own people get the console, never this. A staff member
  // landing on a partner page would see an empty workspace and read it as the
  // app being broken.
  if (actor.data.kind === 'staff') redirect('/console')

  if (actor.data.kind === 'none') return <Onboarding email={actor.data.email} />

  const { partner, email } = actor.data

  /**
   * §13.3's theme, applied as a style attribute on the shell.
   *
   * Six CSS custom properties, set on the wrapper rather than injected into
   * `<head>`: it means no flash of the default palette before a stylesheet
   * arrives, it scopes the override to the partner app so the staff console can
   * never pick up a firm's colours, and `cssVariables()` is the ONLY thing that
   * decides which properties can be written — which is what keeps success,
   * warning and error off the list.
   */
  const theme = cssVariables(partner)

  return (
    <div className="flex min-h-dvh flex-col md:flex-row" style={theme ? parseStyle(theme) : undefined}>
      {/* §14.6 — the single instrumentation layer. Nothing else in the app
          touches a vendor SDK; components call `track()` with an `EV.*`
          constant, and this identifies the session (§14.6.3) so every event
          carries the firm as its GROUP key. */}
      <Analytics
        props={{
          org_id: partner.id,
          org_name: partner.firm_name,
          user_id: actor.data.userId,
          // §5.1's three partner designations are Owner/Admin, Design Team and
          // Procurement; this schema's `partner_user.role` is
          // principal/associate/viewer, from before the PRD. Mapped rather than
          // renamed, because renaming the column is a migration that touches
          // every policy and buys nothing until the roles actually differ in
          // what they can see — docs/roles.md records the pairing.
          role: PARTNER_ROLE[actor.data.role] ?? 'design',
          city: partner.city,
          pincode: partner.pincode ?? null,
          kam_id: partner.kam_user_id,
          org_status: 'live',
          current_slab: null,
          platform: 'web',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
          is_internal: false,
        }}
      />
      <Sidebar
        nav={{ kind: 'partner', workspaceEnabled: partner.workspace_enabled }}
        eyebrow="for Partners"
        footerTitle={partner.firm_name}
        footerSub={email ?? partner.phone}
        logoUrl={partner.logo_url}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const PARTNER_ROLE: Record<string, 'admin' | 'design' | 'procurement'> = {
  principal: 'admin',
  associate: 'design',
  viewer: 'procurement',
}

/** `--a:b;--c:d` → the style object React wants. */
function parseStyle(css: string): React.CSSProperties {
  const out: Record<string, string> = {}
  for (const pair of css.split(';')) {
    const i = pair.indexOf(':')
    if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1)
  }
  return out as React.CSSProperties
}
