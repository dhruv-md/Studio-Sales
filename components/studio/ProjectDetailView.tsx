'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Copy, FileDown, Layers, Link2, Plus, ShoppingBag, Trash2, Upload, X,
} from 'lucide-react'
import type { StudioProject, StudioProjectItem, StudioProjectSpace, StudioProjectTemplate, StudioItemKind } from '@/lib/domain/types'
import {
  Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { PageHead } from '@/components/shell/PageHead'
import {
  addStudioItem, createStudioSpace, deleteStudioItem, deleteStudioProject, deleteStudioSpace,
  ensureProjectShareToken, ensureSpaceShareToken,
} from '@/lib/data/actions'
import { decodeInspoItemUrl } from '@/lib/inspiration-link'
import { studioPdf } from '@/lib/studio/pdf'
import { EV, track } from '@/lib/analytics/track'


export function ProjectDetailView({
  project, spaces, items, template, firmName, logoUrl, errors,
}: {
  project: StudioProject
  spaces: StudioProjectSpace[]
  items: StudioProjectItem[]
  template: StudioProjectTemplate | null
  firmName: string
  logoUrl: string | null
  errors: string[]
}) {
  const router = useRouter()
  const [addingSpace, setAddingSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [exporting, setExporting] = useState(false)
  const [linkCopied, setLinkCopied] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const itemsBySpace = new Map<string, StudioProjectItem[]>()
  for (const it of items) itemsBySpace.set(it.space_id, [...(itemsBySpace.get(it.space_id) ?? []), it])

  function removeProject() {
    setError(null)
    start(async () => {
      const res = await deleteStudioProject(project.id)
      if (!res.ok) return setError(res.error)
      router.push('/projects')
      router.refresh()
    })
  }

  function addSpace() {
    if (!spaceName.trim()) return
    setError(null)
    start(async () => {
      const res = await createStudioSpace(project.id, spaceName)
      if (!res.ok) return setError(res.error)
      track(EV.space_created)
      setSpaceName('')
      setAddingSpace(false)
      router.refresh()
    })
  }

  async function shareProject() {
    setError(null)
    const res = await ensureProjectShareToken(project.id)
    if (!res.ok) return setError(res.error)
    const url = `${window.location.origin}/p/${res.data}`
    await navigator.clipboard.writeText(url).catch(() => {})
    track(EV.project_shared, { scope: 'project' })
    setLinkCopied(url)
    setTimeout(() => setLinkCopied((u) => (u === url ? null : u)), 4000)
  }

  async function exportPdf() {
    setExporting(true)
    try {
      await studioPdf({
        firmName,
        logoUrl,
        projectName: project.name,
        clientName: project.client_name,
        template,
        spaces: spaces.map((s) => ({ space: s, items: itemsBySpace.get(s.id) ?? [] })),
      })
      track(EV.project_pdf_exported)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHead
        title={project.name}
        crumbs={[{ href: '/projects', label: 'Projects' }, { label: project.name }]}
        hint={[project.client_name, project.city, project.project_type].filter(Boolean).join(' · ') || undefined}
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={shareProject}><Copy size={13} /> Get a link</Button>
            <Button size="sm" onClick={exportPdf} disabled={exporting}><FileDown size={13} /> {exporting ? 'Preparing…' : 'Download PDF'}</Button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-1.5 text-ink-faint transition hover:bg-bad-soft hover:text-bad"
              aria-label="Delete project"
            >
              <Trash2 size={15} />
            </button>
          </div>
        }
      />
      <div className="space-y-5 px-4 py-5 md:px-6">
        {error ? <Problem title="Could not save" detail={error} /> : null}
        {linkCopied ? (
          <p className="rounded-lg border border-good-soft bg-good-soft px-3 py-2 text-xs text-ink">
            Link copied: <span className="tnum">{linkCopied}</span>
          </p>
        ) : null}
        {errors.map((e) => <Problem key={e} title="Some of this could not load" detail={e} />)}

        {project.description ? <p className="text-sm leading-relaxed text-ink-soft">{project.description}</p> : null}

        {spaces.length === 0 ? (
          <Card>
            <Empty
              icon={<Layers size={22} />}
              title="No spaces yet"
              body="A space is one room or one area of the brief — bedroom, kitchen, facade. Add the first one and start saving inspiration into it."
              action={<Button variant="primary" onClick={() => setAddingSpace(true)}><Plus size={15} /> Add a space</Button>}
            />
          </Card>
        ) : (
          <>
            {spaces.map((s) => (
              <SpaceSection key={s.id} space={s} items={itemsBySpace.get(s.id) ?? []} projectId={project.id} projectName={project.name} />
            ))}
            <Button onClick={() => setAddingSpace(true)}><Plus size={14} /> Add a space</Button>
          </>
        )}
      </div>

      <Modal open={addingSpace} onClose={() => setAddingSpace(false)} title="Add a space">
        <div className="space-y-3">
          <Field label="Name" required hint="e.g. Master bedroom, Kitchen, Facade">
            <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddingSpace(false)}>Cancel</Button>
            <Button variant="primary" disabled={pending || !spaceName.trim()} onClick={addSpace}>Add</Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this project?">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">{project.name}</span> and its spaces will be removed from your
            Projects. This can be undone by Material Depot if you ask.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={removeProject}>
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function SpaceSection({ space, items, projectId, projectName }: { space: StudioProjectSpace; items: StudioProjectItem[]; projectId: string; projectName: string }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<StudioItemKind>('image')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setAdding(false)
    setUrl('')
    setFile(null)
    setCaption('')
    setKind('image')
  }

  // Selecting a file only STAGES it — nothing uploads until Save. For an image
  // we pre-validate to match the R2 endpoint (JPG/PNG/GIF/WebP, ≤10MB).
  function pickFile(f: File) {
    if (kind === 'image') {
      const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : ''
      if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        return setError(`${f.name}: only JPG, PNG, GIF or WebP.`)
      }
      if (f.size > 10 * 1024 * 1024) return setError(`${f.name}: over 10MB.`)
    }
    setError(null)
    setUrl('')
    setFile(f)
  }

  /** Upload the staged file now (an image → R2 under projects/<project>/<space>/,
   *  a video → the Supabase bucket), and return the stored URL. */
  async function uploadStaged(f: File): Promise<string | null> {
    const form = new FormData()
    form.set('file', f)
    if (kind === 'image') {
      form.set('project_name', projectName)
      form.set('subfolder', space.name)
      const res = await fetch('/api/tools/project-images', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Upload failed.')
        return null
      }
      const u = Array.isArray(body.images) ? body.images[0] : undefined
      if (!u) {
        setError('Upload succeeded but no URL came back.')
        return null
      }
      return encodeURI(u as string) // folder names can contain spaces
    }
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Upload failed.')
      return null
    }
    return body.url as string
  }

  function save() {
    if (!file && !url.trim()) return setError('Select an image, or paste a link first.')
    setError(null)
    start(async () => {
      let finalUrl = url.trim()
      if (file) {
        const uploaded = await uploadStaged(file)
        if (!uploaded) return // uploadStaged already set the error
        finalUrl = uploaded
      }
      const res = await addStudioItem({
        space_id: space.id,
        project_id: projectId,
        kind,
        url: finalUrl,
        caption,
        source: kind === 'palette_link' ? 'palette' : kind === 'image' || kind === 'video' ? 'upload' : 'manual',
      })
      if (!res.ok) return setError(res.error)
      track(EV.board_item_added, { source: kind === 'palette_link' ? 'palette' : kind === 'product_link' ? 'link' : 'upload' })
      reset()
      router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    start(async () => {
      const res = await deleteStudioItem(id, projectId)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  async function shareSpace() {
    setError(null)
    const res = await ensureSpaceShareToken(space.id)
    if (!res.ok) return setError(res.error)
    const link = `${window.location.origin}/p/space/${res.data}`
    await navigator.clipboard.writeText(link).catch(() => {})
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 4000)
  }

  function removeSpace() {
    setError(null)
    start(async () => {
      const res = await deleteStudioSpace(space.id, projectId)
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHead
        title={space.name}
        hint={`${items.length} saved item${items.length === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={shareSpace}><Copy size={12} /> Link</Button>
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus size={13} /> Add</Button>
            <button
              onClick={removeSpace}
              disabled={pending}
              className="rounded-md p-1.5 text-ink-faint transition hover:bg-bad-soft hover:text-bad"
              aria-label={`Delete ${space.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        }
      />
      {error ? <div className="px-4 pt-3"><Problem title="Could not save" detail={error} /></div> : null}
      {linkCopied ? <p className="px-4 pt-2 text-[11px] text-good">Link copied.</p> : null}
      {items.length === 0 ? (
        <Empty title="Nothing saved here yet" body="Add a photo, or save one from the Inspiration tab." />
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => {
            // An image saved from Inspiration carries its handle in a URL
            // fragment; render it as a card that opens the inspiration detail,
            // exactly like clicking it in the gallery.
            const insp = item.kind === 'image' ? decodeInspoItemUrl(item.url) : null
            return (
            <div key={item.id} className="group relative overflow-hidden rounded-lg border border-line bg-raised">
              {insp ? (
                <Link href={insp.href} className="block aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={insp.imageSrc} alt={item.caption ?? ''} className="size-full object-cover transition-transform group-hover:scale-105" />
                </Link>
              ) : item.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.caption ?? ''} className="aspect-square size-full object-cover" />
              ) : item.kind === 'video' ? (
                <video src={item.url} className="aspect-square size-full object-cover" muted />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-square size-full flex-col items-center justify-center gap-1.5 p-2 text-center text-ink-soft hover:bg-surface"
                >
                  {item.kind === 'palette_link' ? <Link2 size={18} /> : <ShoppingBag size={18} />}
                  <span className="line-clamp-2 text-[11px]">{item.caption || item.url}</span>
                </a>
              )}
              <button
                onClick={() => remove(item.id)}
                disabled={pending}
                className="absolute top-1 right-1 rounded-md bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
            )
          })}
        </div>
      )}

      <Modal open={adding} onClose={reset} title={`Add to ${space.name}`}>
        <div className="space-y-3">
          <Field label="What are you adding">
            <Select value={kind} onChange={(e) => { setKind(e.target.value as StudioItemKind); setUrl(''); setFile(null) }}>
              <option value="image">A photo</option>
              <option value="product_link">A link</option>
            </Select>
          </Field>

          {kind === 'image' ? (
            <Field label="File" hint="Selecting a file stages it — it uploads when you press Save.">
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickFile(f)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              />
              {file ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
                  <span className="flex-1 truncate text-sm text-ink">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="rounded-md p-1 text-ink-faint transition hover:text-ink"
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <Button type="button" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> Select image
                </Button>
              )}
            </Field>
          ) : (
            <Field label="Link" hint="From Material Depot or anywhere else.">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          )}

          <Field label="Caption (optional)">
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button variant="primary" disabled={pending || (!file && !url.trim())} onClick={save}>
              {pending ? (file ? 'Uploading…' : 'Saving…') : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
