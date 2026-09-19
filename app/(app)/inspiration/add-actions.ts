'use server'

import { listStudioProjects, listStudioSpaces } from '@/lib/data/queries'

/**
 * Client-callable wrappers so the "Add to project" picker on an inspiration
 * card can list the partner's projects and a project's spaces. Both are
 * RLS-scoped to the caller's firm, same as everywhere else.
 */
export async function listProjectsForAdd() {
  return listStudioProjects()
}

export async function listSpacesForAdd(projectId: string) {
  return listStudioSpaces(projectId)
}
