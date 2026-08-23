"use client";

import { useState } from "react";
import { useDialog } from "../../useDialog";
import { removeDelegate } from "./actions";

// Admin-only: hard-delete the delegate role row behind a typed confirmation
// ("REMOVE"). The server action re-checks the typed word and the secured-stage
// rule, so this dialog is a guard, not the gate.
export default function RemoveDelegateDialog({ delegateId, ret, name }: { delegateId: string; ret: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fieldset danger" role="group" aria-labelledby="fs-danger">
      <h3 className="section-title" id="fs-danger">Danger zone</h3>
      <p className="section-sub">
        Remove from delegates (no longer attending). Permanently removes this delegate role row — the contact
        stays in the CRM. Secured delegates (registered / confirmed / attended) can’t be removed.
      </p>
      <button className="btn btn-danger btn-sm" type="button" onClick={() => setOpen(true)}>Remove…</button>
      {open && <Confirm delegateId={delegateId} ret={ret} name={name} onClose={() => setOpen(false)} />}
    </section>
  );
}

function Confirm({ delegateId, ret, name, onClose }: { delegateId: string; ret: string; name: string; onClose: () => void }) {
  const ref = useDialog(onClose);
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === "REMOVE";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rm-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card modal"
        style={{ maxWidth: 420 }}
      >
        <h3 id="rm-title" style={{ marginTop: 0, fontSize: "var(--fs-lg)" }}>Remove {name} from delegates?</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          This deletes the delegate role row (the contact stays in the CRM). Type <strong>REMOVE</strong> to confirm.
        </p>
        <form action={removeDelegate}>
          <input type="hidden" name="delegateId" value={delegateId} />
          <input type="hidden" name="return" value={ret} />
          <label htmlFor="rm-confirm">Confirmation</label>
          <input id="rm-confirm" className="input" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="REMOVE" autoComplete="off" />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" type="submit" disabled={!ok}>Remove delegate</button>
          </div>
        </form>
      </div>
    </div>
  );
}
