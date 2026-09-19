'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, FolderPlus, Loader2, Plus } from 'lucide-react'
import type { StudioProject, StudioProjectSpace } from '@/lib/domain/types'
import { Button, Input, Problem } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { encodeInspoItemUrl } from '@/lib/inspiration-link'
import { addStudioItem, createStudioSpace } from '@/lib/data/actions'
import { listProjectsForAdd, listSpacesForAdd } from '@/app/(app)/inspiration/add-actions'

/**
 * Save an inspiration into a project space. Two steps: pick the project, then
 * the space (or make one), then it adds the image to that space as a link back
 * to this inspiration. Reused on the card (`icon`) and the detail page (`full`).
 */
export function AddToProjectButton({
  imageUrl,
  handle,
  title,
  variant = 'full',
}: {
  imageUrl: string
  handle: string
  title: string
  variant?: 'full' | 'icon'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }}
          aria-label="Add to a project"
          className="flex size-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-md backdrop-blur-sm transition hover:bg-white"
        >
          <Plus className="size-4" />
        </button>
      ) : (
        <Button type="button" variant="primary" onClick={() => setOpen(true)}>
          <FolderPlus size={15} /> Add to a project
        </Button>
      )}

      {open ? (
        <AddToProjectModal
          imageUrl={imageUrl}
          handle={handle}
          title={title}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function AddToProjectModal({
  imageUrl,
  handle,
  title,
  onClose,
}: {
  imageUrl: string
  handle: string
  title: string
  onClose: () => void
}) {
  const [step, setStep] = useState<'project' | 'space'>('project')
  const [projects, setProjects] = useState<StudioProject[] | null>(null)
  const [spaces, setSpaces] = useState<StudioProjectSpace[] | null>(null)
  const [project, setProject] = useState<StudioProject | null>(null)
  const [newSpace, setNewSpace] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Load projects when the modal mounts.
  useEffect(() => {
    let live = true
    listProjectsForAdd().then((r) => {
      if (!live) return
      if (r.ok) setProjects(r.data)
      else setError(r.error)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [])

  async function chooseProject(p: StudioProject) {
    setProject(p)
    setStep('space')
    setSpaces(null)
    setLoading(true)
    setError(null)
    const r = await listSpacesForAdd(p.id)
    if (r.ok) setSpaces(r.data)
    else setError(r.error)
    setLoading(false)
  }

  async function addToSpace(space: StudioProjectSpace) {
    if (!project) return
    setBusy(true)
    setError(null)
    const res = await addStudioItem({
      space_id: space.id,
      project_id: project.id,
      kind: 'image',
      url: encodeInspoItemUrl(imageUrl, handle),
      caption: title,
      source: 'manual',
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setDone(`Added to ${project.name} · ${space.name}`)
  }

  async function makeSpace() {
    if (!project || !newSpace.trim()) return
    setBusy(true)
    setError(null)
    const res = await createStudioSpace(project.id, newSpace.trim())
    if (!res.ok) {
      setBusy(false)
      return setError(res.error)
    }
    // createStudioSpace returns the new space row; add straight into it.
    const created = res.data as StudioProjectSpace
    setNewSpace('')
    await addToSpace(created)
  }

  const heading = done ? 'Saved' : step === 'project' ? 'Choose a project' : `Choose a space in ${project?.name ?? ''}`

  return (
    <Modal open onClose={onClose} title="Add to a project" hint={done ? undefined : heading}>
      <div className="space-y-3">
        {error ? <Problem title="Could not add" detail={error} /> : null}

        {done ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-good-soft text-good">
              <Check className="size-5" />
            </div>
            <p className="text-sm font-medium text-ink">{done}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => { setDone(null); setStep('project'); setProject(null) }}>
                Add to another
              </Button>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8 text-ink-faint">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : step === 'project' ? (
          projects && projects.length ? (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => chooseProject(p)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition hover:bg-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                    {p.city ? <span className="block truncate text-[11px] text-ink-faint">{p.city}</span> : null}
                  </span>
                  <ArrowLeft className="size-4 rotate-180 text-ink-faint" />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-soft">
              You have no projects yet. Create one on the Projects tab first.
            </p>
          )
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => { setStep('project'); setError(null) }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-ink"
            >
              <ArrowLeft className="size-3.5" /> Back to projects
            </button>

            {spaces && spaces.length ? (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {spaces.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => addToSpace(s)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-raised disabled:opacity-60"
                  >
                    {s.name}
                    {busy ? <Loader2 className="size-4 animate-spin text-ink-faint" /> : <Plus className="size-4 text-ink-faint" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-faint">No spaces yet — make the first one below.</p>
            )}

            <div className="flex items-center gap-2 border-t border-line pt-3">
              <Input
                value={newSpace}
                onChange={(e) => setNewSpace(e.target.value)}
                placeholder="New space (e.g. Kitchen)"
                onKeyDown={(e) => { if (e.key === 'Enter') makeSpace() }}
              />
              <Button variant="primary" disabled={busy || !newSpace.trim()} onClick={makeSpace}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
