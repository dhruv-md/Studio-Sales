import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'
import { searchInspiration, type InspoSearch } from '@/lib/data/inspiration'
import { InspirationGallery } from '@/components/inspiration/InspirationGallery'

/**
 * Inspiration — a native port of the storefront's `/b2b/inspiration-gallery`.
 *
 * Filters live in the URL so this server component can fetch page 0 for the
 * current filter; the client gallery handles search, pills, filters and
 * infinite scroll from there. See `lib/data/inspiration.ts` for why the
 * browsing experience ports but the auth-gated storefront extras do not.
 */
export default async function InspirationPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string; style?: string; materials?: string }>
}) {
  const sp = await searchParams
  const params: InspoSearch = {
    search: sp.search || undefined,
    tag: sp.tag || undefined,
    style: sp.style || undefined,
    materials: sp.materials ? sp.materials.split(',').filter(Boolean) : undefined,
    page: 0,
  }

  const first = await searchInspiration(params)

  // A stable key so a filter change remounts the gallery with fresh data.
  const key = JSON.stringify({ s: params.search, t: params.tag, st: params.style, m: params.materials })

  return (
    <>
      <PageHead
        title="Inspiration"
        hint="Ideas, looks and collections from materialdepot.com to draw on for your projects."
      />
      <div className="px-4 py-5 md:px-6">
        {!first.ok ? (
          <Problem title="Inspiration could not be loaded" detail={first.error} />
        ) : (
          <InspirationGallery key={key} initial={first.data} params={params} />
        )}
      </div>
    </>
  )
}
