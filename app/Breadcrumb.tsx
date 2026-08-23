import Link from "next/link";

export type Crumb = { label: string; href?: string };

// Server-safe breadcrumb. Every crumb except the last is a link; the current
// page is plain text with aria-current. Styles live in globals.css (.crumbs):
// heading-sized on desktop, a 13px single ellipsised line on mobile.
export default function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`crumbs${className ? ` ${className}` : ""}`}>
      <ol>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} aria-current={last ? "page" : undefined}>
              {!last && c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
