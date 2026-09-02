"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = {
  href: string;          // path, optionally with a querystring (e.g. ?role=moderator)
  label: string;
  exact?: boolean;       // active only on an exact path match (default: prefix match)
};

// Active-state aware nav links. Used by the desktop rail and the mobile sheet.
//
// A link's querystring is part of its identity: "/speakers?role=moderator" is
// active only when the page is /speakers AND role=moderator is set, while the
// plain "/speakers" sibling is active only when NONE of the keys its siblings
// distinguish themselves by (here: role) are set. Unrelated params — a stage
// tab, a search, an edition filter — never affect which link lights up.
export default function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Per path: the param keys that any sibling on that path uses to distinguish
  // itself — the keys a paramless sibling must NOT see to count as active.
  const siblingKeys = new Map<string, Set<string>>();
  for (const it of items) {
    const [path, qs] = it.href.split("?");
    const keys = siblingKeys.get(path) ?? new Set<string>();
    new URLSearchParams(qs ?? "").forEach((_v, k) => keys.add(k));
    siblingKeys.set(path, keys);
  }

  return (
    <>
      {items.map((it) => {
        const [path, qs] = it.href.split("?");
        const params = new URLSearchParams(qs ?? "");
        const onPath = it.exact || params.toString()
          ? pathname === path
          : pathname === path || pathname.startsWith(path + "/");

        let active = onPath;
        if (active) {
          if (params.toString()) {
            params.forEach((v, k) => { if (sp.get(k) !== v) active = false; });
          } else {
            for (const k of siblingKeys.get(path) ?? []) if (sp.get(k)) active = false;
          }
        }

        return (
          <Link
            key={it.href}
            href={it.href}
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
