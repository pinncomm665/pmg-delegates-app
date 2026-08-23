"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { confirmLeave } from "../../dirty";

// Valid `?tab=` keys (anything else → first tab):
//   contact       Contact Information   (default — omitted from the URL)
//   history       Contact History
//   registration  Participation (status + registration)
//   background    Background Notes
//   activity      Activity (change log)
// Friendly aliases are accepted too (e.g. ?tab=participation → registration).
type TabKey = "contact" | "history" | "registration" | "background" | "activity";

const TABS: { k: TabKey; label: string }[] = [
  { k: "contact", label: "Contact Information" },
  { k: "history", label: "Contact History" },
  { k: "registration", label: "Participation" },
  { k: "background", label: "Background Notes" },
  { k: "activity", label: "Activity" },
];
const KEYS = TABS.map((t) => t.k);
const ALIAS: Record<string, TabKey> = {
  participation: "registration",
  status: "registration",
  logistics: "registration",
  "contact-history": "history",
  "background-notes": "background",
  notes: "background",
  changes: "activity",
  log: "activity",
};
export function resolveTab(v: string | null | undefined): TabKey {
  const s = (v ?? "").toLowerCase().trim();
  if ((KEYS as string[]).includes(s)) return s as TabKey;
  return ALIAS[s] ?? "contact";
}

// Tab strip for the delegate detail page. The active tab lives in the URL
// (`?tab=`, default = first tab) so links/back/refresh land on the right panel;
// switching uses router.replace without scrolling. Proper tablist semantics with
// arrow-key navigation; the strip scrolls horizontally on narrow screens with
// fade edges. The Contact History panel is lazy-mounted (its fetches only fire
// once that tab is opened). Switching away from a form with unsaved edits asks
// first (app/dirty.ts).
export default function ProfileTabs({
  contact,
  history,
  registration,
  background,
  activity,
}: {
  contact: ReactNode;
  history: ReactNode;
  registration: ReactNode;
  background: ReactNode;
  activity: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab: TabKey = resolveTab(sp.get("tab"));
  const [historyMounted, setHistoryMounted] = useState(tab === "history");
  useEffect(() => { if (tab === "history") setHistoryMounted(true); }, [tab]);

  const select = useCallback((k: TabKey) => {
    if (k === tab) return;
    if (!confirmLeave()) return;
    const p = new URLSearchParams(sp.toString());
    if (k === "contact") p.delete("tab"); else p.set("tab", k);
    // Flash messages belong to the action that produced them, not the next tab.
    p.delete("flash"); p.delete("msg");
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, pathname, sp, tab]);

  // Arrow-key navigation across tabs (roving focus).
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const k = TABS[n].k;
    btnRefs.current[k]?.focus();
    select(k);
  };

  // Fade edges when the strip is scrollable.
  const stripRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ l: false, r: false });
  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setFade({ l: el.scrollLeft > 2, r: max - el.scrollLeft > 2 });
  }, []);
  useEffect(() => {
    measure();
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [measure]);
  // Keep the active tab in view on narrow screens.
  useEffect(() => {
    btnRefs.current[tab]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <>
      <div className={`ptabs-wrap${fade.l ? " fade-l" : ""}${fade.r ? " fade-r" : ""}`}>
        <div ref={stripRef} className="ptabs" role="tablist" aria-label="Delegate profile sections">
          {TABS.map((t, i) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                ref={(el) => { btnRefs.current[t.k] = el; }}
                type="button"
                role="tab"
                id={`ptab-${t.k}`}
                aria-selected={active}
                aria-controls={`ppanel-${t.k}`}
                tabIndex={active ? 0 : -1}
                className="ptab"
                onClick={() => select(t.k)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {TABS.map((t) => {
        const active = tab === t.k;
        // Contact History is fetch-heavy → mount only once it's been opened.
        if (t.k === "history" && !historyMounted) return null;
        const body =
          t.k === "contact" ? contact :
          t.k === "history" ? history :
          t.k === "registration" ? registration :
          t.k === "background" ? background : activity;
        return (
          <div
            key={t.k}
            role="tabpanel"
            id={`ppanel-${t.k}`}
            aria-labelledby={`ptab-${t.k}`}
            hidden={!active}
            className="section"
          >
            {body}
          </div>
        );
      })}
    </>
  );
}
