'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { createProject } from '@/lib/data/actions'
import type { Client, Project } from '@/lib/domain/types'
import { STAGES } from '@/lib/domain/project'
import { date, inrShort } from '@/lib/format'
import { cn } from '@/lib/cn'

const STAGE_TONE = { design: 'info', procurement: 'warn', execution: 'good', closed: 'neutral' } as const

// The column values are snake_case; a badge reading "on_hold" is the database
// leaking onto the screen.
const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Active',
  on_hold: 'On hold',
  won: 'Won',
  lost: 'Lost',
  closed: 'Closed',
}

export function ProjectsView({
  projects,
  clients,
  clientsError,
}: {
  projects: Project[]
  clients: Client[]
  clientsError?: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | Project['stage']>('all')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // /projects?new=1 opens the form — the dashboard's "New project" button uses it.
  useEffect(() => {
    if (params.get('new') === '1') setOpen(true)
  }, [params])

  const shown = filter === 'all' ? projects : projects.filter((p) => p.stage === filter)
  const clientName = new Map(clients.map((c) => [c.id, c.name]))

  function submit(form = new FormData()) {
    setError(null)
    start(async () => {
      const numOrNull = (k: string) => {
        const v = String(form.get(k) ?? '').trim()
        if (!v) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      const res = await createProject({
        client_id: String(form.get('client_id') ?? ''),
        name: String(form.get('name') ?? ''),
        project_type: String(form.get('project_type') ?? 'residential'),
        site_address: String(form.get('site_address') ?? ''),
        city: String(form.get('city') ?? ''),
        carpet_area_sqft: numOrNull('carpet_area_sqft'),
        budget: numOrNull('budget'),
        design_fee: numOrNull('design_fee'),
        target_on: String(form.get('target_on') ?? ''),
      })
      if (!res.ok) return setError(res.error)
      setOpen(false)
      router.push(`/workspace/projects/${(res.data as Project).id}`)
    })
  }

  return (
    <>
      <Card>
        <CardHead
          title={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
          hint="Design → procurement → site"
          action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New project</Button>}
        />

        {projects.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto border-b border-line px-4 py-2.5">
            {(['all', ...STAGES.map((s) => s.key)] as const).map((k) => {
              const count = k === 'all' ? projects.length : projects.filter((p) => p.stage === k).length
              return (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition',
                    filter === k ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-raised hover:text-ink',
                  )}
                >
                  {k === 'all' ? 'All' : STAGES.find((s) => s.key === k)?.label} <span className="tnum opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        ) : null}

        {projects.length === 0 ? (
          <Empty
            title="No projects yet"
            body="A project holds the rooms, the inspiration boards, the quote, the procurement list and the money. Start one."
            action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New project</Button>}
          />
        ) : shown.length === 0 ? (
          <Empty title="Nothing at this stage" body="No project is in that stage right now." />
        ) : (
          <ul className="grid gap-0 divide-y divide-line">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/workspace/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-raised">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-ink-faint">
                      {clientName.get(p.client_id) ?? 'Client'}
                      {p.city ? ` · ${p.city}` : ''}
                      {p.carpet_area_sqft ? ` · ${p.carpet_area_sqft} sqft` : ''}
                    </p>
                  </div>
                  <div className="tnum text-right text-xs text-ink-soft">
                    {p.budget ? <div className="font-medium text-ink">{inrShort(p.budget)}</div> : null}
                    <div className="text-ink-faint">{p.target_on ? `target ${date(p.target_on)}` : `started ${date(p.started_on)}`}</div>
                  </div>
                  <Badge tone={STAGE_TONE[p.stage]}>{STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}</Badge>
                  {p.status !== 'active' ? (
                    <Badge tone={p.status === 'lost' ? 'bad' : 'neutral'}>{STATUS_LABEL[p.status]}</Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New project" hint="You can fill in the rest later.">
        {error ? <div className="mb-3"><Problem title="Could not create it" detail={error} /></div> : null}
        {clientsError ? <div className="mb-3"><Problem title="Clients did not load" detail={clientsError} /></div> : null}
        {clients.length === 0 && !clientsError ? (
          <Empty
            title="Add a client first"
            body="Every project belongs to a client, so that their store visits and orders can be tied back to it."
            action={<Link href="/workspace/clients"><Button variant="primary">Go to Clients</Button></Link>}
          />
        ) : (
          <form action={submit} className="space-y-3">
            <Field label="Client" required>
              <Select name="client_id" defaultValue="">
                <option value="" disabled>Pick a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Project name" required hint="What you call it — “Sharma Residence”, “Indiranagar 3BHK”.">
              <Input name="name" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select name="project_type" defaultValue="residential">
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="hospitality">Hospitality</option>
                  <option value="retail">Retail</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="City"><Input name="city" /></Field>
            </div>
            <Field label="Site address"><Textarea name="site_address" rows={2} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Carpet area" hint="sqft"><Input name="carpet_area_sqft" inputMode="decimal" /></Field>
              <Field label="Budget" hint="₹, whole project"><Input name="budget" inputMode="decimal" /></Field>
              <Field label="Your fee" hint="₹"><Input name="design_fee" inputMode="decimal" /></Field>
            </div>
            <Field label="Target handover"><Input name="target_on" type="date" /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Creating…' : 'Create project'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
