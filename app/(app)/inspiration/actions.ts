'use server'

import { searchInspiration, type InspoSearch, type InspoPage } from '@/lib/data/inspiration'
import type { Result } from '@/lib/data/result'

/**
 * Load one more page for the gallery's infinite scroll. A thin server-action
 * wrapper so the client component never learns the Django endpoint or its base
 * URL — same reason the snapshot tool is proxied.
 */
export async function moreInspiration(params: InspoSearch): Promise<Result<InspoPage>> {
  return searchInspiration(params)
}
