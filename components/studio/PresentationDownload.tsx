'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { StudioProjectItem, StudioProjectSpace } from '@/lib/domain/types'
import { studioPdf } from '@/lib/studio/pdf'

export function PresentationDownload({
  firmName, logoUrl, title, subtitle, spaces,
}: {
  firmName: string
  logoUrl: string | null
  title: string
  subtitle: string | null
  spaces: { space: StudioProjectSpace; items: StudioProjectItem[] }[]
}) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await studioPdf({ firmName, logoUrl, projectName: title, clientName: subtitle, spaces })
        } finally {
          setBusy(false)
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e8e1d8] bg-white px-3 py-2 text-sm font-medium text-[#201b16] transition hover:bg-[#faf8f5] disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} {busy ? 'Preparing…' : 'Download PDF'}
    </button>
  )
}
