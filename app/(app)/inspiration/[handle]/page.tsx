import { notFound } from 'next/navigation'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'
import { getInspirationByHandle } from '@/lib/data/inspiration'
import { InspirationDetail } from '@/components/inspiration/InspirationDetail'

/**
 * One inspiration image and what is in it — a native port of the storefront's
 * `/b2b/image-gallery-details/[handle]`.
 */
export default async function InspirationDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const r = await getInspirationByHandle(handle)

  if (!r.ok && r.error === 'not_found') notFound()

  return (
    <>
      <PageHead title="Inspiration" hint="A look, and the materials that make it." />
      <div className="px-4 py-5 md:px-6">
        {!r.ok ? (
          <Problem title="This inspiration could not be loaded" detail={r.error} />
        ) : (
          <InspirationDetail image={r.data.image} related={r.data.related} />
        )}
      </div>
    </>
  )
}
