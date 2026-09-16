import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Refreshes the Supabase session on every request (Server Components cannot set
 * cookies, so it has to happen here) and keeps signed-out users out of the app.
 *
 * This is Next 16's `proxy.ts` — the old `middleware.ts` convention is
 * deprecated and warns on every build.
 */
export default async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  const signedIn = Boolean(data.user)
  const path = req.nextUrl.pathname

  // /p/<token> is the public, unauthenticated presentation page for a shared
  // project or space (app/p/**) — the share token itself is the capability,
  // read server-side with the service role. It must never require a session,
  // the same way /login must not.
  if (path.startsWith('/p/')) return res

  if (!signedIn && !path.startsWith('/login')) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    // Come back to where they were trying to go, once they are in.
    if (path !== '/') url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }
  if (signedIn && path.startsWith('/login')) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  // Everything except static assets and the API routes, which authenticate
  // themselves (the sync route on a shared secret, the catalogue proxy not at
  // all — it reads a public catalogue).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
