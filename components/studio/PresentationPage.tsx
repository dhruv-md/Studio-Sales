import type { StudioProjectItem, StudioProjectSpace } from '@/lib/domain/types'
import { PresentationDownload } from './PresentationDownload'

/**
 * The public-facing shell both `/p/[token]` and `/p/space/[token]` render
 * into — a firm's own branding (never Material Depot's), the images and
 * links saved into each space, in the order they were added. Read-only: this
 * page never writes anything, and nothing on it identifies who is viewing.
 */
export function PresentationPage({
  firmName, logoUrl, title, subtitle, spaces,
}: {
  firmName: string
  logoUrl: string | null
  title: string
  subtitle?: string | null
  spaces: { space: StudioProjectSpace; items: StudioProjectItem[] }[]
}) {
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <header className="border-b border-[#e8e1d8] bg-white px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={firmName} className="h-10 w-auto object-contain" />
            ) : null}
            <div>
              <p className="text-sm font-medium text-[#5b5147]">{firmName}</p>
              <h1 className="font-semibold text-[#201b16]" style={{ fontSize: 22 }}>{title}</h1>
              {subtitle ? <p className="text-sm text-[#5b5147]">for {subtitle}</p> : null}
            </div>
          </div>
          <PresentationDownload firmName={firmName} logoUrl={logoUrl} title={title} subtitle={subtitle ?? null} spaces={spaces} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-6 py-10 sm:px-10">
        {spaces.length === 0 ? (
          <p className="text-sm text-[#5b5147]">Nothing has been added to this yet.</p>
        ) : (
          spaces.map(({ space, items }) => (
            <section key={space.id}>
              <h2 className="mb-3 font-semibold text-[#201b16]" style={{ fontSize: 17 }}>{space.name}</h2>
              {items.length === 0 ? (
                <p className="text-sm text-[#5b5147]">Nothing saved here yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {items.map((item) => (
                    <figure key={item.id} className="overflow-hidden rounded-lg border border-[#e8e1d8] bg-white">
                      {item.kind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={item.caption ?? ''} className="aspect-square w-full object-cover" />
                      ) : item.kind === 'video' ? (
                        <video src={item.url} className="aspect-square w-full object-cover" controls />
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex aspect-square w-full flex-col items-center justify-center p-3 text-center text-sm text-[#5b5147] hover:bg-[#faf8f5]"
                        >
                          {item.kind === 'palette_link' ? 'Palette reference' : 'Product link'}
                          <span className="mt-1 truncate text-xs underline">{item.caption || item.url}</span>
                        </a>
                      )}
                      {item.caption ? (
                        <figcaption className="px-2 py-1.5 text-xs text-[#5b5147]">{item.caption}</figcaption>
                      ) : null}
                    </figure>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </main>

      <footer className="px-6 py-8 text-center text-xs text-[#8c8074] sm:px-10">
        Shared via Material Depot for Partners
      </footer>
    </div>
  )
}
