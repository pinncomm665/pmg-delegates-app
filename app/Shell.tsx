import Sidebar, { SignOut, filterItems, viewItems } from "./Sidebar";
import MobileNav from "./MobileNav";
import type { AppUser } from "@/lib/session";

export default function Shell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <Sidebar user={user} />
      <MobileNav views={viewItems(user)} filters={filterItems} email={user.email} signOut={<SignOut />} />
      <main className="main">{children}</main>
    </div>
  );
}
