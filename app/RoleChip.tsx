"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useDialog } from "@pmg/team-ui/ui/useDialog";
import { useToast } from "@pmg/team-ui/ui/Toast";
import { changeRole } from "./roleActions";

// Header chip "Role: Delegate" (top-right, next to the stage pill). Click →
// "Change role" dialog → Make Speaker moves the row to the SPEAKERS app — the
// dialog says so, and afterwards the user gets a link to that app's record.
export default function RoleChip({ id, name, edition, disabled }: { id: string; name: string | null; edition: string | null; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = useCallback(() => { if (!busy) setOpen(false); }, [busy]);
  const ref = useDialog(close, open);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await changeRole(id);
      if (!r.ok) { setErr(r.message); return; }
      toast.push({ message: r.message, link: { label: "Open in Speakers", href: r.targetHref } });
      setOpen(false);
      router.push("/delegates");
    } catch {
      setErr("Couldn’t change the role — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="chip chip-queued"
              style={{ cursor: disabled ? "default" : "pointer", border: "none", font: "inherit", fontSize: 12, padding: "3px 10px" }}
              onClick={() => { if (!disabled) setOpen(true); }} disabled={disabled} title={disabled ? undefined : "Change role"} aria-haspopup="dialog">
        Role: Delegate{!disabled && <span aria-hidden style={{ fontSize: 10 }}> ▾</span>}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="role-title" tabIndex={-1}
               onClick={(e) => e.stopPropagation()} className="card modal" style={{ maxWidth: 440 }}>
            <h3 id="role-title" style={{ marginTop: 0, fontSize: "var(--fs-lg)" }}>Change role</h3>
            <p style={{ fontSize: 14, margin: "0 0 6px" }}>
              <strong>{name ?? "This contact"}</strong> is currently a <strong>Delegate</strong>{edition ? <> on {edition}</> : null}.
            </p>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
              Make them a <strong>Speaker</strong> instead? The delegate seat is removed and a speaker record is created at
              stage <em>Identified</em> (owner carried over). The record moves to the Speakers app.
            </p>
            {err && <p className="field-error" role="alert" style={{ marginBottom: 10 }}>{err}</p>}
            <div className="form-actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={close} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={go} disabled={busy}>
                {busy ? <><span className="btn-spin" aria-hidden /> Moving…</> : "Make Speaker"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// After a role change lands here from the speakers app with ?moved=1&msg=…,
// show the toast once and scrub the params.
export function RoleMovedToast() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || sp.get("moved") !== "1") return;
    fired.current = true;
    toast.push({ message: sp.get("msg") || "Role changed" });
    const keep = new URLSearchParams(sp.toString());
    ["moved", "from", "msg", "undo"].forEach((k) => keep.delete(k));
    router.replace(keep.toString() ? `${pathname}?${keep.toString()}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  return null;
}
