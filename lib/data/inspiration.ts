import { fail, ok, type Result } from './result'

/**
 * The inspiration gallery — a native port of the storefront's `/b2b` flow.
 *
 * The storefront (materialdepot_nextjs, Pages Router + Redux + axios→Django)
 * renders this from `pages/b2b/inspiration-gallery.tsx`. This app cannot run
 * that code, so we talk to the same Django endpoint directly and render it in
 * our own shell.
 *
 * ONE endpoint does all of it: `POST {BASE}/inspiration-image-search/`. It is
 * public (no JWT), which is why the browsing experience ports cleanly — the
 * auth-gated storefront extras (upload, save-to-collection, the profile menu,
 * collections) are deliberately left out because they need a Django user token
 * our Supabase-authed partners do not carry.
 *
 * The base is `INSPIRATION_API_BASE`, separate from `MD_SNAPSHOT_API_BASE` so
 * the gallery can point at dev2 while the project-image upload / snapshot tools
 * point at a local Django (or vice-versa). Production `api.materialdepot.com`
 * sits behind Cloudflare's challenge (the same wall `docs/catalogue.md`
 * documents), so a server-to-server call from Vercel 403s; `api-dev2` and a
 * local Django both answer plainly. Defaults to dev2; override in `.env.local`.
 */

const BASE = process.env.INSPIRATION_API_BASE || 'https://api-dev2.materialdepot.in/apiV1'

export const INSPIRATION_TAGS = [
  'Kitchen', 'Bathroom', 'TV Unit', 'Wardrobe', 'Living Room', 'Bedroom',
  'Outdoor', 'Dining', 'Balcony', 'Foyer', 'Kids Room', 'Pooja Room',
  'Ceiling', 'Parking', 'Terrace', 'Accent Wall',
] as const

export const DESIGN_STYLES = [
  'Modern', 'Scandinavian', 'Traditional', 'Minimalist', 'Bohemian', 'Japandi',
  'Mediterranean', 'Art Deco', 'Biophilic', 'Eclectic', 'Industrial', 'Mid-century Modern',
] as const

export const MATERIALS = [
  'Tiles', 'Laminates', 'Panels', 'Wallpapers', 'Wall Cladding', 'Quartz',
] as const

/** A curated pill row — each is just a canned search term. */
export const CURATED = [
  { name: 'Tropical Bathroom', color: '#E8F5E3', image: 'https://materialdepotimages.materialdepot.in/application_image/tropical-bathroom-inspiration-search.png' },
  { name: 'Marble TV Unit', color: '#E3F2F5', image: 'https://materialdepotimages.materialdepot.in/application_image/marble-tv-unit-inspiration-search.jpg' },
  { name: 'Terrazzo Tiles', color: '#F5E3E8', image: 'https://materialdepotimages.materialdepot.in/application_image/terrazzo-tiles-inspiration-search.jpg' },
  { name: 'Subway Backsplash', color: '#E8EDE3', image: 'https://materialdepotimages.materialdepot.in/application_image/subway-backsplash-inspiration-search.jpg' },
  { name: 'Scandinavian Kitchen', color: '#F5EFE3', image: 'https://materialdepotimages.materialdepot.in/application_image/scandinavian-kitchen-inspiration-search.jpg' },
  { name: 'Moroccan Kitchen', color: '#E3E8F5', image: 'https://materialdepotimages.materialdepot.in/application_image/moroccan-kitchen-inspiration-search.jpg' },
  { name: 'Modern Bathroom', color: '#F5E3F0', image: 'https://materialdepotimages.materialdepot.in/application_image/modern-bathroom-inspiration-search.jpg' },
  { name: 'Earthy Kitchen', color: '#F0E8E3', image: 'https://materialdepotimages.materialdepot.in/application_image/earthy-kitchen-inspiration-search.jpg' },
] as const

// -------------------------------------------------------------------- types

/** One product matched to an image (only present on a by-handle query). */
export type InspoProduct = {
  id: number | null
  product_id: number | null
  product_name: string | null
  product_handle: string | null
  variant_handle: string | null
  category_name: string | null
  color_name: string | null
  finish: string[] | null
  base_material: string[] | null
  /** Tax-inclusive, per house rule #3 — the catalogue field is inclusive. */
  selling_price_with_tax: number | null
  mrp: number | null
  price_unit: string | null
  variant_image: { image_url: string }[] | null
}

/** The product a hotspot points at — carried on the pos_tag itself. */
export type PosTagVariant = {
  id: number | null
  variant_handle: string | null
  product_handle: string | null
  product_name: string | null
  category_name: string | null
  color_name: string | null
}

/**
 * A product pointer on the image: `pos_x`/`pos_y` are percentages (0–100) of
 * the image box, and `variant.id` joins to `variant_data[].id`.
 */
export type PosTag = {
  id: number | null
  pos_x: number | null
  pos_y: number | null
  variant: PosTagVariant | null
}

export type InspoImage = {
  image_handle: string
  image_url: string
  image_alt_text: string | null
  image_title: string | null
  image_description: string | null
  application_image_type: string[] | null
  design_style: string[] | null
  user__f_name: string | null
  video_url: string | null
  video_uid: string | null
  variant: number[] | null
  variant_data: InspoProduct[] | null
  pos_tags: PosTag[] | null
  collection_tags: string[] | null
}

export type InspoSearch = {
  search?: string
  tag?: string
  style?: string
  materials?: string[]
  page?: number
}

export type InspoPage = { images: InspoImage[]; total: number; page: number }

// ------------------------------------------------------------------- fetch

type RawResponse = { product?: unknown[]; total?: number } | null

function bodyFor(p: InspoSearch) {
  const fields: Record<string, unknown> = {}
  if (p.tag) fields.application_image_type = [p.tag]
  if (p.style) fields.design_style = [p.style]
  if (p.materials?.length) fields.materials = p.materials
  return { query_string: p.search ?? '', fields_to_search: fields, page_number: p.page ?? 0 }
}

async function post(path: string, body: unknown): Promise<Result<RawResponse>> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (e) {
    return fail(`The inspiration service could not be reached: ${(e as Error).message}`)
  }
  if (!res.ok) return fail(`The inspiration service returned ${res.status}.`)
  try {
    return ok((await res.json()) as RawResponse)
  } catch {
    return fail('The inspiration service returned something that was not JSON.')
  }
}

/** A page of images for the grid. */
export async function searchInspiration(p: InspoSearch): Promise<Result<InspoPage>> {
  const r = await post('/inspiration-image-search/', bodyFor(p))
  if (!r.ok) return r
  const images = (r.data?.product ?? []) as InspoImage[]
  return ok({ images, total: r.data?.total ?? 0, page: p.page ?? 0 })
}

/** One image plus its matched products and a row of related images. */
export async function getInspirationByHandle(
  handle: string,
): Promise<Result<{ image: InspoImage; related: InspoImage[] }>> {
  const r = await post('/inspiration-image-search/', {
    query_string: '',
    fields_to_search: { image_handle: [handle] },
    page_number: 0,
  })
  if (!r.ok) return r
  const image = ((r.data?.product ?? []) as InspoImage[])[0]
  if (!image) return fail('not_found')

  // Related images: same room type, best-effort. A failure here is not fatal —
  // the detail page still renders with an empty related row.
  const type = image.application_image_type?.[0]
  let related: InspoImage[] = []
  if (type) {
    const rel = await searchInspiration({ tag: type })
    if (rel.ok) related = rel.data.images.filter((i) => i.image_handle !== handle).slice(0, 12)
  }
  return ok({ image, related })
}

/**
 * The storefront rewrites image hosts onto an Azure CDN, but that edge 502s
 * from outside its own deployment while the raw source host answers 200 — so
 * we leave the host alone and only strip query params.
 */
export function inspoImageUrl(path: string | null | undefined): string {
  if (!path) return ''
  return path.split('?')[0]
}
