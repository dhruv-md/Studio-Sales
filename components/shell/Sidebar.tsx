'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { consoleNav, partnerNav } from './nav'
import type { StaffRole } from '@/lib/domain/types'
import { supabaseBrowser } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'

/**
 * One sidebar, two apps. The partner app and the Material Depot console are
 * deliberately not styled differently for its own sake — but the eyebrow says
 * which one you are in, because a KAM and a partner can be signed in on the same
 * laptop and "whose screen am I looking at" has to be answerable at a glance.
 *
 * **`nav` describes which list to build; it is never the list itself.** A
 * `NavItem` carries a Lucide `icon`, which is a React component — a function.
 * Functions cannot cross the server/client boundary, so a layout passing
 * `items={consoleNav(role)}` throws *Functions cannot be passed directly to
 * Client Components* at render time and every page under that layout 500s.
 * `tsc` and `next build` both pass; only loading the page finds it. So the nav
 * is resolved HERE, inside the client component, from plain serialisable data.
 * See docs/landmines.md.
 */
type NavSpec =
  | { kind: 'partner'; workspaceEnabled: boolean }
  | { kind: 'console'; role: StaffRole }

export function Sidebar({
  nav,
  eyebrow,
  footerTitle,
  footerSub,
  tone = 'brand',
  logoUrl,
}: {
  nav: NavSpec
  eyebrow: string
  footerTitle: string
  footerSub: string | null
  tone?: 'brand' | 'ink'
  /** A partner's own logo (`partner.logo_url`). When set, this becomes the
   *  prominent mark and the Material Depot wordmark shrinks to a corner
   *  badge on it — on instruction, so the app reads as the firm's own rather
   *  than as a Material Depot product they are a tenant in. */
  logoUrl?: string | null
}) {
  const path = usePathname()
  const router = useRouter()

  const items =
    nav.kind === 'console'
      ? consoleNav(nav.role)
      : partnerNav({ workspace_enabled: nav.workspaceEnabled })

  async function signOut() {
    await supabaseBrowser().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-line bg-surface md:h-dvh md:w-60 md:border-r">
      <div className="border-b border-line px-4 py-4">
        {logoUrl ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt={footerTitle} className="h-10 max-w-[168px] object-contain object-left" />
            <p className="mt-1 text-right text-[9px] leading-tight font-medium tracking-wide text-ink-faint uppercase">
              Material Depot <span className={tone === 'ink' ? 'text-ink-faint' : 'text-brand'}>{eyebrow}</span>
            </p>
          </div>
        ) : (
          <>
            <p className="font-display text-[15px] leading-tight font-semibold tracking-tight text-ink">
              Material Depot
            </p>
            <p
              className={cn(
                'text-[11px] font-medium tracking-wide uppercase',
                tone === 'ink' ? 'text-ink-soft' : 'text-brand',
              )}
            >
              {eyebrow}
            </p>
          </>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-visible">
        {items.map((item) => {
          // `/console` would light up on every console page without the exact
          // check, so the root of each app is matched exactly and everything
          // else by prefix.
          const active =
            path === item.href ||
            (item.href !== '/console' && item.href !== '/dashboard' && path.startsWith(`${item.href}/`))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition',
                active ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-raised hover:text-ink',
              )}
            >
              <item.icon size={16} strokeWidth={2} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="hidden border-t border-line p-3 md:block">
        <p className="truncate text-xs font-semibold text-ink">{footerTitle}</p>
        <p className="truncate text-[11px] text-ink-faint">{footerSub ?? ''}</p>
        <button
          onClick={signOut}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-faint transition hover:text-bad"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </aside>
  )
}
