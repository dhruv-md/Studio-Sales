import { notFound } from 'next/navigation'
import { currentSession } from '@/lib/data/session'
import { getStudioProject, listStudioItems, listStudioSpaces, listStudioTemplates } from '@/lib/data/queries'
import { ProjectDetailView } from '@/components/studio/ProjectDetailView'
import { PageHead } from '@/components/shell/PageHead'
import { Problem } from '@/components/ui'

export default async function StudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, session] = await Promise.all([getStudioProject(id), currentSession()])

  if (!project.ok) {
    return (
      <>
        <PageHead title="Project" />
        <div className="px-4 py-5 md:px-6"><Problem title="This project could not be loaded" detail={project.error} /></div>
      </>
    )
  }
  if (!project.data) notFound()

  const [spaces, templates] = await Promise.all([listStudioSpaces(id), listStudioTemplates()])
  const items = await listStudioItems(spaces.ok ? spaces.data.map((s) => s.id) : [])

  const errors = [
    !spaces.ok && `spaces: ${spaces.error}`,
    !items.ok && `items: ${items.error}`,
    !templates.ok && `presentation styles: ${templates.error}`,
  ].filter(Boolean) as string[]

  const partner = session.ok ? session.data?.partner : null

  return (
    <ProjectDetailView
      project={project.data}
      spaces={spaces.ok ? spaces.data : []}
      items={items.ok ? items.data : []}
      template={templates.ok ? (templates.data[0] ?? null) : null}
      firmName={partner?.firm_name ?? 'Your studio'}
      logoUrl={partner?.logo_url ?? null}
      errors={errors}
    />
  )
}
