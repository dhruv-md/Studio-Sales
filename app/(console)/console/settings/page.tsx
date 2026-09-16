import { currentActor } from '@/lib/data/session'
import { MyAccount } from '@/components/console/MyAccount'
import { ChangePassword } from '@/components/account/ChangePassword'
import { PageHead } from '@/components/shell/PageHead'
import { Card, CardHead, Problem } from '@/components/ui'

/**
 * The console's own Settings — your account, not the platform's.
 *
 * Every console role gets this page, not just admins. It is where somebody
 * changes the password an admin generated for them, and the console kept: until
 * this page existed the instruction on every welcome message ("please change it
 * after your first sign-in") pointed at nothing, and the retained password in
 * `issued_credential` would have stayed readable for the life of the account.
 *
 * There is no platform configuration here on purpose. Roles, markets and who is
 * on the team live on `/console/staff`, where they are decisions about other
 * people; the slab programme's numbers are versioned source in
 * `lib/domain/slabs.ts` rather than a settings form, for the reason written at
 * the top of that file.
 */
export default async function ConsoleSettingsPage() {
  const actor = await currentActor()

  if (!actor.ok) {
    return (
      <Shell>
        <Problem title="We could not load your account" detail={actor.error} />
      </Shell>
    )
  }
  if (!actor.data || actor.data.kind !== 'staff') {
    return (
      <Shell>
        <Problem
          title="This is the Material Depot team's settings"
          detail="You are signed in, but not as a member of the B2B team."
        />
      </Shell>
    )
  }

  const { staff, email } = actor.data

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <MyAccount me={staff} email={email} />
          <ChangePassword hint="Change the password you were issued. Until you do, an admin on this console can read it." />
        </div>

        <Card>
          <CardHead title="What an admin can and cannot see" hint="Plain version" />
          <div className="space-y-2.5 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            <p>
              The password you were given when your login was created is kept, encrypted, so whoever issued it can send
              it to you again. It is <strong className="text-ink">erased the moment you change it</strong> — and after
              that nobody at Material Depot can read your password, including the people who run this system.
            </p>
            <p>
              Changing it is the only thing that ends that, so it is worth doing on the day you sign in. A password
              reset email from Supabase ends it too; what does not end it is simply never using the account.
            </p>
            <p>
              Every time an admin looks your login up, the lookup is counted and stamped against the row.
            </p>
          </div>
        </Card>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHead title="Settings" hint="Your account. Who you are, and the password you sign in with." />
      <div className="px-4 py-5 md:px-6">{children}</div>
    </>
  )
}
