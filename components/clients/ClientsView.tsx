'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, Field, Input, Problem, Table, Td, Textarea, Th } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/data/actions'
import type { Client, Project } from '@/lib/domain/types'
import { date, inrShort } from '@/lib/format'

export function ClientsView({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const projectsFor = (id: string) => projects.filter((p) => p.client_id === id)

  const shown = clients.filter((c) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [c.name, c.phone, c.city, c.email].some((v) => v?.toLowerCase().includes(needle))
  })

  function submit(form: FormData) {
    setError(null)
    start(async () => {
      const res = await createClient({
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        email: String(form.get('email') ?? ''),
        city: String(form.get('city') ?? ''),
        address: String(form.get('address') ?? ''),
        notes: String(form.get('notes') ?? ''),
      })
      if (!res.ok) return setError(res.error)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Card>
        <CardHead
          title={`${clients.length} client${clients.length === 1 ? '' : 's'}`}
          hint="Everyone you are designing for"
          action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Add client</Button>}
        />

        {clients.length > 3 ? (
          <div className="border-b border-line px-4 py-2.5">
            <div className="relative max-w-xs">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, phone, city…"
                className="pl-8"
              />
            </div>
          </div>
        ) : null}

        {clients.length === 0 ? (
          <Empty
            title="No clients yet"
            body="A client comes first, then their projects. Their phone number is what lets us tie their store visits and orders back to you."
            action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Add your first client</Button>}
          />
        ) : shown.length === 0 ? (
          <Empty title="Nothing matches that" body={`No client matches "${q}".`} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Phone</Th>
                <Th>City</Th>
                <Th>Projects</Th>
                <Th className="text-right">Budget on the books</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const mine = projectsFor(c.id)
                const budget = mine.reduce((s, p) => s + Number(p.budget || 0), 0)
                return (
                  <tr key={c.id} className="transition hover:bg-raised">
                    <Td>
                      <Link href={`/workspace/clients/${c.id}`} className="font-medium text-ink hover:text-brand">
                        {c.name}
                      </Link>
                      {c.email ? <div className="text-xs text-ink-faint">{c.email}</div> : null}
                    </Td>
                    <Td className="tnum text-ink-soft">{c.phone ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td className="text-ink-soft">{c.city ?? '—'}</Td>
                    <Td>
                      {mine.length === 0 ? (
                        <span className="text-xs text-ink-faint">none yet</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {mine.slice(0, 2).map((p) => (
                            <Badge key={p.id} tone="neutral">{p.name}</Badge>
                          ))}
                          {mine.length > 2 ? <Badge>+{mine.length - 2}</Badge> : null}
                        </span>
                      )}
                    </Td>
                    <Td className="tnum text-right text-ink-soft">{budget ? inrShort(budget) : '—'}</Td>
                    <Td className="text-xs text-ink-faint">{date(c.created_at)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a client" hint="Only the name is required.">
        {error ? <div className="mb-3"><Problem title="Could not save" detail={error} /></div> : null}
        <form action={submit} className="space-y-3">
          <Field label="Name" required><Input name="name" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile" hint="10 digits. Needed later if you refer them to us.">
              <Input name="phone" inputMode="numeric" placeholder="9876543210" />
            </Field>
            <Field label="City"><Input name="city" /></Field>
          </div>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Site address"><Textarea name="address" rows={2} /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Add client'}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
