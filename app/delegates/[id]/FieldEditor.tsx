"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { FieldWriteResult } from "./actions";

// One inline editor for a Contact-details row: input(s) + helper text +
// [Save] [Cancel]. Enter saves, Esc cancels, Save shows a spinner. The parent
// (ContactDetails) owns which row is open and what happens on success.
export type EditorInput = {
  name: string;
  value: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  label?: string; // visually-hidden label (used for the first/last name pair)
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url";
};

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export default function FieldEditor({
  inputs,
  help,
  saveLabel = "Save",
  onSave,
  onCancel,
  extra,
}: {
  inputs: EditorInput[];
  help?: ReactNode;
  saveLabel?: string;
  onSave: (values: Record<string, string>) => Promise<FieldWriteResult>;
  onCancel: () => void;
  extra?: ReactNode; // optional secondary control under the inputs
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((i) => [i.name, i.value ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await onSave(vals);
      if (!r.ok) setError(r.message);
    } catch {
      setError("Couldn’t save — try again.");
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Enter") { e.preventDefault(); void save(); }
  }

  const pair = inputs.length > 1;
  const fields = inputs.map((i, idx) => (
    <input
      key={i.name}
      ref={idx === 0 ? firstRef : undefined}
      className="input"
      name={i.name}
      type={i.type ?? "text"}
      inputMode={i.inputMode}
      autoComplete={i.autoComplete ?? "off"}
      placeholder={i.placeholder}
      aria-label={i.label ?? i.placeholder}
      aria-invalid={error ? true : undefined}
      value={vals[i.name] ?? ""}
      disabled={saving}
      onChange={(e) => setVals((v) => ({ ...v, [i.name]: e.target.value }))}
      onKeyDown={onKey}
    />
  ));

  return (
    <div className="cd-editor" role="group">
      {pair ? <div className="cd-inputs">{fields}</div> : <div className="cd-editor-row">{fields}</div>}
      {extra}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="cd-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          {saving ? "Saving…" : saveLabel}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        {help && <p className="help">{help}</p>}
      </div>
    </div>
  );
}
