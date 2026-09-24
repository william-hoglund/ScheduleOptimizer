import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SkipLink } from "@/components/layout/skip-link";
import { TopBar } from "@/components/layout/top-bar";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile-service";

/**
 * The authoritative access check for every page in the app.
 *
 * proxy.ts also redirects signed-out visitors, but that is an optimistic
 * convenience that Next's own docs warn not to rely on. This runs during the
 * render, and Row Level Security backs it at the database — three layers, so no
 * single mistake exposes another student's data.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  // Setup comes first. Onboarding lives in its own route group, so this cannot
  // bounce back and forth.
  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-dvh">
      <SkipLink />

      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userId={user.id}
          email={profile?.email ?? user.email ?? ""}
          fullName={profile?.full_name ?? null}
        />

        {/*
          pb-24 leaves room for the mobile bottom bar; it is cleared at lg.
          tabIndex={-1} makes the skip link actually land here: a <main> is not
          focusable by default, and some screen readers then jump the anchor
          without moving the reading position.
        */}
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
