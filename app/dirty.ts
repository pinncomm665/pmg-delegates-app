"use client";

import { useEffect } from "react";

// Tiny "unsaved changes" registry shared between forms (who set it) and
// in-app navigation (ProfileTabs, which asks before switching). The
// beforeunload guard covers reload/close/back.
let dirty = false;
const listeners = new Set<(d: boolean) => void>();

export function setDirty(d: boolean) {
  if (dirty === d) return;
  dirty = d;
  listeners.forEach((l) => l(d));
}
export function isDirty() { return dirty; }

export const UNSAVED_MSG = "You have unsaved changes. Leave without saving?";

// Ask before leaving when dirty. Returns true when it's OK to proceed.
export function confirmLeave(): boolean {
  if (!dirty) return true;
  const ok = window.confirm(UNSAVED_MSG);
  if (ok) setDirty(false);
  return ok;
}

// Mount once per page: wires beforeunload + clears the flag on unmount.
export function useDirtyGuard() {
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = UNSAVED_MSG;
    };
    window.addEventListener("beforeunload", onBefore);
    return () => { window.removeEventListener("beforeunload", onBefore); dirty = false; };
  }, []);
}
