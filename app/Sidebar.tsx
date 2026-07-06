import Link from "next/link";
import { logout } from "./login/actions";
import type { AppUser } from "@/lib/session";

export default function Sidebar({ user }: { user: AppUser }) {
  return (
    <aside className="sidebar">
      <div className="brand">PMG Delegates</div>

      <div className="sb-label">Views</div>
      <nav>
        <Link href="/dashboard">Pulse dashboard</Link>
        <Link href="/delegates">All delegates</Link>
        {user.role === "admin" && <Link href="/admin/queue">Review queue</Link>}
      </nav>

      <div className="sb-label">Quick filters</div>
      <nav>
        <Link href="/delegates?status=identified">Identified</Link>
        <Link href="/delegates?status=invited">Invited</Link>
        <Link href="/delegates?status=registered">Registered</Link>
        <Link href="/delegates?status=confirmed">Confirmed</Link>
      </nav>

      <div className="spacer" />
      <form action={logout}>
        <button className="btn" style={{ width: "100%" }} type="submit">
          Sign out
        </button>
      </form>
      <div className="who">{user.email}</div>
    </aside>
  );
}
