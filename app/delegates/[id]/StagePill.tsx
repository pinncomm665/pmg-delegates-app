"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast, looksLikeSessionExpired } from "@pmg/team-ui/ui/Toast";
import { STAGES, STAGE_VALUES, stageBadgeClass, stageLabel } from "@/lib/data";

// The status badge at the top-right of the delegate page, made editable: it
// looks like the read-only badge it replaces, but an invisible native <select>
// is stretched over it — the pill IS the control, with the platform picker UX
// intact on phones. Saves through the same /api/delegates/status route the list
// uses (tier policy, review queue, rate guard, change log all included), then
// refreshes the page so every stage-dependent section is current.
export default function StagePill({ delegateId, stage, disabled }: { delegateId: string; stage: string | null; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(
    STAGE_VALUES.includes((stage ?? "").toLowerCase()) ? (stage ?? "").toLowerCase() : "identified"
  );
  const [saving, setSaving] = useState(false);

  const change = async (next: string) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      const r = await fetch("/api/delegates/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ delegate_id: delegateId, stage: next }),
      });
      if (looksLikeSessionExpired(r)) {
        setValue(prev);
        toast.push({ message: "Session expired — sign in again", tone: "warn", link: { label: "Sign in", href: "/login" } });
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setValue(prev); toast.push({ message: d.error ?? "Stage change failed", tone: "warn" }); return; }
      if (d.queued) { setValue(prev); toast.push({ message: d.message ?? "Held for review", tone: "warn" }); return; }
      router.refresh();
    } catch {
      setValue(prev);
      toast.push({ message: "Network error — stage not changed", tone: "warn" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }} title={disabled ? undefined : "Change status"}>
      <select
        aria-label="Status"
        value={value}
        disabled={saving || disabled}
        onChange={(e) => change(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "default" : "pointer" }}
      >
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <span className={stageBadgeClass(value)} style={{ opacity: saving ? 0.6 : 1, userSelect: "none" }}>
        {stageLabel(value)}{!disabled && <span aria-hidden style={{ fontSize: 10 }}> ▾</span>}
      </span>
    </span>
  );
}
