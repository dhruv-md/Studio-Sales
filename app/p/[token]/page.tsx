import { notFound } from 'next/navigation'
import { supabaseService } from '@/lib/supabase/server'
import { PresentationPage } from '@/components/studio/PresentationPage'
import type { StudioProjectItem, StudioProjectSpace } from '@/lib/domain/types'

/**
 * The public, read-only presentation for a shared PROJECT — every space on
 * it. No session required (see proxy.ts's exemption for `/p/`); the share
 * token itself is the capability, read here with the service role because no
 * RLS policy grants `anon` access to `studio_project` at all.
 */
export default async function ProjectSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = supabaseService()

  const { data: project } = await svc
    .from('studio_project')
    .select('*, partner:partner_id(firm_name, logo_url)')
    .eq('share_token', token)
    .maybeSingle()
  if (!project) notFound()

  const { data: spaces } = await svc
    .from('studio_project_space')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order')
    .order('created_at')

  const spaceIds = (spaces ?? []).map((s: StudioProjectSpace) => s.id)
  const { data: items } = spaceIds.length
    ? await svc.from('studio_project_item').select('*').in('space_id', spaceIds).order('sort_order').order('created_at')
    : { data: [] as StudioProjectItem[] }

  return (
    <PresentationPage
      firmName={project.partner?.firm_name ?? 'Material Depot partner'}
      logoUrl={project.partner?.logo_url ?? null}
      title={project.name}
      subtitle={project.client_name}
      spaces={(spaces ?? []).map((s: StudioProjectSpace) => ({
        space: s,
        items: (items ?? []).filter((i: StudioProjectItem) => i.space_id === s.id),
      }))}
    />
  )
}
