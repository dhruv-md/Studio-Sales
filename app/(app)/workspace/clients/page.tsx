import { currentSession } from '@/lib/data/session'
import { WorkspaceOff } from '@/components/shell/WorkspaceOff'
import { listClients, listProjects } from '@/lib/data/queries'
import { ClientsView } from '@/components/clients/ClientsView'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

export default async function ClientsPage() {
  // The project workspace is opt-in per firm. Checked here as well as in
  // the nav: a nav item that is merely hidden is still a URL anyone can type.
  const gate = await currentSession()
  if (gate.ok && gate.data && !gate.data.partner.workspace_enabled) return <WorkspaceOff what="Clients" />

  const [clients, projects] = await Promise.all([listClients(), listProjects()])

  return (
    <>
      <PageHead title="Clients" hint="The people you are designing for, and what you are building for them." />
      <div className="px-4 py-5 md:px-6">
        {!clients.ok ? (
          <Problem title="Clients could not be loaded" detail={clients.error} />
        ) : (
          <>
            {!projects.ok ? (
              <div className="mb-4">
                <Problem title="Project counts are missing" detail={projects.error} />
              </div>
            ) : null}
            <ClientsView clients={clients.data} projects={projects.ok ? projects.data : []} />
          </>
        )}
      </div>
    </>
  )
}
