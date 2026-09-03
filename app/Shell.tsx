import Sidebar, { SignOut, buildNavGroups } from "./Sidebar";
import MobileNav from "./MobileNav";
import { ToastProvider } from "@pmg/team-ui/ui/Toast";
import DialerProvider from "@pmg/team-ui/ui/DialerProvider";
import type { AppUser } from "@/lib/session";

// Resolves the nav once and renders both shells: the desktop left rail and the
// phone top bar + sheet + tab bar. CSS decides which one shows (globals.css,
// 760px breakpoint).
export default function Shell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const groups = buildNavGroups(user);
  return (
    <ToastProvider>
      <DialerProvider>
        <div className="shell">
          <Sidebar user={user} groups={groups} />
          <MobileNav groups={groups} email={user.email} signOut={<SignOut />} />
          <main className="main">{children}</main>
        </div>
      </DialerProvider>
    </ToastProvider>
  );
}
