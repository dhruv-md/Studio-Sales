import { listReferrals, listStudioProjects } from '@/lib/data/queries'
import { ProjectsListView } from '@/components/studio/ProjectsListView'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

/**
 * Projects — mood boards and inspiration spaces. A different, much lighter
 * feature from the opt-in design/quote/procurement workspace that used to
 * live at this URL (now `/workspace/projects`) — see `docs/projects.md`.
 */
export default async function StudioProjectsPage() {
  const [projects, referrals] = await Promise.all([listStudioProjects(), listReferrals()])

  return (
    <>
      <PageHead title="Projects" hint="Mood boards and design inspiration for the work you are doing." />
      <div className="px-4 py-5 md:px-6">
        {!projects.ok ? (
          <Problem title="Projects could not be loaded" detail={projects.error} />
        ) : (
          <ProjectsListView
            projects={projects.data}
            referrals={referrals.ok ? referrals.data : []}
            referralsError={referrals.ok ? null : referrals.error}
          />
        )}
      </div>
    </>
  )
}
