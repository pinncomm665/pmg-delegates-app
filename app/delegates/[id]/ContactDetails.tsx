"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../Toast";
import { emailStatusColors, type EmailStatus } from "@/lib/emailstatus";
import { linkedinSlug, splitForEdit, fullNameFrom, type FieldWriteResult } from "@/lib/contactFields";
import { DetailRow, InlineEditor, PromoteIcon } from "./FieldEditor";
import UpdateCompany from "./UpdateCompany";
import {
  updateName,
  updateJobTitle,
  updatePersonalEmail,
  updateWorkEmail,
  promotePersonalEmail,
  undoPromotePersonalEmail,
  updatePhone,
  updateLinkedin,
  type PhoneField,
} from "./actions";

export type ContactDetailsData = {
  id: string | null;
  full_name_clean: string | null;
  first_name_clean: string | null;
  last_name_clean: string | null;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  email_status: EmailStatus | null;
  email_source: string | null;
  personal_email: string | null;
  office_phone: string | null;
  mobile: string | null;
  other_phone: string | null;
  linkedin_url_canonical: string | null;
};

type RowKey = "name" | "job_title" | "company" | "email" | "personal_email" | "office_phone" | "mobile" | "other_phone" | "linkedin";
// "promote" = the inline confirm card on the Personal email row ("Use as primary").
type EditKey = RowKey | "promote";


// Collapse a stored MV verdict back to the 3-bucket status (mirrors lib/emailstatus).
function statusFromMv(v: string | null): EmailStatus {
  const x = (v ?? "").toLowerCase();
  if (["ok", "valid"].includes(x)) return "Valid";
  if (["invalid", "disposable"].includes(x)) return "Invalid";
  return "Unknown";
}

function Empty() {
  return <span className="muted">—</span>;
}

// "Contact details" card — definition list, one row per field, inline editors.
// Tier rules live in the server actions (actions.ts); this component only
// renders, collapses rows on success, and toasts ("… updated · Undo" for
// auto-applied writes, "Sent for review" for queued ones).
export default function ContactDetails({
  delegateId,
  contact,
  isReviewer,
  children,
}: {
  delegateId: string;
  contact: ContactDetailsData;
  isReviewer: boolean;
  // The "Left the company? Flag it" disclosure (server-action form), rendered
  // as a quiet link row at the bottom of the card.
  children?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState<ContactDetailsData>(contact);
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [queued, setQueued] = useState<Partial<Record<RowKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor drafts
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [draft, setDraft] = useState("");

  const open = (k: RowKey) => {
    setError(null);
    if (k === "name") {
      const pre = c.first_name_clean || c.last_name_clean
        ? { first: c.first_name_clean ?? "", last: c.last_name_clean ?? "" }
        : splitForEdit(c.full_name_clean);
      setFirst(pre.first); setLast(pre.last);
    } else if (k === "job_title") setDraft(c.job_title ?? "");
    else if (k === "email") setDraft(c.email ?? "");
    else if (k === "personal_email") setDraft(c.personal_email ?? "");
    else if (k === "office_phone") setDraft(c.office_phone ?? "");
    else if (k === "mobile") setDraft(c.mobile ?? "");
    else if (k === "other_phone") setDraft(c.other_phone ?? "");
    else if (k === "linkedin") setDraft(c.linkedin_url_canonical ?? "");
    setEditing(k);
  };
  const close = () => { setEditing(null); setError(null); };

  // Shared post-write handling: collapse, toast, optional Undo, resync server tree.
  function settle(k: RowKey, r: FieldWriteResult, apply: () => void, undo?: () => Promise<unknown>) {
    if (!r.ok) { setError(r.message); return; }
    if (r.queued) {
      setQueued((q) => ({ ...q, [k]: true }));
      toast.push({ message: r.message, tone: "warn" });
      close();
      return;
    }
    apply();
    setQueued((q) => ({ ...q, [k]: false }));
    toast.push({
      message: r.message,
      action: undo ? { label: "Undo", onClick: async () => { await undo(); router.refresh(); } } : undefined,
    });
    close();
    router.refresh();
  }

  async function run(fn: () => Promise<void>) {
    setSaving(true); setError(null);
    try { await fn(); }
    catch { setError("Something went wrong — try again."); }
    finally { setSaving(false); }
  }

  // ── Savers ────────────────────────────────────────────────────────────────
  const saveName = () => run(async () => {
    const prevFirst = c.first_name_clean ?? splitForEdit(c.full_name_clean).first;
    const prevLast = c.last_name_clean ?? splitForEdit(c.full_name_clean).last;
    const r = await updateName(delegateId, first, last);
    settle("name", r,
      () => setC((x) => ({ ...x, full_name_clean: r.value ?? fullNameFrom(first, last), first_name_clean: first.trim(), last_name_clean: last.trim() })),
      isReviewer ? async () => {
        const u = await updateName(delegateId, prevFirst, prevLast);
        if (u.ok && !u.queued) setC((x) => ({ ...x, full_name_clean: u.value ?? null, first_name_clean: prevFirst, last_name_clean: prevLast }));
      } : undefined
    );
  });

  const saveTitle = () => run(async () => {
    const prev = c.job_title;
    const r = await updateJobTitle(delegateId, draft);
    settle("job_title", r,
      () => setC((x) => ({ ...x, job_title: r.value ?? null })),
      async () => {
        const u = await updateJobTitle(delegateId, prev ?? "");
        if (u.ok && !u.queued) setC((x) => ({ ...x, job_title: u.value ?? null }));
      }
    );
  });

  const saveEmail = () => run(async () => {
    const r = await updateWorkEmail(delegateId, draft);
    settle("email", r, () => setC((x) => ({ ...x, email: r.value ?? null, email_status: "Valid" })));
  });

  // "Use as primary": personal → outbound email (MV-verified server-side).
  // Undo passes the captured previous email/source/verdict back.
  const promote = () => run(async () => {
    const r = await promotePersonalEmail(delegateId);
    const prev = r.previous;
    settle("email", r,
      () => setC((x) => ({ ...x, email: r.value ?? null, email_status: "Valid", email_source: "personal_promoted" })),
      prev ? async () => {
        const u = await undoPromotePersonalEmail(delegateId, prev);
        if (u.ok && !u.queued) setC((x) => ({ ...x, email: prev.email, email_source: prev.email_source, email_status: prev.email ? statusFromMv(prev.email_mv_result) : null }));
      } : undefined
    );
  });

  const savePersonalEmail = () => run(async () => {
    const prev = c.personal_email;
    const r = await updatePersonalEmail(delegateId, draft);
    settle("personal_email", r,
      () => setC((x) => ({ ...x, personal_email: r.value ?? null })),
      async () => {
        const u = await updatePersonalEmail(delegateId, prev ?? "");
        if (u.ok && !u.queued) setC((x) => ({ ...x, personal_email: u.value ?? null }));
      }
    );
  });

  const savePhone = (field: PhoneField) => () => run(async () => {
    const prev = c[field];
    const prevOther = c.other_phone;
    const r = await updatePhone(delegateId, field, draft);
    settle(field, r,
      () => setC((x) => ({ ...x, [field]: r.value ?? null, other_phone: r.other_phone ?? null })),
      async () => {
        const u = field === "other_phone"
          ? await updatePhone(delegateId, "other_phone", prev ?? "")
          : await updatePhone(delegateId, field, prev ?? "", { other_phone: prevOther });
        if (u.ok && !u.queued) setC((x) => ({ ...x, [field]: u.value ?? null, other_phone: u.other_phone ?? null }));
      }
    );
  });

  const saveLinkedin = () => run(async () => {
    const prev = c.linkedin_url_canonical;
    const r = await updateLinkedin(delegateId, draft);
    settle("linkedin", r,
      () => setC((x) => ({ ...x, linkedin_url_canonical: r.value ?? null })),
      prev ? async () => {
        const u = await updateLinkedin(delegateId, prev);
        if (u.ok && !u.queued) setC((x) => ({ ...x, linkedin_url_canonical: u.value ?? null }));
      } : undefined
    );
  });

  // ── Value renderers ───────────────────────────────────────────────────────
  const QueuedChip = ({ k }: { k: RowKey }) => (queued[k] ? <span className="chip chip-queued">Sent for review</span> : null);
  const esc = c.email_status ? emailStatusColors(c.email_status) : null;
  const busy = editing !== null;
  const promoted = !!c.email && c.email_source === "personal_promoted";
  // Offer "Use as primary" only when there's a personal address AND the
  // outbound one is missing or dead — and it isn't already that address.
  const canPromote =
    !!c.personal_email &&
    (!c.email || c.email_status === "Invalid") &&
    (c.email ?? "").toLowerCase() !== c.personal_email!.toLowerCase();

  const textInput = (props: { placeholder?: string; type?: string; inputMode?: "tel" | "email" | "url" | "text"; label: string; id: string }) => (
    <div className="field">
      <input
        id={props.id}
        className="input"
        aria-label={props.label}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={props.placeholder}
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="cd-card">
      <div className="section-head">
        <div>
          <p className="section-title">Contact details</p>
          <p className="section-sub">Edit a field in place. Verified and low-risk changes apply at once; identity changes go to the review queue.</p>
        </div>
      </div>
      <dl className="cd">
        <DetailRow
          label="Name"
          value={<>{c.full_name_clean || <Empty />}<QueuedChip k="name" /></>}
          editing={editing === "name"}
          onEdit={() => open("name")}
          disabled={busy}
          editor={
            <InlineEditor onSave={saveName} onCancel={close} saving={saving} canSave={fullNameFrom(first, last).length >= 2}
              error={error}
              help={isReviewer ? "You’re a reviewer — this applies immediately and is logged." : "Name changes are identity changes — sent to the review queue, the record isn’t changed until approved."}
            >
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="cd-first">First name</label>
                  <input id="cd-first" className="input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="cd-last">Last name</label>
                  <input id="cd-last" className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
                </div>
              </div>
            </InlineEditor>
          }
        />
        <DetailRow
          label="Job title"
          value={<>{c.job_title || <Empty />}<QueuedChip k="job_title" /></>}
          editing={editing === "job_title"}
          onEdit={() => open("job_title")}
          disabled={busy}
          editor={
            <InlineEditor onSave={saveTitle} onCancel={close} saving={saving} error={error} help="Applies immediately and is logged to the activity trail.">
              {textInput({ id: "cd-title", label: "Job title", placeholder: "e.g. Head of Fraud" })}
            </InlineEditor>
          }
        />
        <DetailRow
          label="Company"
          value={<>{c.company_name || <Empty />}<QueuedChip k="company" /></>}
          editing={editing === "company"}
          onEdit={() => open("company")}
          disabled={busy}
          editor={
            <UpdateCompany
              delegateId={delegateId}
              current={c.company_name}
              onCancel={close}
              onDone={(r) => settle("company", { ok: r.ok, queued: r.queued, message: r.message }, () => {
                if (r.name) setC((x) => ({ ...x, company_name: r.name ?? x.company_name }));
              })}
            />
          }
        />
        <DetailRow
          label="Work email"
          value={
            <>
              {c.email || <Empty />}
              {c.email && c.email_status && esc && (
                <span className="chip" style={{ background: esc.bg, color: esc.fg }}>{c.email_status}</span>
              )}
              {promoted && <span className="chip chip-neutral" title="Promoted from the personal email">personal</span>}
              <QueuedChip k="email" />
            </>
          }
          editing={editing === "email"}
          onEdit={() => open("email")}
          disabled={busy}
          editor={
            <InlineEditor onSave={saveEmail} onCancel={close} saving={saving} error={error} saveLabel="Verify & save"
              canSave={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.trim())}
              help="Verified (MillionVerifier) and matching the company domain → updates instantly. Otherwise it’s queued for review."
            >
              {textInput({ id: "cd-email", label: "Work email", type: "email", inputMode: "email", placeholder: "name@company.com" })}
            </InlineEditor>
          }
        />
        <DetailRow
          label="Personal email"
          value={<>{c.personal_email || <Empty />}<QueuedChip k="personal_email" /></>}
          editing={editing === "personal_email" || editing === "promote"}
          onEdit={() => open("personal_email")}
          disabled={busy}
          extraAction={canPromote ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm cd-edit cd-promote"
              onClick={() => { setError(null); setEditing("promote"); }}
              disabled={busy}
              aria-label="Use personal email as primary"
              title="Copy this address into the outbound email (verified first). Finders may later replace it with a corporate address."
            >
              <PromoteIcon />
              <span className="btn-label">Use as primary</span>
            </button>
          ) : undefined}
          editor={editing === "promote" ? (
            <InlineEditor onSave={promote} onCancel={close} saving={saving} error={error} saveLabel="Verify & use">
              <p className="help" style={{ margin: 0 }}>
                This makes <strong>{c.personal_email}</strong> the outbound address. It will be verified first.
                Personal inboxes get higher complaint rates — use for invites and re-engagement, not cold pitches.
              </p>
            </InlineEditor>
          ) : (
            <InlineEditor onSave={savePersonalEmail} onCancel={close} saving={saving} error={error}
              canSave={draft.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.trim())}
              help="Warm contact only — never used for campaigns."
            >
              {textInput({ id: "cd-personal-email", label: "Personal email", type: "email", inputMode: "email", placeholder: "name@example.com" })}
            </InlineEditor>
          )}
        />
        <DetailRow
          label="Phone"
          value={<>{c.office_phone || <Empty />}<QueuedChip k="office_phone" /></>}
          editing={editing === "office_phone"}
          onEdit={() => open("office_phone")}
          disabled={busy}
          editor={
            <InlineEditor onSave={savePhone("office_phone")} onCancel={close} saving={saving} error={error} help="The previous number is kept (moved to Other phone when that’s empty).">
              {textInput({ id: "cd-phone", label: "Phone", type: "tel", inputMode: "tel", placeholder: "+…" })}
            </InlineEditor>
          }
        />
        <DetailRow
          label="Mobile"
          value={<>{c.mobile || <Empty />}<QueuedChip k="mobile" /></>}
          editing={editing === "mobile"}
          onEdit={() => open("mobile")}
          disabled={busy}
          editor={
            <InlineEditor onSave={savePhone("mobile")} onCancel={close} saving={saving} error={error} help="The previous number is kept (moved to Other phone when that’s empty).">
              {textInput({ id: "cd-mobile", label: "Mobile", type: "tel", inputMode: "tel", placeholder: "+…" })}
            </InlineEditor>
          }
        />
        <DetailRow
          label="Other phone"
          value={<>{c.other_phone || <Empty />}<QueuedChip k="other_phone" /></>}
          editing={editing === "other_phone"}
          onEdit={() => open("other_phone")}
          disabled={busy}
          editor={
            <InlineEditor onSave={savePhone("other_phone")} onCancel={close} saving={saving} error={error} help="Applies immediately and is logged.">
              {textInput({ id: "cd-other", label: "Other phone", type: "tel", inputMode: "tel", placeholder: "+…" })}
            </InlineEditor>
          }
        />
        <DetailRow
          label="LinkedIn"
          value={
            <>
              {c.linkedin_url_canonical ? (
                <a href={c.linkedin_url_canonical} target="_blank" rel="noreferrer" title={c.linkedin_url_canonical}>
                  {linkedinSlug(c.linkedin_url_canonical)}
                </a>
              ) : <Empty />}
              <QueuedChip k="linkedin" />
            </>
          }
          editing={editing === "linkedin"}
          onEdit={() => open("linkedin")}
          disabled={busy}
          editor={
            <InlineEditor onSave={saveLinkedin} onCancel={close} saving={saving} error={error}
              canSave={/linkedin\.com\/in\//i.test(draft)}
              help="Saved as https://www.linkedin.com/in/<slug>. If another contact already carries this profile it’s sent for review instead."
            >
              {textInput({ id: "cd-linkedin", label: "LinkedIn profile URL", type: "url", inputMode: "url", placeholder: "https://www.linkedin.com/in/…" })}
            </InlineEditor>
          }
        />
      </dl>
      {children && <div className="cd-foot">{children}</div>}
    </div>
  );
}
