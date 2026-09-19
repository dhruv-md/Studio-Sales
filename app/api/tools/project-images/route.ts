import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/data/session'

/**
 * Server proxy to Material Depot's project-image R2 store.
 *
 * Two upstream endpoints, both protected by a static `X-Api-Key`:
 *   POST {BASE}/project-images/         — multipart upload (project_name, subfolder, file[])
 *   GET  {BASE}/project-images/list/    — ?project_name=&subfolder=
 *
 * The key is server-only and never reaches the browser (same rule as the
 * cart/order snapshot proxy). We gate on the caller's own partner session
 * first — this is a partner-app feature — then attach the key and forward.
 * Body and status are passed through so the client sees the real 201/400/500.
 *
 * NOTE on Vercel: serverless functions cap the request body at ~4.5MB, so a
 * 10MB file uploaded through this proxy would fail there. Fine against a local
 * Django / dev backend; a production upload path would post to R2 directly with
 * a short-lived signed URL rather than streaming bytes through the function.
 */
const BASE = process.env.MD_SNAPSHOT_API_BASE || 'https://api-dev2.materialdepot.in/apiV1'
const KEY = process.env.MD_SNAPSHOT_API_KEY

async function gate() {
  const session = await currentSession()
  if (!session.ok) return { status: 500 as const, error: session.error }
  if (!session.data) return { status: 401 as const, error: 'Sign in first.' }
  if (!KEY) return { status: 503 as const, error: 'MD_SNAPSHOT_API_KEY is not set on the server.' }
  return null
}

export async function POST(req: Request) {
  const blocked = await gate()
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form.' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`${BASE}/project-images/`, {
      method: 'POST',
      headers: { 'X-Api-Key': KEY as string },
      body: form,
    })
  } catch (e) {
    return NextResponse.json({ error: `The image service could not be reached: ${(e as Error).message}` }, { status: 502 })
  }

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export async function GET(req: Request) {
  const blocked = await gate()
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status })

  const { searchParams } = new URL(req.url)
  const project_name = searchParams.get('project_name')
  const subfolder = searchParams.get('subfolder')
  if (!project_name || !subfolder) {
    return NextResponse.json({ error: 'project_name and subfolder are required.' }, { status: 400 })
  }

  const qs = new URLSearchParams({ project_name, subfolder })
  let res: Response
  try {
    res = await fetch(`${BASE}/project-images/list/?${qs.toString()}`, {
      headers: { 'X-Api-Key': KEY as string },
      cache: 'no-store',
    })
  } catch (e) {
    return NextResponse.json({ error: `The image service could not be reached: ${(e as Error).message}` }, { status: 502 })
  }

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
