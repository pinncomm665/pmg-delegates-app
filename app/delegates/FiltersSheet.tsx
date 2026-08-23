"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDialog } from "../useDialog";

// Layout island for the list page's filter <form>. ONE DOM for both shells —
// the CSS in globals.css (.flt-*) decides what it looks like:
//   • desktop (>760px): row 1 = selects + More popover + Apply + Reset,
//     row 2 = search + export buttons — unchanged from before this component.
//   • phone (≤760px): a compact sticky row [search][Filters (n)] and the
//     selects / has_* checkboxes / Apply / Reset / exports live in a bottom
//     sheet (role=dialog, Esc + backdrop close, focus trap, scroll lock).
// The sheet panel is always mounted (its selects are the form's fields), so
// the dialog behaviour is only engaged while it is open on the phone shell.
// The search input is rendered ONCE (it is the form's single `q` field); the
// export buttons carry no form fields so they may appear in both places.
export default function FiltersSheet({
  activeCount,
  extraCount,
  showReset,
  resetHref,
  search,
  exportButtons,
  extras,
  children,
}: {
  activeCount: number;   // brand + edition + has_* filters in force → "Filters (n)"
  extraCount: number;    // has_* only → "More · n"
  showReset: boolean;
  resetHref: string;
  search: ReactNode;
  exportButtons: ReactNode;
  extras: ReactNode;     // the has_* checkbox labels
  children: ReactNode;   // brand + edition selects
}) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sheetId = useId();
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useDialog(close, open);

  // Apply navigates (GET) → close the sheet on any URL change.
  useEffect(() => { setOpen(false); }, [pathname, searchParams]);

  return (
    <>
      {/* Phone: compact sticky row. Desktop: row 2 (search + exports). */}
      <div className="flt-row flt-bar">
        <div className="flt-search">{search}</div>
        <button
          type="button"
          className="btn flt-toggle"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={() => setOpen((o) => !o)}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <div className="flt-exports-desktop">{exportButtons}</div>
      </div>

      {/* Phone: bottom sheet. Desktop: row 1 (plain block, no dialog chrome). */}
      <div
        id={sheetId}
        className={`flt-sheet${open ? " is-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Filters" : undefined}
      >
        {open && <div className="flt-sheet-backdrop" onClick={close} />}
        <div className="flt-sheet-panel" ref={panelRef} tabIndex={-1}>
          <div className="flt-sheet-head">
            <span>Filters</span>
            <button type="button" className="m-menu-btn" aria-label="Close filters" onClick={close}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12" /><path d="M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="flt-row flt-main">
            {children}

            <div className={`flt-more${moreOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="btn flt-more-btn"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((o) => !o)}
              >
                More{extraCount > 0 ? ` · ${extraCount}` : ""}
              </button>
              <div className="card flt-more-pop">{extras}</div>
            </div>

            <button className="btn btn-primary" type="submit" style={{ whiteSpace: "nowrap" }}>Apply</button>
            {showReset && (
              <Link href={resetHref} className="btn" style={{ whiteSpace: "nowrap", textDecoration: "none" }}>Reset</Link>
            )}
          </div>

          <div className="flt-sheet-foot">{exportButtons}</div>
        </div>
      </div>
    </>
  );
}
