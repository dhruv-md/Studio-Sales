'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Globe, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import {
  Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select, Textarea, type Tone,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import {
  createPortfolioItem, deletePortfolioItem, submitPortfolioItem, updatePortfolioItem, updateStudioProfile,
} from '@/lib/data/actions'
import { PORTFOLIO_ASPECTS, type Partner, type PortfolioItem, type PortfolioStatus } from '@/lib/domain/types'
import { inr } from '@/lib/format'

/**
 * What the four statuses mean to the firm, in their words rather than the
 * column's. `published` is the only one that means anything is on
 * materialdepot.com, and it is the only one a firm cannot set themselves.
 */
const STATUS: Record<PortfolioStatus, { label: string; tone: Tone; blurb: string }> = {
  draft:     { label: 'Draft',            tone: 'neutral', blurb: 'Only you can see this. Send it when it is ready.' },
  submitted: { label: 'With Material Depot', tone: 'info', blurb: 'We are looking at it. You cannot edit it while we do.' },
  published: { label: 'Live on our site',  tone: 'good',   blurb: 'On materialdepot.com. Ask us if you need it changed.' },
  rejected:  { label: 'Needs a change',    tone: 'warn',   blurb: 'Have a look at the note, then send it back to us.' },
}

const PROJECT_TYPES = ['residential', 'commercial', 'hospitality', 'retail', 'office', 'other']

export function PortfolioView({ partner, items }: { partner: Partner; items: PortfolioItem[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<PortfolioItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [aspects, setAspects] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const live = items.filter((i) => i.status === 'published').length

  function openAdd() {
    setAspects([])
    setAdding(true)
  }
  function openEdit(item: PortfolioItem) {
    setAspects(item.aspects_covered ?? [])
    setEditing(item)
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) return setError(res.error)
      done?.()
      router.refresh()
    })
  }

  function save(form: FormData) {
    const input = {
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      project_type: String(form.get('project_type') ?? ''),
      city: String(form.get('city') ?? ''),
      cover_url: String(form.get('cover_url') ?? ''),
      inspiration: String(form.get('inspiration') ?? ''),
      drive_link: String(form.get('drive_link') ?? ''),
      rough_cost: form.get('rough_cost') ? Number(form.get('rough_cost')) : null,
      aspects_covered: aspects,
    }
    if (editing) {
      run(() => updatePortfolioItem(editing.id, input), () => setEditing(null))
    } else {
      run(() => createPortfolioItem(input), () => setAdding(false))
    }
  }

  return (
    <>
      {error ? <div className="mb-4"><Problem title="That did not save" detail={error} /></div> : null}

      <Card className="mb-5">
        <CardHead
          title="Your studio, on materialdepot.com"
          hint={
            live
              ? `${live} project${live === 1 ? '' : 's'} of yours is on our partners page.`
              : 'We put our partners’ work on our own site. Add a project and send it to us.'
          }
          action={<Button onClick={() => setProfileOpen(true)}><Pencil size={14} /> Studio profile</Button>}
        />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold text-ink">{partner.firm_name}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {partner.bio ?? (
                <span className="text-ink-faint">
                  No description yet. A couple of lines about how you work is what goes under your name on our site.
                </span>
              )}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
              {partner.city ? <span>{partner.city}</span> : null}
              {partner.website ? <span>{partner.website}</span> : null}
              {partner.instagram ? <span>@{partner.instagram.replace(/^@/, '')}</span> : null}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Projects"
          hint="Each one is reviewed before it goes on our site — usually within a couple of days."
          action={<Button variant="primary" onClick={openAdd}><Plus size={15} /> Add a project</Button>}
        />

        {items.length === 0 ? (
          <Empty
            title="Nothing here yet"
            body="Add a finished project — a name, a couple of lines and a cover image is plenty. We put it on our partners page with a link back to you."
            action={<Button variant="primary" onClick={openAdd}><Plus size={15} /> Add your first project</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const s = STATUS[item.status]
              const editable = item.status === 'draft' || item.status === 'rejected'
              return (
                <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{item.title}</p>
                      <Badge tone={s.tone}>
                        {item.status === 'published' ? <Globe size={10} /> : null}
                        {item.status === 'submitted' ? <Clock size={10} /> : null}
                        {s.label}
                      </Badge>
                    </div>
                    {item.summary ? (
                      <p className="mt-0.5 text-sm text-ink-soft">{item.summary}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {[
                        item.project_type,
                        item.city,
                        item.rough_cost ? inr(item.rough_cost) : null,
                        item.aspects_covered?.length ? item.aspects_covered.join(', ') : null,
                      ].filter(Boolean).join(' · ') || s.blurb}
                    </p>
                    {item.status === 'rejected' && item.review_note ? (
                      <p className="mt-1.5 rounded-md bg-warn-soft px-2 py-1 text-xs text-ink-soft">
                        <strong className="text-warn">What we need changed:</strong> {item.review_note}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    {editable ? (
                      <>
                        <Button size="sm" onClick={() => openEdit(item)} disabled={pending}>
                          <Pencil size={13} /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={pending}
                          onClick={() => run(() => submitPortfolioItem(item.id))}
                        >
                          <Send size={13} /> Send to us
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => deletePortfolioItem(item.id))}
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </>
                    ) : (
                      <span className="self-center text-[11px] text-ink-faint">{s.blurb}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={adding || editing !== null}
        onClose={() => { setAdding(false); setEditing(null) }}
        title={editing ? 'Edit this project' : 'Add a project'}
        hint="Only what you are happy for us to publish. You can change it until you send it to us."
      >
        <form action={save} className="space-y-3">
          <Field label="Project name" required>
            <Input name="title" defaultValue={editing?.title ?? ''} placeholder="Terrazzo House, Koramangala" />
          </Field>
          <Field label="Project details" hint="This is the caption under your photographs.">
            <Textarea name="summary" rows={3} defaultValue={editing?.summary ?? ''} />
          </Field>
          <Field label="Inspiration behind it">
            <Textarea name="inspiration" rows={2} defaultValue={editing?.inspiration ?? ''} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select name="project_type" defaultValue={editing?.project_type ?? 'residential'}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                ))}
              </Select>
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={editing?.city ?? ''} />
            </Field>
          </div>
          <Field
            label="Google Drive link for images"
            hint="A folder with your photographs — this is what a viewer opens for the full set."
          >
            <Input name="drive_link" defaultValue={editing?.drive_link ?? ''} placeholder="https://drive.google.com/…" />
          </Field>
          <Field
            label="Cover image"
            hint="A link to a single photograph. Uploading from here is not built yet — paste a URL from wherever your photographs already live."
          >
            <Input name="cover_url" defaultValue={editing?.cover_url ?? ''} placeholder="https://…" />
          </Field>
          <Field label="Rough cost" hint="Optional. What the project came to, roughly.">
            <Input type="number" name="rough_cost" defaultValue={editing?.rough_cost ?? ''} inputMode="numeric" />
          </Field>
          <Field label="Aspects covered" hint="Tick anything that applies.">
            <div className="flex flex-wrap gap-1.5">
              {PORTFOLIO_ASPECTS.map((a) => {
                const on = aspects.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAspects((prev) => (on ? prev.filter((x) => x !== a) : [...prev, a]))}
                    className={[
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                      on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                    ].join(' ')}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { setAdding(false); setEditing(null) }}>
              <X size={14} /> Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Check size={14} /> {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Your studio profile"
        hint="This sits above your projects on our partners page."
      >
        <form
          action={(form) =>
            run(
              () =>
                updateStudioProfile({
                  firm_name: String(form.get('firm_name') ?? ''),
                  contact_name: String(form.get('contact_name') ?? ''),
                  city: String(form.get('city') ?? ''),
                  bio: String(form.get('bio') ?? ''),
                  website: String(form.get('website') ?? ''),
                  instagram: String(form.get('instagram') ?? ''),
                }),
              () => setProfileOpen(false),
            )
          }
          className="space-y-3"
        >
          <Field label="Studio name" required>
            <Input name="firm_name" defaultValue={partner.firm_name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your name" required>
              <Input name="contact_name" defaultValue={partner.contact_name} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={partner.city ?? ''} />
            </Field>
          </div>
          <Field label="About the studio" hint="Two or three sentences. How you work, what you like working on.">
            <Textarea name="bio" rows={4} defaultValue={partner.bio ?? ''} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <Input name="website" defaultValue={partner.website ?? ''} placeholder="https://…" />
            </Field>
            <Field label="Instagram">
              <Input name="instagram" defaultValue={partner.instagram ?? ''} placeholder="studioterra" />
            </Field>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Your phone number, market and account settings are held by Material Depot and are not editable
            here — your key account manager changes those.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
