"use client";

import { useRef, useState, type ReactNode } from "react";
import type { DelegateRow } from "@/lib/data";
import { updateRegistration } from "./actions";
import { setDirty, useDirtyGuard } from "../../dirty";

function Check({ name, label, checked }: { name: string; label: string; checked?: boolean | null }) {
  return (
    <label>
      <input type="checkbox" name={name} defaultChecked={!!checked} />
      {label}
    </label>
  );
}

function Field({
  name, label, value, type = "text", placeholder, help, span2,
}: {
  name: string; label: string; value?: string | number | null; type?: string; placeholder?: string; help?: ReactNode; span2?: boolean;
}) {
  const id = `reg-${name}`;
  return (
    <div className={`field${span2 ? " span-2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} />
      {help && <p className="help">{help}</p>}
    </div>
  );
}

function Area({ name, label, value, placeholder }: { name: string; label: string; value?: string | null; placeholder?: string }) {
  const id = `reg-${name}`;
  return (
    <div className="field span-2">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="input" name={name} defaultValue={value ?? ""} rows={2} placeholder={placeholder} />
    </div>
  );
}

function Fieldset({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const id = `fs-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="fieldset" role="group" aria-labelledby={id}>
      <h3 className="section-title" id={id}>{title}</h3>
      {sub && <p className="section-sub">{sub}</p>}
      {children}
    </section>
  );
}

function fmtStamp(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso);
  return isNaN(t.getTime()) ? null : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Registration editor: Registration · Payment & invoice · Notes fieldsets on a
// .form-grid. Uncontrolled fields (server action form); the unsaved-changes
// guard (beforeunload + in-app tab switch via app/dirty.ts) arms on the first
// edit, shows the sticky "Save changes" bar, and disarms on submit / discard.
export default function RegistrationForm({ d, ret }: { d: DelegateRow; ret: string }) {
  useDirtyGuard();
  const [dirty, setLocalDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mark = (v: boolean) => { setLocalDirty(v); setDirty(v); };

  return (
    <form
      ref={formRef}
      action={updateRegistration}
      className="form-stack"
      onChange={() => mark(true)}
      onSubmit={() => mark(false)}
    >
      <input type="hidden" name="delegateId" value={d.id} />
      <input type="hidden" name="return" value={ret} />

      <Fieldset title="Registration">
        <div className="form-grid">
          <Field name="ticket_type" label="Ticket type" value={d.ticket_type} placeholder="e.g. Standard / VIP / Speaker pass" />
          <Field name="delegate_type" label="Delegate type" value={d.delegate_type} placeholder="e.g. Banker / Regulator / Partner" />
          <Field name="registration_date" label="Registration date" type="date" value={d.registration_date} />
          <Field name="badge_name" label="Badge name" value={d.badge_name} placeholder="Name as printed on the badge" />
          <Field name="seating_assignment" label="Seating assignment" value={d.seating_assignment} placeholder="e.g. Table 4" />
          <Area name="dietary_requirements" label="Dietary requirements" value={d.dietary_requirements} />
          <Area name="special_access" label="Special access / accessibility" value={d.special_access} />
        </div>
      </Fieldset>

      <Fieldset title="Payment & invoice">
        <div className="form-grid">
          <div className="field">
            <span className="field-label">Status</span>
            <div className="check-row">
              <Check name="invoice_sent" label="Invoice sent" checked={d.invoice_sent} />
              <Check name="payment_received" label="Payment received" checked={d.payment_received} />
              <Check name="complimentary" label="Complimentary delegate" checked={d.complimentary} />
            </div>
            {(d.invoice_sent_at || d.payment_received_at) && (
              <p className="help">
                {d.invoice_sent_at ? `Invoice sent ${fmtStamp(d.invoice_sent_at)}` : ""}
                {d.invoice_sent_at && d.payment_received_at ? " · " : ""}
                {d.payment_received_at ? `Paid ${fmtStamp(d.payment_received_at)}` : ""}
              </p>
            )}
          </div>
          <div>
            <Field name="payment_amount" label="Payment amount (USD)" type="number" value={d.payment_amount} placeholder="0.00" />
            <div style={{ height: 16 }} />
            <Field name="complimentary_reason" label="Complimentary reason" value={d.complimentary_reason} placeholder="e.g. Speaker guest / VIP invite" />
          </div>
        </div>
      </Fieldset>

      <Fieldset title="Notes">
        <div className="form-grid">
          <Area name="notes" label="Internal notes" value={d.notes} placeholder="Anything the team should know on the day" />
        </div>
      </Fieldset>

      {dirty && (
        <div className="save-bar" role="status">
          <span>Unsaved changes</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { formRef.current?.reset(); mark(false); }}
            >
              Discard
            </button>
            <button className="btn btn-primary btn-sm" type="submit">Save changes</button>
          </div>
        </div>
      )}
    </form>
  );
}
