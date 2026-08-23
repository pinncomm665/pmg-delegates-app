"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

// Building blocks for the Contact details card (ContactDetails.tsx):
//   <DetailRow>   label | value | action — one row per field, hairline divider
//   <InlineEditor> the expanded editor inside a row: inputs + help + Save/Cancel,
//                 Enter saves, Esc cancels, Save shows a spinner.
// Presentation only — no data access. Identical in speakers-app / delegates-app.

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function PromoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function Spinner() {
  return <span className="btn-spin" aria-hidden="true" />;
}

export function DetailRow({
  label,
  value,
  locked,
  lockTip,
  editing,
  onEdit,
  disabled,
  editor,
  extraAction,
}: {
  label: string;
  value: ReactNode;
  // Locked rows show a lock glyph with a tooltip instead of Edit.
  locked?: boolean;
  lockTip?: string;
  editing?: boolean;
  onEdit?: () => void;
  // Another row is being edited → this row's Edit is disabled (one at a time).
  disabled?: boolean;
  editor?: ReactNode;
  // Optional secondary control rendered before Edit (e.g. "Use as primary").
  extraAction?: ReactNode;
}) {
  return (
    <div className={`cd-row${editing ? " is-editing" : ""}`} role="group" aria-label={label}>
      <dt className="cd-label">{label}</dt>
      {editing ? (
        <dd className="cd-editor">{editor}</dd>
      ) : (
        <>
          <dd className="cd-value">{value}</dd>
          <div className="cd-action">
            {!locked && extraAction}
            {locked ? (
              <span className="cd-lock" title={lockTip} aria-label={lockTip} role="img">
                <LockIcon />
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm cd-edit"
                onClick={onEdit}
                disabled={disabled}
                aria-label={`Edit ${label.toLowerCase()}`}
              >
                <PencilIcon />
                <span className="btn-label">Edit</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function InlineEditor({
  onSave,
  onCancel,
  saving,
  canSave = true,
  saveLabel = "Save",
  help,
  error,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  canSave?: boolean;
  saveLabel?: string;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the first input when the editor opens.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea");
    first?.focus();
    if (first instanceof HTMLInputElement) first.select?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); if (!saving) onCancel(); return; }
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      if (!saving && canSave) onSave();
    }
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown}>
      <div className="fieldset-stack" style={{ gap: 10 }}>
        {children}
        {help && <p className="help">{help}</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !canSave}>
            {saving ? <Spinner /> : null}
            {saving ? "Saving…" : saveLabel}
          </button>
          <button type="button" className="btn btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
