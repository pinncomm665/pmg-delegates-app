"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavLinks, { type NavItem } from "./NavLinks";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Phone shell (≤760px, see globals.css): a compact sticky top bar with a
// hamburger that opens a slide-in navigation sheet (Esc / backdrop close,
// focus trap, body scroll lock) + a fixed 3-item bottom tab bar.
export default function MobileNav({
  views,
  filters,
  email,
  signOut,
}: {
  views: NavItem[];
  filters: NavItem[];
  email: string;
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Route change → close the sheet.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Open: lock scroll, move focus in. Close: unlock, restore focus to the button.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const firstEl = nodes[0], lastEl = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      btnRef.current?.focus();
    };
  }, [open, close]);

  const tabActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <>
      <div className="m-topbar">
        <span className="brand">PMG Delegates</span>
        <button
          ref={btnRef}
          type="button"
          className="m-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? (
              <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
            ) : (
              <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>
            )}
          </svg>
        </button>
      </div>

      <div id={sheetId} className="m-sheet" hidden={!open} role="dialog" aria-modal="true" aria-label="Navigation">
        {open && (
          <>
            <div className="m-sheet-backdrop" onClick={close} />
            <div className="m-sheet-panel" ref={panelRef}>
              <div className="brand">
                <span>PMG Delegates</span>
                <button type="button" className="m-menu-btn" aria-label="Close menu" onClick={close}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12" /><path d="M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="sb-label">Views</div>
              <nav aria-label="Views">
                <Suspense fallback={null}><NavLinks items={views} onNavigate={close} /></Suspense>
              </nav>
              <div className="sb-label">Quick filters</div>
              <nav aria-label="Quick filters">
                <Suspense fallback={null}><NavLinks items={filters} onNavigate={close} /></Suspense>
              </nav>
              <div className="spacer" />
              {signOut}
              <div className="who">{email}</div>
            </div>
          </>
        )}
      </div>

      <nav className="m-tabbar" aria-label="Primary">
        <Link href="/dashboard" className={tabActive("/dashboard") ? "active" : undefined} aria-current={tabActive("/dashboard") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
          Dashboard
        </Link>
        <Link href="/delegates" className={tabActive("/delegates") ? "active" : undefined} aria-current={tabActive("/delegates") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
            <circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.5a5 5 0 0 1 6 5" />
          </svg>
          Delegates
        </Link>
        <Link href="/add-contact" className={tabActive("/add-contact") ? "active" : undefined} aria-current={tabActive("/add-contact") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
            <path d="M19 8v6" /><path d="M16 11h6" />
          </svg>
          Add Contact
        </Link>
      </nav>
    </>
  );
}
