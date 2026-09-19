'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * The one upload control in this app.
 *
 * By default it uploads to the Supabase `studio-media` bucket via
 * `app/api/upload/route.ts`. Pass `r2={{ projectName, subfolder }}` and it
 * instead uploads a project image to Material Depot's R2 store via
 * `app/api/tools/project-images` — `projects/<project>/<subfolder>/…` — and
 * returns that public URL. Either way it reports a plain-language error rather
 * than the raw fetch failure, since it is used inline in forms.
 */
export function Uploader({
  accept = 'image/*,video/mp4,video/quicktime,video/webm',
  onUploaded,
  onError,
  label = 'Upload',
  r2,
}: {
  accept?: string
  onUploaded: (url: string) => void
  onError?: (message: string) => void
  label?: string
  /** When set, upload to the R2 project-image store instead of Supabase. */
  r2?: { projectName: string; subfolder: string }
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.set('file', file)
      if (r2) {
        form.set('project_name', r2.projectName)
        form.set('subfolder', r2.subfolder)
        const res = await fetch('/api/tools/project-images', { method: 'POST', body: form })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Upload failed.')
        const url = Array.isArray(body.images) ? body.images[0] : undefined
        if (!url) throw new Error('Upload succeeded but no URL came back.')
        // Folder names can contain spaces; encode so the stored URL is valid.
        onUploaded(encodeURI(url as string))
      } else {
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Upload failed.')
        onUploaded(body.url as string)
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick(file)
        }}
      />
      <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? 'Uploading…' : label}
      </Button>
    </>
  )
}
