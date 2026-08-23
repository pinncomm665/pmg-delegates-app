import Sidebar, { SignOut, filterItems, viewItems } from "./Sidebar";
import MobileNav from "./MobileNav";
import { ToastProvider } from "./Toast";
import DialerProvider from "./DialerProvider";
import type { AppUser } from "@/lib/session";

export default function Shell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <DialerProvider>
        <div className="shell">
          <Sidebar user={user} />
          <MobileNav views={viewItems(user)} filters={filterItems} email={user.email} signOut={<SignOut />} />
          <main className="main">{children}</main>
        </div>
      </DialerProvider>
    </ToastProvider>
  );
}
