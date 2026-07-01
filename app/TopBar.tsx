import Link from "next/link";
import { logout } from "./login/actions";
import type { AppUser } from "@/lib/session";

export default function TopBar({ user }: { user: AppUser }) {
  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/delegates" className="brand" style={{ color: "inherit" }}>
          PMG Delegates
        </Link>
        {user.role === "admin" && (
          <Link href="/admin/queue" style={{ fontSize: 14 }}>
            Review queue
          </Link>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {user.email}
        </span>
        <form action={logout}>
          <button className="btn" type="submit" style={{ padding: "6px 10px" }}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
