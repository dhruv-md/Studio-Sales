import { currentSession } from '@/lib/data/session'
import { WorkspaceOff } from '@/components/shell/WorkspaceOff'
import { Suspense } from 'react'
import { listClients, listProjects } from '@/lib/data/queries'
import { ProjectsView } from '@/components/projects/ProjectsView'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

export default async function ProjectsPage() {
  // The project workspace is opt-in per firm. Checked here as well as in
  // the nav: a nav item that is merely hidden is still a URL anyone can type.
  const gate = await currentSession()
  if (gate.ok && gate.data && !gate.data.partner.workspace_enabled) return <WorkspaceOff what="Projects" />

  const [projects, clients] = await Promise.all([listProjects(), listClients()])

  return (
    <>
      <PageHead title="Projects" hint="Every project you are running, and where each one has got to." />
      <div className="px-4 py-5 md:px-6">
        {!projects.ok ? (
          <Problem title="Projects could not be loaded" detail={projects.error} />
        ) : (
          <Suspense>
            <ProjectsView
              projects={projects.data}
              clients={clients.ok ? clients.data : []}
              clientsError={clients.ok ? null : clients.error}
            />
          </Suspense>
        )}
      </div>
    </>
  )
}
