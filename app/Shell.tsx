import Sidebar from "./Sidebar";
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
      <main className="main">{children}</main>
    </div>
  );
}
