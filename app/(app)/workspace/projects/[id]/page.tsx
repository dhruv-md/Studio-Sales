import { WorkspaceOff } from '@/components/shell/WorkspaceOff'
import { notFound } from 'next/navigation'
import {
  getClient, getProject, listAreas, listBoardItems, listBoards, listFinance,
  listProcurement, listQuoteLines, listQuotes,
} from '@/lib/data/queries'
import { ProjectWorkspace } from '@/components/projects/ProjectWorkspace'
import { currentSession } from '@/lib/data/session'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'
import type { QuoteLine } from '@/lib/domain/types'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  // The project workspace is opt-in per firm. Checked here as well as in
  // the nav: a nav item that is merely hidden is still a URL anyone can type.
  const gate = await currentSession()
  if (gate.ok && gate.data && !gate.data.partner.workspace_enabled) return <WorkspaceOff what="Projects" />

  const { id } = await params

  const [project, session] = await Promise.all([getProject(id), currentSession()])
  if (!project.ok) {
    return (
      <>
        <PageHead title="Project" />
        <div className="px-4 py-5 md:px-6"><Problem title="This project could not be loaded" detail={project.error} /></div>
      </>
    )
  }
  if (!project.data) notFound()
  const p = project.data
  const partner = session.ok ? session.data?.partner : null

  const [client, areas, quotes, procurement, finance] = await Promise.all([
    getClient(p.client_id), listAreas(id), listQuotes(id), listProcurement(id), listFinance(id),
  ])

  const boards = await listBoards(areas.ok ? areas.data.map((a) => a.id) : [])
  const items = await listBoardItems(boards.ok ? boards.data.map((b) => b.id) : [])

  // Lines for every quote up front, so switching version in the UI costs no
  // round trip. One request per quote, issued in parallel — a project rarely
  // has more than a handful of versions.
  const lineResults = await Promise.all((quotes.ok ? quotes.data : []).map((q) => listQuoteLines(q.id)))
  const linesByQuote = new Map<string, QuoteLine[]>()
  ;(quotes.ok ? quotes.data : []).forEach((q, i) => {
    const r = lineResults[i]
    linesByQuote.set(q.id, r.ok ? r.data : [])
  })

  const errors = [
    !client.ok && `client: ${client.error}`,
    !areas.ok && `rooms: ${areas.error}`,
    !boards.ok && `boards: ${boards.error}`,
    !items.ok && `board products: ${items.error}`,
    !quotes.ok && `quotes: ${quotes.error}`,
    !procurement.ok && `procurement: ${procurement.error}`,
    !finance.ok && `ledger: ${finance.error}`,
    ...lineResults.filter((r) => !r.ok).map((r) => (r.ok ? '' : `quote lines: ${r.error}`)),
  ].filter(Boolean) as string[]

  return (
    <ProjectWorkspace
      project={p}
      firm={{
        name: partner?.firm_name ?? 'Your studio',
        contact: partner?.contact_name ?? null,
        phone: partner?.phone ?? null,
        city: partner?.city ?? p.city,
        gst: partner?.gst ?? null,
      }}
      clientName={client.ok ? (client.data?.name ?? null) : null}
      clientPhone={client.ok ? (client.data?.phone ?? null) : null}
      areas={areas.ok ? areas.data : []}
      boards={boards.ok ? boards.data : []}
      items={items.ok ? items.data : []}
      quotes={quotes.ok ? quotes.data : []}
      linesByQuote={Object.fromEntries(linesByQuote)}
      procurement={procurement.ok ? procurement.data : []}
      finance={finance.ok ? finance.data : []}
      errors={errors}
    />
  )
}
