"use client";

import { useEffect, useRef, useState } from "react";

// Floating JustCall dialer — ported from pmg-sales-app (itself from the pmg-agent
// prospector). Auth happens INSIDE the JustCall iframe (agents log in once with
// the shared account; the browser persists the session), so there are no API
// keys or env vars here. Completed calls log to call_logs automatically via
// pmg-agent's existing JustCall webhook.
export default function DialerPanel({
  open,
  onClose,
  numberToDial,
  contactName,
  dialToken,
}: {
  open: boolean;
  onClose: () => void;
  numberToDial?: string | null;
  contactName?: string | null;
  dialToken?: number; // bump to re-dial the same number
}) {
  const dialerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { JustCallDialer } = await import("@justcall/justcall-dialer-sdk");
        const dialer = new JustCallDialer({ dialerId: "justcall-dialer-container" });
        dialerRef.current = dialer;
        if (mounted) setReady(true);
      } catch (err) {
        console.error("[JustCall] init failed:", err);
      }
    }
    init();
    return () => {
      mounted = false;
      if (dialerRef.current?.destroy) {
        dialerRef.current.destroy();
        dialerRef.current = null;
      }
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!open || !ready || !numberToDial || !dialerRef.current) return;
    (async () => {
      try {
        await dialerRef.current.ready();
        dialerRef.current.dialNumber(numberToDial);
      } catch (err) {
        console.error("[JustCall] dial failed:", err);
      }
    })();
  }, [open, ready, numberToDial, dialToken]);

  return (
    <div
      className="card dialer-panel"
      style={{
        opacity: open ? 1 : 0,
        // visibility (not just opacity) — an opacity-0 panel left its close
        // button in the tab order as an invisible focus stop on every page.
        visibility: open ? "visible" : "hidden",
        transform: open ? "translateY(0)" : "translateY(16px)",
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <div className="dialer-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{contactName || "JustCall dialer"}</div>
          {numberToDial && <div className="muted" style={{ fontSize: 12 }}>{numberToDial}</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} title="Close dialer" aria-label="Close dialer">✕</button>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div id="justcall-dialer-container" style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
