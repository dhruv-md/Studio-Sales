/**
 * Saving an inspiration into a project space — the encoding, kept in its own
 * dependency-free module so client components (the "add to project" button, the
 * space grid) can import it WITHOUT pulling in `lib/data/inspiration.ts`, which
 * carries server-side fetch/`process.env` code.
 *
 * `studio_project_item` has only `url`/`caption` and a fixed `kind` enum, so an
 * inspiration is stored as a plain `image` item whose `url` carries the handle
 * in a fragment: `<image_url>#insp=<handle>`. A URL fragment is never sent to
 * the server, so `<img src>` still loads the image, and the space can recover
 * the handle to link the card back to `/inspiration/<handle>` — "opens exactly
 * like inspiration" — with no schema change.
 */
const INSP_MARK = '#insp='

export function encodeInspoItemUrl(imageUrl: string, handle: string): string {
  return `${imageUrl}${INSP_MARK}${encodeURIComponent(handle)}`
}

export function decodeInspoItemUrl(
  url: string,
): { imageSrc: string; handle: string; href: string } | null {
  const i = url.indexOf(INSP_MARK)
  if (i === -1) return null
  const handle = decodeURIComponent(url.slice(i + INSP_MARK.length))
  return { imageSrc: url.slice(0, i), handle, href: `/inspiration/${handle}` }
}
