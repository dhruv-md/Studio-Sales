import type { LucideIcon } from 'lucide-react'
import {
  Award, Building2, ClipboardCheck, GalleryVerticalEnd, LayoutDashboard,
  Palette, PhoneCall, Settings, ShieldCheck, UserPlus, Users, UsersRound,
} from 'lucide-react'
import type { Partner, StaffRole } from '@/lib/domain/types'

export type NavItem = { href: string; label: string; icon: LucideIcon; blurb: string }

/**
 * What a partner sees.
 *
 * Five items, always. Referred clients, rewards and portfolio are the whole
 * proposition on day one — see what your clients did with us, see what you have
 * earned, get your work on our site — and none of them asks a designer to move
 * anything they already have somewhere else.
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
  { href: '/referrals', label: 'Your clients', icon: Building2, blurb: 'What they did at Material Depot' },
  { href: '/rewards', label: 'Rewards', icon: Award, blurb: 'Your incentive ladder' },
  { href: '/portfolio', label: 'Portfolio', icon: GalleryVerticalEnd, blurb: 'Your work, on our site' },
  { href: '/settings', label: 'Settings', icon: Settings, blurb: 'Your studio, your team, your theme' },
]

const PARTNER_WORKSPACE: NavItem[] = [
  { href: '/projects', label: 'Projects', icon: Palette, blurb: 'Design, quote, procure' },
  { href: '/clients', label: 'Clients', icon: Users, blurb: 'Who you are working for' },
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
