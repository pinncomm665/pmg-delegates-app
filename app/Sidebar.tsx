import { Suspense } from "react";
import { logout } from "./login/actions";
import { isReviewer, type AppUser } from "@/lib/session";
import NavLinks, { type NavItem } from "./NavLinks";

export function viewItems(user: AppUser): NavItem[] {
  return [
    { href: "/dashboard", label: "Pulse dashboard" },
    { href: "/delegates", label: "All delegates" },
    { href: "/add-contact", label: "Add Contact" },
    { href: "/my-changes", label: "My changes" },
    { href: "/activity", label: "Activity Report" },
    ...(isReviewer(user) ? [{ href: "/admin/queue", label: "Review queue" }] : []),
  ];
}

export const filterItems: NavItem[] = [
  { href: "/delegates?status=identified", label: "Identified" },
  { href: "/delegates?status=invited", label: "Invited" },
  { href: "/delegates?status=registered", label: "Registered" },
  { href: "/delegates?status=confirmed", label: "Confirmed" },
];

export function SignOut() {
  return (
    <form action={logout}>
      <button className="btn" style={{ width: "100%" }} type="submit">
        Sign out
      </button>
    </form>
  );
}

// Desktop left rail (hidden ≤760px — see MobileNav for the phone shell).
export default function Sidebar({ user }: { user: AppUser }) {
  return (
    <aside className="sidebar">
      <div className="brand">PMG Delegates</div>

      <div className="sb-label">Views</div>
      <nav aria-label="Views">
        <Suspense fallback={null}>
          <NavLinks items={viewItems(user)} />
        </Suspense>
      </nav>

      <div className="sb-label">Quick filters</div>
      <nav aria-label="Quick filters">
        <Suspense fallback={null}>
          <NavLinks items={filterItems} />
        </Suspense>
      </nav>

      <div className="spacer" />
      <SignOut />
      <div className="who">{user.email}</div>
    </aside>
  );
}
