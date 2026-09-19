import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { inr } from '@/lib/format'
import { inspoImageUrl, type InspoImage, type InspoProduct, type PosTag } from '@/lib/data/inspiration'
import { ImageCard } from './ImageCard'
import { AddToProjectButton } from './AddToProjectButton'

/** A product pointer, resolved to the richest product data we have. */
type Hotspot = {
  key: string
  x: number
  y: number
  handle: string | null
  name: string
  meta: string
  image: string | null
  price: number | null
  unit: string | null
}

function buildHotspots(image: InspoImage): Hotspot[] {
  const byId = new Map<number, InspoProduct>()
  for (const p of image.variant_data ?? []) if (p.id != null) byId.set(p.id, p)

  return (image.pos_tags ?? [])
    .filter((t): t is PosTag & { variant: NonNullable<PosTag['variant']> } => Boolean(t.variant))
    .map((t, i) => {
      // Prefer the matched product (it carries price + a thumbnail); fall back
      // to the tag's own variant so a dot still shows when the product is not
      // in variant_data — the storefront hard-filters here, which is the usual
      // reason its dots vanish.
      const p = t.variant.id != null ? byId.get(t.variant.id) : undefined
      const handle = p?.variant_handle || t.variant.variant_handle || null
      const name = p?.product_name || t.variant.product_name || 'Product'
      const meta = [p?.category_name ?? t.variant.category_name, p?.color_name ?? t.variant.color_name]
        .filter(Boolean)
        .join(' · ')
      return {
        key: String(t.id ?? `${t.variant.id}-${i}`),
        x: t.pos_x ?? 0,
        y: t.pos_y ?? 0,
        handle,
        name,
        meta,
        image: p?.variant_image?.[0]?.image_url ?? null,
        price: p?.selling_price_with_tax ?? null,
        unit: p?.price_unit ?? null,
      }
    })
}

function productUrl(handle: string | null) {
  return handle ? `https://materialdepot.com/${handle}/product` : undefined
}

/**
 * One inspiration image, its matched products, and a row of related images.
 * The storefront's "Add to collection" / "Buy this look" / consultation
 * actions are omitted — they need a Django user token our partners do not
 * carry — so this is the look plus what is in it, linking out to the catalogue.
 */
export function InspirationDetail({ image, related }: { image: InspoImage; related: InspoImage[] }) {
  const title = image.image_title || image.image_alt_text || 'Inspiration'
  const products = (image.variant_data ?? []).filter(Boolean)
  const hotspots = buildHotspots(image)
  const tags = [
    ...(image.application_image_type ?? []),
    ...(image.design_style ?? []),
  ]

  return (
    <div>
      <Link href="/inspiration" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Back to inspiration
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* the image, with product pointers overlaid */}
        <div className="relative self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {image.video_url ? (
              <video src={image.video_url} controls poster={inspoImageUrl(image.image_url)} className="block w-full" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={inspoImageUrl(image.image_url)} alt={image.image_alt_text || title} className="block w-full" />
            )}
          </div>
          {/* Pointers sit on a layer that matches the image box (block w-full →
              the box is exactly the image), so pos_x/pos_y percentages land
              right. Video images carry no pointers. */}
          {!image.video_url && hotspots.length ? (
            <div className="pointer-events-none absolute inset-0">
              {hotspots.map((h) => (
                <HotspotDot key={h.key} h={h} />
              ))}
            </div>
          ) : null}
        </div>

        {/* meta + products */}
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {image.user__f_name ? <p className="mt-1 text-[13px] text-ink-soft">by {image.user__f_name}</p> : null}
          {image.image_description ? <p className="mt-3 text-sm text-ink-soft">{image.image_description}</p> : null}

          <div className="mt-4">
            <AddToProjectButton imageUrl={inspoImageUrl(image.image_url)} handle={image.image_handle} title={title} />
          </div>

          {tags.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold text-ink">
              Materials in this look {products.length ? <span className="text-ink-faint">({products.length})</span> : null}
            </p>
            {products.length === 0 ? (
              <p className="text-[13px] text-ink-faint">No matched materials on this image.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {products.map((p, i) => (
                  <ProductRow key={p.variant_handle ?? p.id ?? i} p={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* related */}
      {related.length ? (
        <div className="mt-10">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">More like this</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {related.map((img) => (
              <ImageCard key={img.image_handle} img={img} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProductRow({ p }: { p: InspoProduct }) {
  const img = p.variant_image?.[0]?.image_url
  const meta = [p.category_name, p.color_name, p.finish?.[0]].filter(Boolean).join(' · ')
  const inner = (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-2.5 transition hover:bg-raised">
      <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={inspoImageUrl(img)} alt={p.product_name ?? ''} className="size-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium text-ink">{p.product_name ?? 'Product'}</p>
        {meta ? <p className="mt-0.5 truncate text-[11px] text-ink-faint">{meta}</p> : null}
      </div>
      {p.selling_price_with_tax != null ? (
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold text-ink">{inr(p.selling_price_with_tax)}</p>
          {p.price_unit ? <p className="text-[10px] text-ink-faint">/ {p.price_unit}</p> : null}
        </div>
      ) : null}
    </div>
  )
  // The storefront keys the product page on the VARIANT handle (it carries the
  // product code prefix, e.g. `lm-23961-…`); `product_handle` drops it.
  const url = productUrl(p.variant_handle || p.product_handle)
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    inner
  )
}

/**
 * One product pointer overlaid on the image. A pulsing dot at (x%, y%); on
 * hover (or focus) a small product card fades in, and the whole thing links to
 * the product. CSS-only — no client JS — so this stays a server component. On
 * touch, a tap follows the link straight to the product.
 */
function HotspotDot({ h }: { h: Hotspot }) {
  const url = productUrl(h.handle)
  const Tag = url ? 'a' : 'div'
  return (
    <Tag
      {...(url ? { href: url, target: '_blank', rel: 'noreferrer' } : {})}
      className="group/hs pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${h.x}%`, top: `${h.y}%` }}
    >
      {/* the dot */}
      <span className="relative flex size-5 items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex size-4 rounded-full border-2 border-white bg-brand shadow-[0_1px_4px_rgba(0,0,0,0.4)]" />
      </span>

      {/* the preview card */}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-52 -translate-x-1/2 group-hover/hs:block group-focus/hs:block">
        <span className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-lg">
          <span className="flex items-center gap-2.5 p-2">
            <span className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
              {h.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={inspoImageUrl(h.image)} alt="" className="size-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[12px] font-medium text-ink">{h.name}</span>
              {h.price != null ? (
                <span className="mt-0.5 block text-[12px] font-semibold text-ink">
                  {inr(h.price)}
                  {h.unit ? <span className="text-[10px] font-normal text-ink-faint"> / {h.unit}</span> : null}
                </span>
              ) : h.meta ? (
                <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{h.meta}</span>
              ) : null}
            </span>
          </span>
        </span>
      </span>
    </Tag>
  )
}
