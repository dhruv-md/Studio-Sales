'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Referral, StudioProject } from '@/lib/domain/types'
import {
  Button, Card, Empty, Field, Input, Problem, Select, Textarea,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { createStudioProject } from '@/lib/data/actions'

type ClientMode = 'none' | 'referred' | 'manual'

export function ProjectsListView({
  projects, covers, referrals, referralsError,
}: {
  projects: StudioProject[]
  covers: Record<string, string>
  referrals: Referral[]
  referralsError?: string | null
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [clientMode, setClientMode] = useState<ClientMode>('none')
  const [projectType, setProjectType] = useState<'residential' | 'commercial' | 'other'>('residential')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setError(null)
    start(async () => {
      const res = await createStudioProject({
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        project_type: projectType,
        project_type_other: projectType === 'other' ? String(form.get('project_type_other') ?? '') : null,
        city: String(form.get('city') ?? ''),
        society: String(form.get('society') ?? ''),
        referral_id: clientMode === 'referred' ? String(form.get('referral_id') ?? '') || null : null,
        client_name: clientMode === 'manual' ? String(form.get('client_name') ?? '') : null,
        client_phone: clientMode === 'manual' ? String(form.get('client_phone') ?? '') : null,
      })
      if (!res.ok) return setError(res.error)
      setAdding(false)
      setClientMode('none')
      router.push(`/projects/${res.data.id}`)
    })
  }

  return (
    <>
      {error ? <div className="mb-4"><Problem title="Could not save" detail={error} /></div> : null}
      {referralsError ? <div className="mb-4"><Problem title="Your clients could not be loaded" detail={referralsError} /></div> : null}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-soft">{projects.length} project{projects.length === 1 ? '' : 's'}</p>
        <Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> New project</Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <Empty
            title="No projects yet"
            body="Start a project for a client — referred or not — and save design inspiration into it, space by space."
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> New project</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="overflow-hidden transition hover:border-line-strong">
                <div className="aspect-[4/3] bg-raised">
                  {covers[p.id] || p.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={covers[p.id] || p.cover_url!} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-ink-faint">No images yet</div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate font-medium text-ink">{p.name}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {[p.client_name, p.city, p.project_type].filter(Boolean).join(' · ') || 'No details yet'}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New project" hint="Rooms, boards and inspiration all hang off this.">
        <form action={submit} className="space-y-3">
          <Field label="Project name" required><Input name="name" required /></Field>
          <Field label="Description"><Textarea name="description" rows={2} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={projectType} onChange={(e) => setProjectType(e.target.value as typeof projectType)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            {projectType === 'other' ? (
              <Field label="Describe it"><Input name="project_type_other" /></Field>
            ) : (
              <Field label="City"><Input name="city" /></Field>
            )}
          </div>
          {projectType === 'other' ? <Field label="City"><Input name="city" /></Field> : null}
          <Field label="Society / building"><Input name="society" /></Field>

          <Field label="Client">
            <Select value={clientMode} onChange={(e) => setClientMode(e.target.value as ClientMode)}>
              <option value="none">No client yet — just the project</option>
              <option value="referred">One of my referred clients</option>
              <option value="manual">Someone I have not referred</option>
            </Select>
          </Field>
          {clientMode === 'referred' ? (
            <Field label="Which client" hint="Autofills their name and number.">
              <Select name="referral_id" defaultValue="">
                <option value="" disabled>Choose one</option>
                {referrals.map((r) => (
                  <option key={r.id} value={r.id}>{r.client_name} — {r.md_phone}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          {clientMode === 'manual' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Their name"><Input name="client_name" /></Field>
              <Field label="Their number"><Input name="client_phone" inputMode="numeric" /></Field>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Creating…' : 'Create project'}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
