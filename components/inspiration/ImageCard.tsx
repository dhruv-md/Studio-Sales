import Link from 'next/link'
import { Play } from 'lucide-react'
import { inspoImageUrl, type InspoImage } from '@/lib/data/inspiration'
import { AddToProjectButton } from './AddToProjectButton'

/**
 * One tile in the grid. A fixed square (`aspect-square` + `object-cover`), the
 * storefront's shape — a uniform grid never reflows when more tiles append and
 * never shifts as an image loads, which is what keeps the gallery seamless. A
 * `bg-raised` placeholder fills the cell until the image paints.
 *
 * The "add to project" button is a sibling of the link (not nested in it — a
 * button inside an anchor is invalid), shown on hover.
 */
export function ImageCard({ img }: { img: InspoImage }) {
  const src = inspoImageUrl(img.image_url)
  const title = img.image_title || img.image_alt_text || 'Inspiration'
  const author = img.user__f_name

  return (
    <div className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-raised">
      <Link href={`/inspiration/${img.image_handle}`} className="block aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={img.image_alt_text || title}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {img.video_url ? (
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="size-3.5" fill="currentColor" />
          </span>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-2 text-[12px] font-medium text-white">{title}</p>
          {author ? <p className="mt-0.5 text-[11px] text-white/75">by {author}</p> : null}
        </div>
      </Link>
      <div className="absolute top-2 left-2 opacity-0 transition-opacity group-hover:opacity-100">
        <AddToProjectButton imageUrl={src} handle={img.image_handle} title={title} variant="icon" />
      </div>
    </div>
  )
}
