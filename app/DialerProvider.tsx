"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import DialerPanel from "./DialerPanel";

// One JustCall dialer for the whole app (ported 1:1 from pmg-sales-app). Any
// CallButton triggers this single instance, so pages with many contacts never
// mount duplicate justcall-dialer-container elements.
type Ctx = { call: (number: string, name?: string | null) => void };
const DialerCtx = createContext<Ctx | null>(null);

export function useDialer(): Ctx {
  const ctx = useContext(DialerCtx);
  if (!ctx) throw new Error("useDialer must be used within <DialerProvider>");
  return ctx;
}

export default function DialerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // LAZY: the JustCall SDK (third-party iframe + global listeners) mounts only
  // after the first call is placed — before that, no page carries it.
  const [everOpened, setEverOpened] = useState(false);
  const [active, setActive] = useState<{ number: string; name: string | null }>({ number: "", name: null });
  const tokenRef = useRef(0);
  const [token, setToken] = useState(0);

  const call = useCallback((number: string, name?: string | null) => {
    setActive({ number, name: name ?? null });
    tokenRef.current += 1;
    setToken(tokenRef.current); // re-dial even if the number is unchanged
    setEverOpened(true);
    setOpen(true);
  }, []);

  return (
    <DialerCtx.Provider value={{ call }}>
      {children}
      {everOpened && (
        <DialerPanel
          open={open}
          onClose={() => setOpen(false)}
          numberToDial={active.number || null}
          contactName={active.name}
          dialToken={token}
        />
      )}
    </DialerCtx.Provider>
  );
}
