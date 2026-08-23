"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Bottom-centre toast stack. Each toast lives 15 s (or until dismissed), can
// carry one action (e.g. "Undo") and a link (e.g. "Sign in"). role="status" so
// screen readers announce it without stealing focus.
export type ToastInput = {
  message: string;
  tone?: "ok" | "warn";
  action?: { label: string; onClick: () => void | Promise<void> };
  link?: { label: string; href: string };
  ttlMs?: number;
};
type Toast = ToastInput & { id: number };

const ToastCtx = createContext<{ push: (t: ToastInput) => number; dismiss: (id: number) => void } | null>(null);

const TTL = 15_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { ...t, id }]);
    timers.current.set(id, setTimeout(() => dismiss(id), t.ttlMs ?? TTL));
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className={`toast${t.tone === "warn" ? " toast-warn" : ""}`}>
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-btn"
                onClick={async () => { dismiss(t.id); await t.action!.onClick(); }}
              >
                {t.action.label}
              </button>
            )}
            {t.link && <a className="toast-btn" href={t.link.href}>{t.link.label}</a>}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// No-op outside a provider so components stay usable in isolation.
export function useToast() {
  const ctx = useContext(ToastCtx);
  return ctx ?? { push: () => -1, dismiss: () => {} };
}

// Shared helper: did a fetch come back as an HTML/redirect response (session
// expired → the middleware bounced us to /login)?
export function looksLikeSessionExpired(r: Response): boolean {
  if (r.redirected && /\/login/.test(r.url)) return true;
  const ct = r.headers.get("content-type") ?? "";
  return r.status === 401 || (!r.ok && ct.includes("text/html"));
}
