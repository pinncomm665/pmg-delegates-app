"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@pmg/team-ui/ui/useDialog";
import { useToast } from "@pmg/team-ui/ui/Toast";
import { setRoleOwner } from "./actions";
import { Spinner } from "./FieldEditor";

type OwnerOption = { email: string; name: string };

// Header chip "Owner: <First name>" (or "Unassigned") next to the stage pill.
// Click → small inline picker (tracked owners + Unassign) → setRoleOwner
// (Tier A, logged) → toast with Undo (restores the previous owner).
export default function OwnerChip({
  delegateId,
  ownerEmail,
  ownerLabel,
  options,
  disabled,
}: {
  delegateId: string;
  ownerEmail: string | null;
  ownerLabel?: string | null;   // server-resolved first name (alias-aware)
  options: OwnerOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState<string | null>(ownerEmail ? ownerEmail.toLowerCase() : null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDialog(close, open);

  const nameOf = (email: string | null) => {
    if (!email) return null;
    const e = email.toLowerCase();
    const hit = options.find((o) => o.email.toLowerCase() === e);
    const full = hit?.name ?? (e.split("@")[0] || e);
    return full.split(/\s+/)[0] || full;
  };
  const label = (current === (ownerEmail ? ownerEmail.toLowerCase() : null) && ownerLabel) || nameOf(current) || "Unassigned";

  const apply = async (next: string | null, isUndo = false) => {
    setSaving(true);
    try {
      const r = await setRoleOwner(delegateId, next);
      if (!r.ok) { toast.push({ message: r.message, tone: "warn" }); return; }
      const prev = r.prev ?? null;
      setCurrent(r.owner ?? null);
      setOpen(false);
      toast.push({
        message: isUndo ? `Restored owner: ${nameOf(r.owner ?? null) ?? "Unassigned"}` : r.message,
        action: !isUndo && prev !== (r.owner ?? null) ? { label: "Undo", onClick: () => apply(prev, true) } : undefined,
      });
      router.refresh();
    } catch {
      toast.push({ message: "Couldn’t update the owner — try again.", tone: "warn" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={`chip ${current ? "chip-queued" : "chip-neutral"}`}
        style={{ cursor: disabled ? "default" : "pointer", border: "none", font: "inherit", fontSize: 12 }}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled || saving}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={current ? `Owner: ${current}` : "No owner assigned — click to assign"}
      >
        {saving ? <Spinner /> : null} Owner: {label}
      </button>
      {open && (
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Set owner"
          tabIndex={-1}
          className="card cols-pop"
          style={{ minWidth: 200, gap: 4, padding: 8 }}
        >
          <p className="muted" style={{ margin: "2px 6px 4px", fontSize: 12 }}>Assign owner</p>
          {options.map((o) => {
            const active = current === o.email.toLowerCase();
            return (
              <button
                key={o.email}
                type="button"
                className="co-option"
                style={{ width: "100%", textAlign: "left", fontWeight: active ? 600 : 400 }}
                onClick={() => apply(o.email)}
                disabled={saving || active}
                aria-pressed={active}
              >
                {active ? "✓ " : ""}{o.name}
              </button>
            );
          })}
          <button
            type="button"
            className="co-option muted"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => apply(null)}
            disabled={saving || current === null}
          >
            Unassign
          </button>
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-end", marginTop: 4 }} onClick={close}>Cancel</button>
        </div>
      )}
    </span>
  );
}
