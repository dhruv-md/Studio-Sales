'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ImageIcon, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { WorkspaceProps } from '@/components/projects/ProjectWorkspace'
import type { Board, ProjectArea } from '@/lib/domain/types'
import { Badge, Button, Card, CardHead, Empty, Problem, Table, Th } from '@/components/ui'
import { AreaEditor } from './AreaEditor'
import { ProductPicker } from './ProductPicker'
import { BoardItemRow } from './BoardItemRow'
import { areaLabel, hasPaletteScene, paletteUrl, surfacesFor } from '@/lib/domain/areas'
import { createBoard, deleteBoard, setApprovedBoard } from '@/lib/data/actions'
import { lineMath } from '@/lib/domain/money'
import { inr, inrShort } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The design stage: rooms, and one or more inspiration boards per room.
 *
 * Several boards per room is the point — an architect shows a client three
 * options and the client picks one. Approving one board un-approves the others
 * (see `setApprovedBoard`), because the quote is built from what was approved
 * and two approved options in one room makes it ambiguous.
 */
export function DesignTab({ project, areas, boards, items }: WorkspaceProps) {
  const [openAreaId, setOpenAreaId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProjectArea | null>(null)
  const [adding, setAdding] = useState(false)

  const path = `/workspace/projects/${project.id}`
  const openArea = areas.find((a) => a.id === openAreaId) ?? null

  if (openArea) {
    return (
      <>
        <button
          onClick={() => setOpenAreaId(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-brand"
        >
          <ArrowLeft size={14} /> All rooms
        </button>
        <div className="mt-3">
          <AreaBoards
            area={openArea}
            boards={boards.filter((b) => b.area_id === openArea.id)}
            items={items}
            path={path}
            onEdit={() => setEditing(openArea)}
          />
        </div>
        <AreaEditor projectId={project.id} area={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHead
          title="Rooms"
          hint="Add every area you are designing. Each one gets its own inspiration boards."
          action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add room</Button>}
        />

        {areas.length === 0 ? (
          <Empty
            icon={<Sparkles size={22} />}
            title="No rooms yet"
            body="Start with a room — the kitchen, a bathroom, the living room. Then build inspiration boards for it out of real Material Depot products, and the quote writes itself."
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add the first room</Button>}
          />
        ) : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => {
              const mine = boards.filter((b) => b.area_id === a.id)
              const approved = mine.find((b) => b.status === 'approved')
              const approvedItems = approved ? items.filter((i) => i.board_id === approved.id) : []
              const value = approvedItems.reduce(
                (s, i) => s + lineMath({ qty: i.qty ?? 0, rate: i.rate ?? 0, gst_pct: i.gst_pct ?? 0, line_markup_pct: null }, 0).mdAmount,
                0,
              )
              const cover = approved?.cover_url ?? mine.find((b) => b.cover_url)?.cover_url ?? null

              return (
                <li key={a.id}>
                  <button
                    onClick={() => setOpenAreaId(a.id)}
                    className={cn(
                      'group w-full overflow-hidden rounded-[var(--radius-card)] border text-left transition',
                      approved ? 'border-good/40 bg-good-soft/30' : 'border-line bg-surface hover:border-brand-line',
                    )}
                  >
                    <div className="flex h-24 items-center justify-center bg-raised">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon size={20} className="text-ink-faint" />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{a.name}</p>
                          <p className="text-[11px] text-ink-faint">{areaLabel(a.area_type)}</p>
                        </div>
                        {approved ? (
                          <Badge tone="good"><CheckCircle2 size={11} /> Signed off</Badge>
                        ) : (
                          <Badge tone={mine.length ? 'warn' : 'neutral'}>
                            {mine.length ? `${mine.length} option${mine.length === 1 ? '' : 's'}` : 'No boards'}
                          </Badge>
                        )}
                      </div>
                      <p className="tnum mt-2 text-[11px] text-ink-soft">
                        {a.floor_area_sqft ? `${a.floor_area_sqft} sqft floor` : 'floor area not set'}
                        {a.wall_area_sqft ? ` · ${a.wall_area_sqft} sqft wall` : ''}
                      </p>
                      {value > 0 ? (
                        <p className="tnum mt-1 text-xs font-medium text-ink">{inrShort(value)} of material</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <AreaEditor
        projectId={project.id}
        open={adding}
        onClose={() => setAdding(false)}
        nextSort={areas.length}
      />
    </>
  )
}

function AreaBoards({
  area, boards, items, path, onEdit,
}: {
  area: ProjectArea
  boards: Board[]
  items: WorkspaceProps['items']
  path: string
  onEdit: () => void
}) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<string | null>(boards[0]?.id ?? null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const active = boards.find((b) => b.id === activeId) ?? boards[0] ?? null
  const boardItems = active ? items.filter((i) => i.board_id === active.id) : []
  const surfaces = surfacesFor(area.area_type)

  const total = boardItems.reduce(
    (s, i) => s + lineMath({ qty: i.qty ?? 0, rate: i.rate ?? 0, gst_pct: i.gst_pct ?? 0, line_markup_pct: null }, 0).mdAmount,
    0,
  )
  const unpriced = boardItems.filter((i) => !i.rate).length
  const unquantified = boardItems.filter((i) => !i.qty).length

  function addBoard() {
    setError(null)
    start(async () => {
      const res = await createBoard({
        area_id: area.id,
        name: `Option ${boards.length + 1}`,
        path,
      })
      if (!res.ok) return setError(res.error)
      setActiveId((res.data as Board).id)
      router.refresh()
    })
  }

  function approve() {
    if (!active) return
    setError(null)
    start(async () => {
      const res = await setApprovedBoard(active.id, area.id, path)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  function removeBoard() {
    if (!active) return
    setError(null)
    start(async () => {
      const res = await deleteBoard(active.id, path)
      if (!res.ok) return setError(res.error)
      setActiveId(null)
      router.refresh()
    })
  }

  return (
    <>
      <Card>
        <CardHead
          title={area.name}
          hint={
            <span className="flex flex-wrap items-center gap-x-3">
              <span>{areaLabel(area.area_type)}</span>
              <span className="tnum text-ink-faint">
                {area.floor_area_sqft ? `${area.floor_area_sqft} sqft floor` : 'floor area not set'}
                {area.wall_area_sqft ? ` · ${area.wall_area_sqft} sqft wall` : ''}
              </span>
              <button onClick={onEdit} className="inline-flex items-center gap-1 text-brand hover:underline">
                <Pencil size={11} /> edit
              </button>
            </span>
          }
          action={
            hasPaletteScene(area.area_type) ? (
              <a href={paletteUrl(area.area_type, active?.palette_scene)} target="_blank" rel="noreferrer">
                <Button><Sparkles size={14} /> Visualise in Palette</Button>
              </a>
            ) : null
          }
        />

        {error ? <div className="p-4 pb-0"><Problem title="Something went wrong" detail={error} /></div> : null}

        {/* One tab per design option. */}
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-2.5">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveId(b.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                active?.id === b.id ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-raised hover:text-ink',
              )}
            >
              {b.name}
              {b.status === 'approved' ? <CheckCircle2 size={11} className="text-good" /> : null}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={addBoard} disabled={pending}>
            <Plus size={13} /> Add option
          </Button>
        </div>

        {!active ? (
          <Empty
            icon={<Sparkles size={22} />}
            title="No design options yet"
            body="Add an option, then fill it with real products. Show the client two or three and mark the one they pick as signed off."
            action={<Button variant="primary" onClick={addBoard} disabled={pending}><Plus size={15} /> Add the first option</Button>}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-raised px-4 py-2.5">
              <div className="tnum flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-ink-soft">
                  Material at Material Depot rates: <strong className="text-ink">{inr(total)}</strong>
                </span>
                {unquantified ? <span className="text-warn">{unquantified} item(s) with no quantity</span> : null}
                {unpriced ? <span className="text-warn">{unpriced} item(s) with no rate</span> : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setPicking(true)}><Plus size={13} /> Add product</Button>
                {active.status === 'approved' ? (
                  <Badge tone="good"><CheckCircle2 size={11} /> Signed off by the client</Badge>
                ) : (
                  <Button size="sm" variant="primary" onClick={approve} disabled={pending || !boardItems.length}>
                    <CheckCircle2 size={13} /> Client picked this
                  </Button>
                )}
                <button
                  onClick={removeBoard}
                  disabled={pending}
                  className="rounded-md p-1.5 text-ink-faint transition hover:bg-bad-soft hover:text-bad"
                  title="Delete this option"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {boardItems.length === 0 ? (
              <Empty
                title="Nothing on this board yet"
                body="Add tiles, laminates, wallpaper — anything from the Material Depot catalogue. Quantities and prices come with them."
                action={<Button variant="primary" onClick={() => setPicking(true)}><Plus size={15} /> Add a product</Button>}
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Surface</Th>
                    <Th>Quantity</Th>
                    <Th>Wastage %</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {boardItems.map((i) => (
                    <BoardItemRow key={i.id} item={i} area={area} path={path} onError={setError} />
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </Card>

      {active ? (
        <ProductPicker
          boardId={active.id}
          surfaces={surfaces}
          path={path}
          open={picking}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  )
}
