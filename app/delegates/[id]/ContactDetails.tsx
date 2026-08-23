"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../Toast";
import { emailStatusOf, type EmailStatus } from "@/lib/emailstatus";
import { linkedinSlug } from "@/lib/linkedin";
import FieldEditor from "./FieldEditor";
import UpdateCompany from "./UpdateCompany";
import {
  updateName,
  updateJobTitle,
  updateWorkEmail,
  updatePhone,
  updateLinkedin,
  flagRole,
  type FieldWriteResult,
  type PhoneField,
} from "./actions";

// Contact-details card: one definition-list row per field (label | value |
// action). "Edit" turns that row into an inline editor; only one row is open at
// a time. Tier rules live in actions.ts — this component only decides which
// editor to show and how to report the outcome (toast + refresh).
export type ContactDetailsData = {
  full_name_clean: string | null;
  first_name_clean: string | null;
  last_name_clean: string | null;
  job_title: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  mobile: string | null;
  office_phone: string | null;
  other_phone: string | null;
  linkedin_url_canonical: string | null;
  email_mv_result?: string | null;
  email_verified_status?: string | null;
  scrubby_result?: string | null;
};

type RowKey = "name" | "job_title" | "company" | "email" | "personal_email" | "phone" | "mobile" | "other_phone" | "linkedin";

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function LockIcon({ tip }: { tip: string }) {
  return (
    <span className="lock" title={tip}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={tip}>
        <title>{tip}</title>
        <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      </svg>
    </span>
  );
}

function emailChipClass(s: EmailStatus): string {
  return s === "Valid" ? "chip chip-ok" : s === "Invalid" ? "chip chip-danger" : "chip chip-muted";
}

function Empty() { return <span className="cd-empty">—</span>; }

// Split a stored full name when first/last are missing (first token / rest).
function splitFallback(full: string | null): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ContactDetails({
  delegateId,
  ret,
  editable,
  contact: c,
  companyName,
}: {
  delegateId: string;
  ret: string;
  editable: boolean;
  contact: ContactDetailsData;
  companyName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<RowKey | null>(null);
  const [queued, setQueued] = useState<Partial<Record<RowKey, string>>>({});

  const es = emailStatusOf(c);
  const mobileField: PhoneField = c.mobile ? "mobile" : c.phone ? "phone" : "mobile";
  const mobileValue = c.mobile ?? c.phone ?? null;

  // Shared outcome handler: close the row, toast, refresh server data.
  function done(row: RowKey, r: FieldWriteResult, undo?: () => Promise<FieldWriteResult>) {
    if (!r.ok) return r; // FieldEditor shows the error inline
    setOpen(null);
    if (r.queued) {
      setQueued((q) => ({ ...q, [row]: r.message }));
      toast.push({ message: r.message, tone: "warn" });
    } else {
      toast.push({
        message: r.message,
        action: r.undo && undo ? { label: "Undo", onClick: async () => { await undo(); router.refresh(); } } : undefined,
      });
    }
    router.refresh();
    return r;
  }

  const rows: { key: RowKey; label: string; value: ReactNode; locked?: string; editor?: ReactNode; help?: ReactNode }[] = [
    {
      key: "name",
      label: "Name",
      value: c.full_name_clean || <Empty />,
      editor: (() => {
        const fb = splitFallback(c.full_name_clean);
        return (
          <FieldEditor
            inputs={[
              { name: "first", value: c.first_name_clean ?? fb.first, placeholder: "First name", label: "First name", autoComplete: "given-name" },
              { name: "last", value: c.last_name_clean ?? fb.last, placeholder: "Last name", label: "Last name", autoComplete: "family-name" },
            ]}
            saveLabel="Send for review"
            help="Name changes are reviewed before they apply."
            onSave={async (v) => done("name", await updateName(delegateId, v.first, v.last))}
            onCancel={() => setOpen(null)}
          />
        );
      })(),
    },
    {
      key: "job_title",
      label: "Job title",
      value: c.job_title || <Empty />,
      editor: (
        <FieldEditor
          inputs={[{ name: "title", value: c.job_title ?? "", placeholder: "Job title", label: "Job title", autoComplete: "organization-title" }]}
          help="Applied immediately and logged."
          onSave={async (v) => {
            const prev = c.job_title ?? "";
            return done("job_title", await updateJobTitle(delegateId, v.title), () => updateJobTitle(delegateId, prev));
          }}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "company",
      label: "Company",
      value: companyName || <Empty />,
      editor: (
        <UpdateCompany
          delegateId={delegateId}
          current={companyName}
          onDone={(r) => done("company", r)}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "email",
      label: "Work email",
      value: (
        <>
          {c.email ? <span>{c.email}</span> : <Empty />}
          {es && <span className={emailChipClass(es)}>{es}</span>}
        </>
      ),
      editor: (
        <FieldEditor
          inputs={[{ name: "email", value: c.email ?? "", placeholder: "name@company.com", label: "Work email", type: "email", inputMode: "email", autoComplete: "email" }]}
          saveLabel="Verify & save"
          help="Verified with MillionVerifier. Valid + company domain → applied; anything else is sent for review."
          onSave={async (v) => done("email", await updateWorkEmail(delegateId, v.email))}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "personal_email",
      label: "Personal email",
      value: c.personal_email || <Empty />,
      locked: "Personal email is for warm contact only — managed by the CRM, never edited here.",
    },
    {
      key: "phone",
      label: "Phone",
      value: c.office_phone || <Empty />,
      editor: (
        <FieldEditor
          inputs={[{ name: "v", value: c.office_phone ?? "", placeholder: "+…", label: "Phone", type: "tel", inputMode: "tel", autoComplete: "tel" }]}
          help="The previous number is kept (moved to Other phone when that slot is empty)."
          onSave={async (v) => {
            const prev = c.office_phone ?? "";
            const prevOther = c.other_phone ?? null;
            return done("phone", await updatePhone(delegateId, "office_phone", v.v), () => updatePhone(delegateId, "office_phone", prev, prevOther));
          }}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "mobile",
      label: "Mobile",
      value: mobileValue || <Empty />,
      editor: (
        <FieldEditor
          inputs={[{ name: "v", value: mobileValue ?? "", placeholder: "+…", label: "Mobile", type: "tel", inputMode: "tel", autoComplete: "tel" }]}
          help="The previous number is kept (moved to Other phone when that slot is empty)."
          onSave={async (v) => {
            const prev = mobileValue ?? "";
            const prevOther = c.other_phone ?? null;
            return done("mobile", await updatePhone(delegateId, mobileField, v.v), () => updatePhone(delegateId, mobileField, prev, prevOther));
          }}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "other_phone",
      label: "Other phone",
      value: c.other_phone || <Empty />,
      editor: (
        <FieldEditor
          inputs={[{ name: "v", value: c.other_phone ?? "", placeholder: "+…", label: "Other phone", type: "tel", inputMode: "tel", autoComplete: "tel" }]}
          help="Applied immediately and logged."
          onSave={async (v) => {
            const prev = c.other_phone ?? "";
            return done("other_phone", await updatePhone(delegateId, "other_phone", v.v), () => updatePhone(delegateId, "other_phone", prev));
          }}
          onCancel={() => setOpen(null)}
        />
      ),
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      value: c.linkedin_url_canonical ? (
        <a href={c.linkedin_url_canonical} target="_blank" rel="noreferrer" title={c.linkedin_url_canonical}>
          {linkedinSlug(c.linkedin_url_canonical)}
        </a>
      ) : <Empty />,
      editor: (
        <FieldEditor
          inputs={[{ name: "url", value: c.linkedin_url_canonical ?? "", placeholder: "https://www.linkedin.com/in/…", label: "LinkedIn URL", type: "url", inputMode: "url" }]}
          help="Saved as linkedin.com/in/<slug>. If another contact already has this profile, it’s sent for review instead."
          onSave={async (v) => {
            const prev = c.linkedin_url_canonical ?? "";
            return done("linkedin", await updateLinkedin(delegateId, v.url), prev ? () => updateLinkedin(delegateId, prev) : undefined);
          }}
          onCancel={() => setOpen(null)}
        />
      ),
    },
  ];

  return (
    <div className="cd-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Contact details</h3>
          <p className="section-sub">
            {editable ? "Edit a field in place — small fixes apply instantly, identity changes go to review." : "Read-only for this edition."}
          </p>
        </div>
      </div>

      <ul className="cd-list">
        {rows.map((r) => {
          const editing = open === r.key;
          const canOpen = editable && !r.locked && !!r.editor;
          return (
            <li key={r.key} className={`cd-row${editing ? " is-editing" : ""}`}>
              <span className="cd-label" id={`cd-${r.key}`}>{r.label}</span>
              {editing ? (
                r.editor
              ) : (
                <>
                  <span className="cd-value" aria-labelledby={`cd-${r.key}`}>
                    {r.value}
                    {queued[r.key] && (
                      <span className="chip chip-queued" title={queued[r.key]}>Sent for review</span>
                    )}
                  </span>
                  <span className="cd-action">
                    {r.locked ? (
                      <LockIcon tip={r.locked} />
                    ) : !editable ? (
                      <LockIcon tip="Read-only — you don’t have edit access to this edition." />
                    ) : canOpen ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Edit ${r.label.toLowerCase()}`}
                        aria-expanded={false}
                        onClick={() => setOpen(r.key)}
                      >
                        <PencilIcon />
                        <span className="cd-edit-label">Edit</span>
                      </button>
                    ) : null}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <details className="cd-foot">
          <summary>
            <span className="linklike">Left the company or changed role? Flag it for review</span>
          </summary>
          <form action={flagRole} className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="delegateId" value={delegateId} />
            <input type="hidden" name="return" value={ret} />
            <div className="field">
              <label htmlFor="flag-title">New job title</label>
              <input id="flag-title" className="input" name="newTitle" placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="flag-company">New company</label>
              <input id="flag-company" className="input" name="newCompany" placeholder="Optional" />
            </div>
            <div className="span-2" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" type="submit">Submit for review</button>
              <p className="help" style={{ margin: 0 }}>Goes to the admin queue. The record is not changed until approved.</p>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
