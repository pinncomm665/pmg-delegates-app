import { Suspense } from "react";
import Link from "next/link";
import { logout } from "./login/actions";
import { isReviewer, type AppUser } from "@/lib/session";
import NavLinks, { type NavItem } from "./NavLinks";
import { NAV_SECTIONS, type NavGroups } from "./navModel";
export type { NavGroups } from "./navModel";

export const listItems: NavItem[] = [
  { href: "/delegates", label: "All delegates" },
];

export function actionItems(user: AppUser): NavItem[] {
  return [
    { href: "/add-contact", label: "Add Contact" },
    { href: "/my-changes", label: "My changes" },
    ...(isReviewer(user) ? [{ href: "/admin/queue", label: "Review queue" }] : []),
  ];
}

export const reportItems: NavItem[] = [
  { href: "/activity", label: "Activity Report" },
  { href: "/dashboard", label: "Pulse dashboard" },
];

export function buildNavGroups(user: AppUser): NavGroups {
  return { lists: listItems, actions: actionItems(user), reports: reportItems };
}

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
export default function Sidebar({ user, groups }: { user: AppUser; groups: NavGroups }) {
  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand brand-link" aria-label="PMG Delegates — Pulse dashboard">
        PMG Delegates
      </Link>

      {NAV_SECTIONS.map(({ key, label }) =>
        groups[key].length > 0 ? (
          <div key={key}>
            <div className="sb-label">{label}</div>
            <nav aria-label={label}>
              <Suspense fallback={null}>
                <NavLinks items={groups[key]} />
              </Suspense>
            </nav>
          </div>
        ) : null
      )}

      <div className="spacer" />
      <SignOut />
      <div className="who">{user.email}</div>
    </aside>
  );
}
