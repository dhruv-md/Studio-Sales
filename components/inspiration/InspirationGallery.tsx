'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  CURATED, DESIGN_STYLES, INSPIRATION_TAGS, MATERIALS,
  type InspoImage, type InspoPage, type InspoSearch,
} from '@/lib/data/inspiration'
import { moreInspiration } from '@/app/(app)/inspiration/actions'
import { cn } from '@/lib/cn'
import { Problem } from '@/components/ui'
import { ImageCard } from './ImageCard'

/**
 * The native inspiration gallery, matched to the storefront's look: a row of
 * room-type pills (yellow when active), a row of curated collection chips
 * below, both horizontally scrollable with chevron arrows on wider screens.
 *
 * Filters live in the URL, so the server page fetches page 0 for the current
 * filter and this component appends further pages through the `moreInspiration`
 * server action as the sentinel scrolls into view. The page keys this component
 * by the filter string, so a filter change remounts it with fresh `initial`.
 */
export function InspirationGallery({
  initial,
  params,
}: {
  initial: InspoPage
  params: InspoSearch
}) {
  const router = useRouter()
  const [images, setImages] = useState<InspoImage[]>(initial.images)
  const [page, setPage] = useState(initial.page)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(initial.images.length >= initial.total)
  const [searchText, setSearchText] = useState(params.search ?? '')
  const [showFilters, setShowFilters] = useState(false)

  const sentinel = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return
    loadingRef.current = true
    setLoading(true)
    const next = page + 1
    const r = await moreInspiration({ ...params, page: next })
    if (!r.ok) {
      setError(r.error)
    } else {
      setImages((prev) => [...prev, ...r.data.images])
      setPage(next)
      if (!r.data.images.length || images.length + r.data.images.length >= r.data.total) {
        setDone(true)
      }
    }
    setLoading(false)
    loadingRef.current = false
  }, [done, page, params, images.length])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  // ------- filter navigation: write the filter into the URL, server re-renders

  function go(next: Partial<InspoSearch>) {
    const merged: InspoSearch = { ...params, ...next }
    const qs = new URLSearchParams()
    if (merged.search) qs.set('search', merged.search)
    if (merged.tag) qs.set('tag', merged.tag)
    if (merged.style) qs.set('style', merged.style)
    if (merged.materials?.length) qs.set('materials', merged.materials.join(','))
    const q = qs.toString()
    router.push(q ? `/inspiration?${q}` : '/inspiration')
  }

  function submitSearch() {
    const v = searchText.trim()
    go({ search: v || undefined, tag: undefined })
  }

  function toggleMaterial(m: string) {
    const cur = params.materials ?? []
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]
    go({ materials: next.length ? next : undefined })
  }

  const activeTag = params.tag ?? null
  const filtersOn = Boolean(params.style) || Boolean(params.materials?.length)

  return (
    <div>
      {/* search */}
      <div className="mb-4 flex max-w-xl items-center gap-2 rounded-full border border-line-strong bg-surface px-4">
        <Search className="size-4 shrink-0 text-ink-faint" />
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch()
          }}
          placeholder="Search inspiration…"
          className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        {searchText ? (
          <button onClick={() => { setSearchText(''); go({ search: undefined }) }} aria-label="Clear">
            <X className="size-4 text-ink-faint hover:text-ink" />
          </button>
        ) : null}
      </div>

      {/* room-type pills + filter toggle */}
      <div className="mb-3 flex items-center gap-2">
        <HScroll className="flex-1">
          <Pill active={!activeTag} onClick={() => go({ tag: undefined, search: undefined })}>All</Pill>
          {INSPIRATION_TAGS.map((t) => (
            <Pill key={t} active={activeTag === t} onClick={() => go({ tag: t, search: undefined })}>
              {t}
            </Pill>
          ))}
        </HScroll>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink"
          aria-label="Filters"
        >
          <SlidersHorizontal className="size-4" />
          {filtersOn ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand" /> : null}
        </button>
      </div>

      {/* curated collections */}
      <HScroll className="mb-5">
        {CURATED.map((c) => (
          <button
            key={c.name}
            onClick={() => go({ search: c.name, tag: undefined })}
            className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium text-ink transition hover:brightness-95"
            style={{ backgroundColor: c.color }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image} alt="" className="size-8 rounded-full object-cover" />
            {c.name}
          </button>
        ))}
      </HScroll>

      {/* filter panel */}
      {showFilters ? (
        <div className="mb-5 rounded-[var(--radius-card)] border border-line bg-raised p-4">
          <FilterGroup
            label="Design style"
            options={DESIGN_STYLES as readonly string[]}
            isActive={(o) => params.style === o}
            onToggle={(o) => go({ style: params.style === o ? undefined : o })}
          />
          <div className="mt-3">
            <FilterGroup
              label="Material"
              options={MATERIALS as readonly string[]}
              isActive={(o) => (params.materials ?? []).includes(o)}
              onToggle={toggleMaterial}
            />
          </div>
          {filtersOn ? (
            <button
              onClick={() => go({ style: undefined, materials: undefined })}
              className="mt-3 text-[12px] font-medium text-brand"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {/* grid */}
      {images.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-soft">
          No inspiration matched that. Try a different room or search.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {images.map((img) => (
            <ImageCard key={img.image_handle} img={img} />
          ))}
        </div>
      )}

      {error ? <div className="mt-4"><Problem title="Could not load more" detail={error} /></div> : null}

      {!done && !error ? (
        <div ref={sentinel} className="py-8 text-center text-[13px] text-ink-faint">
          {loading ? 'Loading more…' : ' '}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A horizontally scrollable row with circular chevron arrows that appear on
 * wider screens only when there is more to scroll in that direction — the
 * storefront's pill/curated carousels.
 */
function HScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setShowLeft(el.scrollLeft > 4)
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update])

  function scroll(dir: -1 | 1) {
    ref.current?.scrollBy({ left: dir * 280, behavior: 'smooth' })
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      {showLeft ? (
        <button
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
          className="absolute top-1/2 left-0 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md md:flex"
        >
          <ChevronLeft className="size-4" />
        </button>
      ) : null}

      <div
        ref={ref}
        onScroll={update}
        className="flex gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {showRight ? (
        <button
          onClick={() => scroll(1)}
          aria-label="Scroll right"
          className="absolute top-1/2 right-0 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md md:flex"
        >
          <ChevronRight className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition',
        active
          ? 'border-[#facc15] bg-[#facc15] text-black'
          : 'border-line-strong bg-surface text-ink hover:bg-raised',
      )}
    >
      {children}
    </button>
  )
}

function FilterGroup({
  label, options, isActive, onToggle,
}: {
  label: string
  options: readonly string[]
  isActive: (o: string) => boolean
  onToggle: (o: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] font-medium transition',
              isActive(o) ? 'border-brand bg-brand text-surface' : 'border-line-strong bg-surface text-ink hover:bg-raised',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}
