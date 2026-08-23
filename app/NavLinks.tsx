"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = {
  href: string;          // path, optionally with a querystring (quick filters)
  label: string;
  exact?: boolean;       // active only on an exact path match (default: prefix match)
};

// Active-state aware nav links. Used by the desktop rail and the mobile sheet.
//   - path links: active when the current pathname matches (prefix unless exact)
//   - quick-filter links (href carries ?status=…): active when the current page is
//     /delegates AND the status param matches; they also PRESERVE the current
//     edition/brand so a filter click never drops the event context.
export default function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const curStatus = sp.get("status") ?? "";

  return (
    <>
      {items.map((it) => {
        const [path, qs] = it.href.split("?");
        const params = new URLSearchParams(qs ?? "");
        const wantStatus = params.get("status");
        let active: boolean;
        let href = it.href;

        if (wantStatus !== null) {
          // Quick filter → keep the current event context on the list page.
          active = pathname === "/delegates" && curStatus === wantStatus;
          if (pathname === "/delegates") {
            for (const k of ["edition", "brand"]) {
              const v = sp.get(k);
              if (v) params.set(k, v);
            }
            href = `${path}?${params.toString()}`;
          }
        } else if (path === "/delegates") {
          // "All delegates" — the list without a stage quick-filter applied.
          active = pathname === "/delegates" && !curStatus;
        } else {
          active = it.exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");
        }

        return (
          <Link
            key={it.href}
            href={href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            {it.label}
          </Link>
        );
      })}
    </>
  );
}
