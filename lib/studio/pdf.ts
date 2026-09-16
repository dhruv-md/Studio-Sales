'use client'

import jsPDF from 'jspdf'
import type { StudioProjectItem, StudioProjectSpace, StudioProjectTemplate } from '@/lib/domain/types'

/**
 * The presentation PDF for a project or a single space. Same shape as the
 * quote PDF (`lib/quote/pdf.ts`) — the firm's own branding, never Material
 * Depot's, because this is the architect's document to hand to their client.
 *
 * Images are fetched and embedded; a fetch that fails (a non-Supabase host
 * with no CORS header, most often) prints the link as text instead of
 * silently dropping the item — this is a downloadable record, so a viewer
 * should be able to tell what was meant to be there.
 */
export async function studioPdf(args: {
  firmName: string
  logoUrl?: string | null
  projectName: string
  clientName?: string | null
  spaces: { space: StudioProjectSpace; items: StudioProjectItem[] }[]
  template?: StudioProjectTemplate | null
}) {
  const { firmName, projectName, clientName, spaces, template } = args
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40

  const accent = hexToRgb(template?.accent_color) ?? ([196, 88, 28] as [number, number, number])
  const INK: [number, number, number] = [32, 27, 22]
  const SOFT: [number, number, number] = [91, 81, 71]

  doc.setFillColor(...accent)
  doc.rect(0, 0, W, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...INK)
  doc.text(projectName, M, 60)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...SOFT)
  doc.text([firmName, clientName ? `for ${clientName}` : null].filter(Boolean).join('  ·  '), M, 78)

  if (template?.intro_note) {
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(template.intro_note, W - 2 * M)
    doc.text(lines, M, 96)
  }

  let y = template?.intro_note ? 120 : 100

  for (const { space, items } of spaces) {
    if (y > H - 140) { doc.addPage(); y = M }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...accent)
    doc.text(space.name, M, y)
    y += 20

    const images = items.filter((i) => i.kind === 'image')
    const links = items.filter((i) => i.kind !== 'image')

    const cols = 2
    const gap = 12
    const cellW = (W - 2 * M - gap * (cols - 1)) / cols
    const cellH = cellW * 0.72
    let col = 0

    for (const item of images) {
      if (y + cellH > H - M) { doc.addPage(); y = M }
      const x = M + col * (cellW + gap)
      const dataUrl = await toDataUrl(item.url)
      if (dataUrl) {
        try {
          doc.addImage(dataUrl.data, dataUrl.format, x, y, cellW, cellH, undefined, 'FAST')
        } catch {
          printLinkFallback(doc, item, x, y, cellW, SOFT)
        }
      } else {
        printLinkFallback(doc, item, x, y, cellW, SOFT)
      }
      if (item.caption) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...SOFT)
        doc.text(item.caption, x, y + cellH + 11, { maxWidth: cellW })
      }
      col = (col + 1) % cols
      if (col === 0) y += cellH + 26
    }
    if (col !== 0) y += cellH + 26

    if (links.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...SOFT)
      for (const l of links) {
        if (y > H - M) { doc.addPage(); y = M }
        const label = l.kind === 'palette_link' ? 'Palette' : 'Product'
        doc.text(`${label}: ${l.caption || l.url}`, M, y)
        y += 14
      }
      y += 8
    }

    y += 10
  }

  doc.save(`${projectName.replace(/[^\w -]/g, '')}.pdf`)
}

function printLinkFallback(doc: jsPDF, item: StudioProjectItem, x: number, y: number, w: number, colour: [number, number, number]) {
  doc.setDrawColor(...colour)
  doc.setFontSize(7)
  doc.setTextColor(...colour)
  doc.text('Image could not be loaded — open it here:', x, y + 10, { maxWidth: w })
  doc.textWithLink(item.url, x, y + 22, { url: item.url, maxWidth: w })
}

async function toDataUrl(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const format = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { data, format }
  } catch {
    return null
  }
}

function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
