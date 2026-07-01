import type { DelegateRow } from "@/lib/data";
import { updateRegistration } from "./actions";

function Check({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean | null;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontSize: 14,
        color: "var(--text)",
        margin: "0 0 10px",
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={!!checked}
        style={{ width: "auto" }}
      />
      {label}
    </label>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <input name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} />
    </div>
  );
}

function Area({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string | null;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <textarea name={name} defaultValue={value ?? ""} rows={2} style={{ width: "100%" }} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="muted"
      style={{
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        fontWeight: 700,
        margin: "18px 0 10px",
      }}
    >
      {children}
    </p>
  );
}

export default function RegistrationForm({ d, ret }: { d: DelegateRow; ret: string }) {
  return (
    <form action={updateRegistration}>
      <input type="hidden" name="delegateId" value={d.id} />
      <input type="hidden" name="return" value={ret} />

      <div className="grid2">
        <div>
          <SectionLabel>Registration</SectionLabel>
          <Field name="ticket_type" label="Ticket type" value={d.ticket_type} placeholder="e.g. Standard / VIP / Speaker pass" />
          <Field name="delegate_type" label="Delegate type" value={d.delegate_type} placeholder="e.g. Banker / Regulator / Partner" />
          <Field name="registration_date" label="Registration date" type="date" value={d.registration_date} />
          <Field name="badge_name" label="Badge name" value={d.badge_name} placeholder="Name as printed on badge" />
          <Field name="seating_assignment" label="Seating assignment" value={d.seating_assignment} placeholder="e.g. Table 4" />

          <SectionLabel>On-site</SectionLabel>
          <Area name="dietary_requirements" label="Dietary requirements" value={d.dietary_requirements} />
          <Area name="special_access" label="Special access / accessibility" value={d.special_access} />
        </div>

        <div>
          <SectionLabel>Invoicing &amp; payment</SectionLabel>
          <Check name="invoice_sent" label="Invoice sent?" checked={d.invoice_sent} />
          <Check name="payment_received" label="Payment received?" checked={d.payment_received} />
          <Field name="payment_amount" label="Payment amount (USD)" type="number" value={d.payment_amount} placeholder="0.00" />

          <SectionLabel>Complimentary</SectionLabel>
          <Check name="complimentary" label="Complimentary delegate?" checked={d.complimentary} />
          <Field name="complimentary_reason" label="Reason" value={d.complimentary_reason} placeholder="e.g. Speaker guest / VIP invite" />

          <SectionLabel>Notes</SectionLabel>
          <Area name="notes" label="Internal notes" value={d.notes} />
        </div>
      </div>

      <button className="btn btn-primary" type="submit" style={{ marginTop: 8 }}>
        Save registration
      </button>
    </form>
  );
}
