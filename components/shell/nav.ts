import type { LucideIcon } from 'lucide-react'
import {
  Award, Building2, ClipboardCheck, FolderKanban, GalleryVerticalEnd, LayoutDashboard,
  Layers, Palette, PhoneCall, Settings, ShieldCheck, UserPlus, Users, UsersRound,
} from 'lucide-react'
import type { Partner, StaffRole } from '@/lib/domain/types'

export type NavItem = { href: string; label: string; icon: LucideIcon; blurb: string }

/**
 * What a partner sees.
 *
 * Six items, always, in the order the studio-facing revamp asks for: Overview,
 * Clients, Projects, Portfolio, Rewards, Settings. None of them asks a designer
 * to move anything they already have somewhere else.
 *
 * "Projects" here is mood boards and inspiration spaces for a client's job —
 * a different, much lighter feature from the opt-in design/quote/procurement
 * workspace below, which used to sit at this same URL. Do not conflate them.
 *
 * The project workspace (design boards, quotes, procurement, project P&L) is
 * real, finished and hidden. An architect who has just been handed a login by a
 * supplier is not going to put their client's pricing in it, and a sidebar full
 * of modules they have not asked for is what makes the whole thing look like a
 * system to be managed rather than something useful. Material Depot turns it on
 * per firm, from the console, when the firm asks for it.
 */
const PARTNER_CORE: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, blurb: 'Everything at a glance' },
  { href: '/referrals', label: 'Clients', icon: Building2, blurb: 'Who you referred, and what they did' },
  { href: '/projects', label: 'Projects', icon: Palette, blurb: 'Mood boards and inspiration' },
  { href: '/portfolio', label: 'Portfolio', icon: GalleryVerticalEnd, blurb: 'Your work, on our site' },
  { href: '/rewards', label: 'Rewards', icon: Award, blurb: 'Your incentive ladder' },
  { href: '/settings', label: 'Settings', icon: Settings, blurb: 'Your studio, your team, your theme' },
]

/**
 * The opt-in workspace, relocated off `/projects` and `/clients` once those
 * URLs became the core Projects and Clients tabs above. Same code, same
 * `workspace_enabled` gate — only the address and the label changed, so the
 * sidebar never shows two things called "Projects."
 */
const PARTNER_WORKSPACE: NavItem[] = [
  { href: '/workspace/projects', label: 'Design workspace', icon: FolderKanban, blurb: 'Design, quote, procure' },
  { href: '/workspace/clients', label: 'Workspace clients', icon: Layers, blurb: 'Who you are working for' },
]

export function partnerNav(partner: Pick<Partner, 'workspace_enabled'>): NavItem[] {
  return partner.workspace_enabled ? [...PARTNER_CORE, ...PARTNER_WORKSPACE] : PARTNER_CORE
}

/** The routes the workspace flag gates. A page under one of these refuses to
 *  render when the flag is off, so a stale link or a typed URL cannot walk
 *  round the nav. */
export const WORKSPACE_ROUTES = PARTNER_WORKSPACE.map((n) => n.href)

/**
 * What Material Depot's own team sees. Role decides the list.
 *
 * - **admin** — everything, plus the three verification queues and the team.
 * - **kam** — their firms and the reactivation list. No onboarding queue: a KAM
 *   does not file onboarding forms.
 * - **outreach / inbound** — their prospect list and the onboarding form. No
 *   partner directory: an outreach manager works firms that are not on the
 *   platform yet.
 *
 * **Settings is on every one of them.** It is the only place somebody can change
 * the password an admin generated and sent them, and the console holds that
 * password until they do — so hiding it from three of the four roles would leave
 * three of the four roles unable to end that.
 */
const CONSOLE: Record<StaffRole, NavItem[]> = {
  admin: [
    { href: '/console', label: 'Today', icon: LayoutDashboard, blurb: 'What is waiting on you' },
    { href: '/console/approvals', label: 'Verify', icon: ShieldCheck, blurb: 'Orders and portfolios' },
    { href: '/console/applications', label: 'Onboarding', icon: UserPlus, blurb: 'Forms, and issuing logins' },
    { href: '/console/partners', label: 'Firms', icon: Building2, blurb: 'Everyone on the platform' },
    { href: '/console/prospects', label: 'Outreach', icon: PhoneCall, blurb: 'Firms we are talking to' },
    { href: '/console/staff', label: 'Team', icon: UsersRound, blurb: 'Who does what, where' },
    { href: '/console/settings', label: 'Settings', icon: Settings, blurb: 'Your account and password' },
  ],
  kam: [
    { href: '/console', label: 'Today', icon: LayoutDashboard, blurb: 'What is waiting on you' },
    { href: '/console/partners', label: 'My firms', icon: Building2, blurb: 'The firms you look after' },
    { href: '/console/approvals', label: 'Orders', icon: ClipboardCheck, blurb: 'What is waiting on an admin' },
    { href: '/console/settings', label: 'Settings', icon: Settings, blurb: 'Your account and password' },
  ],
  outreach: [
    { href: '/console', label: 'Today', icon: LayoutDashboard, blurb: 'What is waiting on you' },
    { href: '/console/prospects', label: 'My list', icon: PhoneCall, blurb: 'Firms you are talking to' },
    { href: '/console/applications', label: 'Onboarding', icon: UserPlus, blurb: 'Forms you have filed' },
    { href: '/console/settings', label: 'Settings', icon: Settings, blurb: 'Your account and password' },
  ],
  inbound: [
    { href: '/console', label: 'Today', icon: LayoutDashboard, blurb: 'What is waiting on you' },
    { href: '/console/prospects', label: 'Enquiries', icon: PhoneCall, blurb: 'Firms that came to us' },
    { href: '/console/applications', label: 'Onboarding', icon: UserPlus, blurb: 'Forms you have filed' },
    { href: '/console/settings', label: 'Settings', icon: Settings, blurb: 'Your account and password' },
  ],
}

export function consoleNav(role: StaffRole): NavItem[] {
  return CONSOLE[role] ?? CONSOLE.inbound
}
