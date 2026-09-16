import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/data/session'
import { supabaseService } from '@/lib/supabase/server'

/**
 * The first file-upload capability in this app — for Projects-tab space
 * media, and offered as an upgrade on Portfolio's cover-image field.
 *
 * The `studio-media` bucket (007_studio_v2.sql) has NO storage.objects policy
 * for `authenticated`, on purpose: this route is the only door in. It checks
 * the caller's own session first (a signed-in partner, same as every other
 * partner write), then uploads with the service role — a permissive client
 * policy would also let one firm overwrite another's files by guessing a
 * path, which this avoids by never letting the client touch storage directly.
 *
 * 15MB cap and an image/video allow-list — this is inspiration media, not a
 * general file drop.
 */
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']

export async function POST(req: Request) {
  const session = await currentSession()
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: 500 })
  if (!session.data) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file sent.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 15MB.' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `${file.type || 'That file type'} is not supported here — images or short videos only.` }, { status: 400 })
  }

  const svc = supabaseService()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : file.type.split('/')[1]
  const path = `${session.data.partner.id}/${crypto.randomUUID()}.${ext}`

  const { error } = await svc.storage.from('studio-media').upload(path, file, { contentType: file.type })
  if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })

  const { data } = svc.storage.from('studio-media').getPublicUrl(path)
  return NextResponse.json({ ok: true, url: data.publicUrl })
}
