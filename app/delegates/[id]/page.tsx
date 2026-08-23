import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDelegate, getEnrolments, getContactProfile, stageBadgeClass, stageLabel, STAGES } from "@/lib/data";
import { emailStatusOf, emailStatusColors } from "@/lib/emailstatus";
import EmailHistory from "./EmailHistory";
import ProfileTabs from "./ProfileTabs";
import { companyDisplay } from "@/lib/company";
import RegistrationForm from "./RegistrationForm";
import InstantlyHistory from "./InstantlyHistory";
import Avatar from "../../Avatar";
import Shell from "../../Shell";
import Breadcrumb from "../../Breadcrumb";
import {
  updateStatus,
  submitEmail,
  addOtherPhone,
  flagRole,
} from "./actions";
import UpdateCompany from "./UpdateCompany";
import BriefView from "./BriefView";
import RemoveDelegateDialog from "./RemoveDelegateDialog";
import ActivityList from "../../ActivityList";
import { getContactActivity } from "@/lib/changes";
import { canEdit, NO_ACCESS_MSG } from "@/lib/policy";

export const dynamic = "force-dynamic";

// Inline lock glyph for CRM-managed (read-only) fields — SVG, not emoji, so it
// renders consistently and carries a real tooltip.
function Lock() {
  const tip = "Managed by CRM — propose a change below";
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

// LinkedIn URL → the "in/slug" part, so the read-only field shows WHO the link is.
function linkedinSlug(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    return path || u.hostname;
  } catch {
    return url;
  }
}

function ReadOnly({ label, value, href }: { label: string; value?: string | null; href?: boolean }) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <span>
        {value ? (
          href ? (
            <a href={value} target="_blank" rel="noreferrer" title={value}>{linkedinSlug(value)}</a>
          ) : (
            value
          )
        ) : (
          <span className="muted">—</span>
        )}{" "}
        <Lock />
      </span>
    </div>
  );
}

export default async function DelegateDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { flash?: string; msg?: string; return?: string };
}) {
  const user = await requireUser();
  const d = await getDelegate(params.id);
  if (!d) notFound();
  const c = d.contact ?? {};
  const ret = searchParams.return ?? "";
  const backHref = ret ? `/delegates?${ret}` : "/delegates";
  const es = emailStatusOf(c);
  const esc = es ? emailStatusColors(es) : null;
  // Independent reads → one round trip.
  const [enrolments, profile, activity] = await Promise.all([
    c.id ? getEnrolments(c.id) : Promise.resolve([]),
    c.id ? getContactProfile(c.id, "delegate", d.event_id) : Promise.resolve(null),
    c.id ? getContactActivity(c.id) : Promise.resolve([]),
  ]);
  const editable = canEdit(user, { eventId: d.event_id, edition: d.event_edition });

  return (
    <Shell user={user}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <Breadcrumb
            items={[
              { label: "Home", href: "/dashboard" },
              { label: "Delegates", href: "/delegates" },
              ...(d.event_edition
                ? [{ label: d.event_edition, href: `/delegates?edition=${encodeURIComponent(d.event_edition)}` }]
                : []),
              { label: c.full_name_clean ?? "Delegate" },
            ]}
          />
          <Link href={backHref} className="muted page-head-aside" style={{ fontSize: 13 }}>
            ← Back to delegates
          </Link>
        </div>

        {searchParams.flash && (
          <div
            className={`flash ${searchParams.flash === "ok" ? "flash-ok" : "flash-warn"}`}
            style={{ marginTop: 12 }}
          >
            {searchParams.msg}
          </div>
        )}
        {!editable && (
          <div className="flash flash-warn" style={{ marginTop: 12 }} role="status">
            Read-only: {NO_ACCESS_MSG}
          </div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="section sp-head">
            <div className="sp-head-id">
              <Avatar name={c.full_name_clean} photo={c.profile_image_url} seed={c.id} size={56} />
              <div>
              <h2 style={{ margin: 0, fontSize: "var(--fs-xl)" }}>{c.full_name_clean ?? "—"}</h2>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                {c.job_title ?? "—"} · {companyDisplay(c.company?.name ?? c.company_name_submitted) ?? "—"}
              </p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                {d.event_brand && <strong>{d.event_brand}</strong>}
                {d.event_brand && d.event_edition ? " › " : ""}
                {d.event_edition ?? ""}
              </p>
              </div>
            </div>
            <span className={stageBadgeClass(d.stage)}>{stageLabel(d.stage)}</span>
          </div>

          <ProfileTabs
            contact={
              <div className="grid2">
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Contact details · read only
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="field">
                      <span className="lbl">Work email</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {c.email ? c.email : <span className="muted">—</span>}
                        {es && esc && (
                          <span className="chip" style={{ background: esc.bg, color: esc.fg }}>
                            {es}
                          </span>
                        )}
                        <Lock />
                      </span>
                    </div>
                    <ReadOnly label="Personal email" value={c.personal_email} />
                    <ReadOnly label="Phone" value={c.office_phone} />
                    <ReadOnly label="Mobile" value={c.mobile ?? c.phone} />
                    <ReadOnly label="Other phone" value={c.other_phone} />
                    <ReadOnly label="LinkedIn" value={c.linkedin_url_canonical} href />
                  </div>
                </div>

                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Update
                  </p>

                  <div style={{ marginBottom: 18 }}>
                    <label>Company</label>
                    <UpdateCompany
                      delegateId={d.id}
                      current={companyDisplay(c.company?.name ?? c.company_name_submitted)}
                    />
                  </div>

                  <form action={submitEmail} style={{ marginBottom: 18 }}>
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <label>Found a new email?</label>
                    <div className="detail-row">
                      <input name="newEmail" type="email" placeholder="name@company.com" />
                      <button className="btn" type="submit">Verify</button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                      Valid → updates instantly. Invalid → queued for review.
                    </p>
                  </form>

                  <form action={addOtherPhone} style={{ marginBottom: 18 }}>
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <label>Add another phone</label>
                    <div className="detail-row">
                      <input name="newPhone" placeholder="+…" />
                      <button className="btn" type="submit">Add</button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                      Saved to “Other phone”. Original numbers never overwritten.
                    </p>
                  </form>

                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 14 }}>
                      Flag: left company / changed role
                    </summary>
                    <form action={flagRole} style={{ marginTop: 10 }}>
                      <input type="hidden" name="delegateId" value={d.id} />
                      <input type="hidden" name="return" value={ret} />
                      <label>New job title</label>
                      <input name="newTitle" placeholder="New title (optional)" />
                      <div style={{ height: 8 }} />
                      <label>New company</label>
                      <input name="newCompany" placeholder="New company (optional)" />
                      <div style={{ height: 10 }} />
                      <button className="btn" type="submit">Submit for review</button>
                      <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                        Goes to the admin queue. Record is not changed until approved.
                      </p>
                    </form>
                  </details>
                </div>
              </div>
            }
            history={
              <div className="grid2">
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Email history
                  </p>
                  <EmailHistory email={c.email ?? c.personal_email ?? null} />
                </div>
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Instantly history
                  </p>
                  <InstantlyHistory
                    email={c.email ?? c.personal_email ?? null}
                    enrolments={enrolments}
                  />
                </div>
              </div>
            }
            registration={
              <div>
                <form action={updateStatus} style={{ marginBottom: 18, maxWidth: 460 }}>
                  <input type="hidden" name="delegateId" value={d.id} />
                  <input type="hidden" name="return" value={ret} />
                  <label>Status</label>
                  <div className="detail-row">
                    <select name="stage" defaultValue={(d.stage ?? "identified").toLowerCase()}>
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" type="submit">Save</button>
                  </div>
                </form>

                <div style={{ borderTop: "1px solid var(--border)", margin: "20px 0 0", paddingTop: 8 }}>
                  <RegistrationForm d={d} ret={ret} />
                </div>

                {user.role === "admin" && (
                  <RemoveDelegateDialog delegateId={d.id} ret={ret} name={c.full_name_clean ?? "this delegate"} />
                )}
              </div>
            }
            background={<BriefView profile={profile} delegateId={d.id} ret={ret} />}
            activity={
              <div>
                <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
                  Every change made to this contact through the team apps — who, when, what. Newest first.
                </p>
                <ActivityList rows={activity} />
              </div>
            }
          />
        </div>
    </Shell>
  );
}
