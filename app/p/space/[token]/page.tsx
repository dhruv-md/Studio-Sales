import { notFound } from 'next/navigation'
import { supabaseService } from '@/lib/supabase/server'
import { PresentationPage } from '@/components/studio/PresentationPage'

/** The public, read-only presentation for a shared SPACE — one room's worth
 *  of inspiration, not the whole project. Same token-as-capability shape as
 *  the project page above. */
export default async function SpaceSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = supabaseService()

  const { data: space } = await svc.from('studio_project_space').select('*').eq('share_token', token).maybeSingle()
  if (!space) notFound()

  const { data: project } = await svc
    .from('studio_project')
    .select('name, client_name, partner:partner_id(firm_name, logo_url)')
    .eq('id', space.project_id)
    .maybeSingle()

  const { data: items } = await svc
    .from('studio_project_item')
    .select('*')
    .eq('space_id', space.id)
    .order('sort_order')
    .order('created_at')

  const partner = Array.isArray(project?.partner) ? project?.partner[0] : project?.partner

  return (
    <PresentationPage
      firmName={partner?.firm_name ?? 'Material Depot partner'}
      logoUrl={partner?.logo_url ?? null}
      title={project?.name ?? space.name}
      subtitle={project?.client_name}
      spaces={[{ space, items: items ?? [] }]}
    />
  )
}
