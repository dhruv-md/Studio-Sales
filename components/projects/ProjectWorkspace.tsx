'use client'

import { useState } from 'react'
import { Banknote, ClipboardList, FileText, LayoutGrid, Palette } from 'lucide-react'
import type {
  Board, BoardItem, FinanceEntry, ProcurementItem, Project, ProjectArea, Quote, QuoteLine,
} from '@/lib/domain/types'
import { PageHead } from '@/components/shell/PageHead'
import { Badge, Problem } from '@/components/ui'
import { OverviewTab } from './OverviewTab'
import { DesignTab } from '@/components/design/DesignTab'
import { QuoteTab } from '@/components/quote/QuoteTab'
import { ProcurementTab } from '@/components/procurement/ProcurementTab'
import { MoneyTab } from '@/components/finance/MoneyTab'
import { STAGES } from '@/lib/domain/project'
import { cn } from '@/lib/cn'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'design', label: 'Design', icon: Palette },
  { key: 'quote', label: 'Quote', icon: FileText },
  { key: 'procurement', label: 'Procurement', icon: ClipboardList },
  { key: 'money', label: 'Money', icon: Banknote },
] as const

type TabKey = (typeof TABS)[number]['key']

export type Firm = {
  name: string
  contact: string | null
  phone: string | null
  city: string | null
  gst: string | null
}

export type WorkspaceProps = {
  project: Project
  /** The partner's own details — needed on the client-facing quote PDF. */
  firm: Firm
  clientName: string | null
  clientPhone: string | null
  areas: ProjectArea[]
  boards: Board[]
  items: BoardItem[]
  quotes: Quote[]
  linesByQuote: Record<string, QuoteLine[]>
  procurement: ProcurementItem[]
  finance: FinanceEntry[]
  errors: string[]
}

export function ProjectWorkspace(props: WorkspaceProps) {
  const { project, clientName, errors } = props
  const [tab, setTab] = useState<TabKey>(
    // Open on the tab that matches where the project actually is, so the
    // architect lands on the work rather than on a summary they then click past.
    project.stage === 'procurement' ? 'procurement' : project.stage === 'execution' ? 'procurement' : 'overview',
  )

  const counts: Record<TabKey, number | null> = {
    overview: null,
    design: props.areas.filter((a) => a.status !== 'dropped').length,
    quote: props.quotes.length,
    procurement: props.procurement.filter((i) => i.status !== 'cancelled').length,
    money: props.finance.length,
  }

  return (
    <>
      <PageHead
        title={project.name}
        crumbs={[{ href: '/workspace/projects', label: 'Projects' }, { label: project.name }]}
        hint={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{clientName ?? 'Client'}</span>
            {project.city ? <span className="text-ink-faint">· {project.city}</span> : null}
            {project.carpet_area_sqft ? <span className="text-ink-faint">· {project.carpet_area_sqft} sqft</span> : null}
          </span>
        }
        action={
          <Badge tone={project.stage === 'design' ? 'info' : project.stage === 'procurement' ? 'warn' : 'good'}>
            {STAGES.find((s) => s.key === project.stage)?.label ?? project.stage}
          </Badge>
        }
      />

      <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface/95 px-3 py-2 backdrop-blur md:px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
              tab === t.key ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-raised hover:text-ink',
            )}
          >
            <t.icon size={14} />
            {t.label}
            {counts[t.key] ? <span className="tnum text-[11px] opacity-60">{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-5 px-4 py-5 md:px-6">
        {errors.length ? (
          <Problem
            title={`${errors.length} part${errors.length === 1 ? '' : 's'} of this page could not load`}
            detail={errors.join(' · ')}
          />
        ) : null}

        {tab === 'overview' ? <OverviewTab {...props} onGo={setTab} /> : null}
        {tab === 'design' ? <DesignTab {...props} /> : null}
        {tab === 'quote' ? <QuoteTab {...props} /> : null}
        {tab === 'procurement' ? <ProcurementTab {...props} /> : null}
        {tab === 'money' ? <MoneyTab {...props} /> : null}
      </div>
    </>
  )
}
