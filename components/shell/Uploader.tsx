'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * The one upload control in this app, behind `app/api/upload/route.ts`.
 * Reports a plain-language error rather than the raw fetch failure — this is
 * used inline in forms where a stack trace means nothing to a partner.
 */
export function Uploader({
  accept = 'image/*,video/mp4,video/quicktime,video/webm',
  onUploaded,
  onError,
  label = 'Upload',
}: {
  accept?: string
  onUploaded: (url: string) => void
  onError?: (message: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Upload failed.')
      onUploaded(body.url as string)
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
