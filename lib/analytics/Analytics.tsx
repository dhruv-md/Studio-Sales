'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { identify, track, EV } from './track'
import type { SuperProps } from './events'

/**
 * Mounted once in the app shell. Identifies the session (§14.6.3) and fires
 * `session_start` plus a per-route view event.
 *
 * `useRef` on the pathname, not just a `useEffect` dependency: Next re-runs
 * effects on a soft navigation back to the same route, and `overview_viewed`
 * firing twice for one visit would inflate every Reach metric in §14.6.1 by an
 * amount nobody could later work out.
 */
export function Analytics({ props }: { props: SuperProps }) {
  const pathname = usePathname()
  const started = useRef(false)
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    identify(props)
    if (!started.current) {
      started.current = true
      track(EV.session_start)
    }
  }, [props])

  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    const view = VIEW_EVENT[pathname ?? '']
    if (view) track(view, { path: pathname })
  }, [pathname])

  return null
}

const VIEW_EVENT: Record<string, (typeof EV)[keyof typeof EV]> = {
  '/dashboard': EV.overview_viewed,
  '/referrals': EV.client_list_viewed,
  '/rewards': EV.rewards_viewed,
  // `/projects` is now the mood-board Projects tab; the relocated opt-in
  // workspace's project list gets its own name so the two are never conflated
  // in the numbers.
  '/projects': EV.project_opened,
  '/workspace/projects': EV.workspace_project_opened,
  '/settings': EV.profile_edited,
}
